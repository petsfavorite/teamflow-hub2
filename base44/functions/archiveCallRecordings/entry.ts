import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { sendCallLogErrorEmail } from '../../shared/callLogErrorNotify.ts';
import { requireAdminOnly } from '../../shared/auth.ts';

// RECORDING ARCHIVER — downloads call audio from Zoom Phone, stores it in a Google Drive
// folder, points the CallRecord's recording_url at the Drive copy, and permanently deletes
// Drive recordings older than RETENTION_DAYS (counted from the call date).
//
// Retention is enforced from Drive itself (file date), not from CallRecords, because call
// records are cleaned up on a different schedule and would otherwise orphan the audio.

const RETENTION_DAYS = 90;
const FOLDER_NAME = "Zoom Call Recordings";
const MAX_PER_RUN = 10;          // audio download + upload is the heavy part
const MAX_DELETES_PER_RUN = 100;
const MAX_ATTEMPTS = 10;
const LOOKBACK_DAYS = 4;
const STUCK_HOURS = 3;
const DRIVE = "https://www.googleapis.com/drive/v3";

async function getZoomToken() {
  const clientId = Deno.env.get("ZOOM_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");
  const accountId = Deno.env.get("ZOOM_ACCOUNT_ID");
  if (!clientId || !clientSecret || !accountId) throw new Error("Missing Zoom credentials");
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    { method: "POST", headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, "Content-Type": "application/x-www-form-urlencoded" } }
  );
  if (!res.ok) throw new Error(`Zoom OAuth failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

// Returns { buffer, contentType } or null if Zoom doesn't have the recording ready yet.
async function downloadRecording(recordingId, zoomToken) {
  let lastStatus = 0;
  for (const base of ["https://api.zoom.us/v2", "https://zoom.us/v2"]) {
    const res = await fetch(`${base}/phone/recording/download/${recordingId}`, {
      headers: { Authorization: `Bearer ${zoomToken}` },
      redirect: "follow",
    });
    lastStatus = res.status;
    if (res.ok) {
      return { buffer: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type") || "audio/mpeg" };
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Zoom refused the recording download (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
  }
  if (lastStatus === 404) return null;
  throw new Error(`Zoom recording download failed (${lastStatus})`);
}

async function driveJson(res, what) {
  if (!res.ok) throw new Error(`${what} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return await res.json();
}

async function ensureFolder(accessToken, base44, settings) {
  const auth = { Authorization: `Bearer ${accessToken}` };
  const savedId = settings?.recordings_drive_folder_id;
  if (savedId) {
    const res = await fetch(`${DRIVE}/files/${savedId}?fields=id,trashed`, { headers: auth });
    if (res.ok && !(await res.json()).trashed) return savedId;
  }
  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await driveJson(await fetch(`${DRIVE}/files?q=${q}&fields=files(id)`, { headers: auth }), "Drive folder search");
  let folderId = found.files?.[0]?.id;
  if (!folderId) {
    const created = await driveJson(await fetch(`${DRIVE}/files?fields=id`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
    }), "Drive folder create");
    folderId = created.id;
  }
  if (settings) await base44.asServiceRole.entities.AppSettings.update(settings.id, { recordings_drive_folder_id: folderId });
  else await base44.asServiceRole.entities.AppSettings.create({ key: "global", recordings_drive_folder_id: folderId });
  return folderId;
}

async function uploadToDrive(accessToken, folderId, name, contentType, bytes, createdTime) {
  const boundary = "zoomrec" + crypto.randomUUID();
  const enc = new TextEncoder();
  const meta = JSON.stringify({ name, parents: [folderId], mimeType: contentType, createdTime });
  const head = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`);
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0); body.set(bytes, head.length); body.set(tail, head.length + bytes.length);
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return await driveJson(res, "Drive upload");
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const { error: authError } = await requireAdminOnly(base44);
  if (authError) return authError;
  try {
    const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
    const settings = settingsList?.[0] || null;

    let driveToken;
    try {
      ({ accessToken: driveToken } = await base44.asServiceRole.connectors.getConnection("googledrive"));
    } catch (err) {
      await sendCallLogErrorEmail(base44,
        "Google Drive Connection Error",
        `The app could not connect to Google Drive to save call recordings.\n\nError: ${err.message}\n\nThe Google Drive connection probably needs to be re-authorized. Recordings will not be saved until this is fixed.`
      );
      return Response.json({ error: "drive connection failed: " + err.message }, { status: 500 });
    }

    const folderId = await ensureFolder(driveToken, base44, settings);

    // ── Retention: permanently delete recordings older than RETENTION_DAYS ──
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
    let deletedOld = 0;
    const oldQ = encodeURIComponent(`'${folderId}' in parents and createdTime < '${cutoff}' and trashed=false`);
    const oldFiles = await driveJson(await fetch(`${DRIVE}/files?q=${oldQ}&pageSize=${MAX_DELETES_PER_RUN}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${driveToken}` },
    }), "Drive retention listing");
    for (const f of oldFiles.files || []) {
      const del = await fetch(`${DRIVE}/files/${f.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${driveToken}` } });
      if (del.ok || del.status === 404) deletedOld++;
    }

    // ── Archive: recent records that have a Zoom recording but no Drive copy yet ──
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
    const recent = await base44.asServiceRole.entities.CallRecord.filter({ call_date: { $gte: since } }, "call_date", 1000);
    const todo = recent.filter(r => r.zoom_recording_id && !r.recording_drive_file_id && (r.recording_attempts || 0) < MAX_ATTEMPTS);

    let archived = 0, notReady = 0;
    const errors = [];
    if (todo.length > 0) {
      let zoomToken;
      try { zoomToken = await getZoomToken(); }
      catch (err) {
        await sendCallLogErrorEmail(base44, "Zoom Connection Error",
          `The recording archiver could not sign in to Zoom.\n\nError: ${err.message}`);
        return Response.json({ error: err.message, deletedOld }, { status: 500 });
      }

      for (const rec of todo.slice(0, MAX_PER_RUN)) {
        try {
          const audio = await downloadRecording(rec.zoom_recording_id, zoomToken);
          if (!audio) { notReady++; continue; }   // Zoom hasn't finished it yet; try next run
          const ext = /m4a|mp4/.test(audio.contentType) ? "m4a" : "mp3";
          const when = new Date(rec.call_date);
          // e.g. "2026-09-29_1913" (Eastern time)
          const stamp = when.toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 16).replace(" ", "_").replace(":", "");
          const name = `${stamp}_${rec.call_direction || "call"}_${rec.zoom_meeting_id}.${ext}`;
          const file = await uploadToDrive(driveToken, folderId, name, audio.contentType, audio.buffer, when.toISOString());
          await base44.asServiceRole.entities.CallRecord.update(rec.id, {
            recording_url: file.webViewLink,
            recording_drive_file_id: file.id,
          });
          archived++;
        } catch (err) {
          errors.push(`${rec.zoom_meeting_id}: ${err.message}`);
          try { await base44.asServiceRole.entities.CallRecord.update(rec.id, { recording_attempts: (rec.recording_attempts || 0) + 1 }); } catch { /* best effort */ }
        }
      }
    }

    // ── Alert if recordings are piling up unsaved ──
    const stuck = todo.filter(r => Date.now() - new Date(r.call_date).getTime() > STUCK_HOURS * 3600000).length;
    if (errors.length > 0 && archived === 0) {
      await sendCallLogErrorEmail(base44, "Recordings Not Saving to Drive",
        `Call recordings could not be saved to Google Drive.\n\nErrors:\n${errors.slice(0, 5).join("\n")}\n\nThis can mean the Zoom app lacks the recording download scope, or the Drive connection needs re-authorizing. Each recording is retried automatically.`);
    } else if (stuck > 0 && archived === 0 && notReady === 0) {
      await sendCallLogErrorEmail(base44, "Recordings Waiting to Save",
        `${stuck} call recording(s) older than ${STUCK_HOURS} hours have not been saved to Google Drive yet.`);
    }

    return Response.json({ folderId, archived, notReady, pending: todo.length, deletedOld, errors: errors.slice(0, 5) });
  } catch (error) {
    await sendCallLogErrorEmail(base44, "Recording Archive Unexpected Error",
      `The recording archiver hit an unexpected error.\n\nError: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});