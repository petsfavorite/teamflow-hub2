import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { sendCallLogErrorEmail } from '../../shared/callLogErrorNotify.ts';

// ZOOM DIRECT PULL — imports Zoom Phone calls straight from Zoom's API into CallRecord,
// with no Google Sheet in the middle. Like scheduledSheetSync it does NO AI work: records
// are created with ai_enriched=false and enrichCallRecords analyzes them separately.
//
// It is safe to run alongside the sheet sync: every call is de-duplicated by Zoom call ID
// AND by a phone/time fingerprint (the sheet path may have imported the same call under a
// different ID format). Each run looks back 3 days, so an outage heals itself.

const LOOKBACK_DAYS = 3;
const MIN_DURATION_SECONDS = 30;
const MIN_AGE_MINUTES = 15;      // give the sheet path / Zoom transcript a head start
const MAX_NEW_PER_RUN = 25;      // keep each run inside the function time limit
const MAX_TRANSCRIPT_RETRIES = 10;
const STALE_HOURS = 3;

// ── Zoom OAuth (Server-to-Server) ─────────────────────────────────────────────
async function getZoomToken() {
  const clientId = Deno.env.get("ZOOM_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");
  const accountId = Deno.env.get("ZOOM_ACCOUNT_ID");
  if (!clientId || !clientSecret || !accountId) {
    throw new Error("Missing Zoom credentials (ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET or ZOOM_ACCOUNT_ID)");
  }
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    { method: "POST", headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, "Content-Type": "application/x-www-form-urlencoded" } }
  );
  if (!res.ok) throw new Error(`Zoom OAuth failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

async function fetchCallLogs(zoomToken, from, to) {
  const logs = [];
  let nextPageToken = "";
  do {
    const params = new URLSearchParams({ from, to, page_size: "300" });
    if (nextPageToken) params.set("next_page_token", nextPageToken);
    const res = await fetch(`https://api.zoom.us/v2/phone/call_logs?${params}`, {
      headers: { Authorization: `Bearer ${zoomToken}` },
    });
    if (!res.ok) throw new Error(`Zoom call logs error (${res.status}): ${await res.text()}`);
    const data = await res.json();
    logs.push(...(data.call_logs || []));
    nextPageToken = data.next_page_token || "";
  } while (nextPageToken);
  return logs;
}

// Returns transcript text with "Speaker: text" lines, or null if none is available yet.
async function fetchTranscript(recordingId, zoomToken) {
  if (!recordingId) return null;
  const res = await fetch(`https://api.zoom.us/v2/phone/recording_transcript/download/${recordingId}`, {
    headers: { Authorization: `Bearer ${zoomToken}` },
    redirect: "follow",
  });
  // 404 = transcript not ready yet; anything else is a real problem worth surfacing.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Transcript download failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  let data;
  try { data = JSON.parse(await res.text()); } catch { return null; }
  const timeline = data?.timeline || [];
  const lines = [];
  let lastSpeaker = null;
  for (const t of timeline) {
    const text = (t.text || t.raw_text || "").trim();
    if (!text) continue;
    const u = t.users?.[0];
    const speaker = u?.username || u?.name || t.username || t.speaker || "Speaker";
    if (speaker === lastSpeaker && lines.length) lines[lines.length - 1] += ` ${text}`;
    else lines.push(`${speaker}: ${text}`);
    lastSpeaker = speaker;
  }
  return lines.length ? lines.join("\n") : null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const digits = (s) => String(s || "").replace(/\D/g, "").slice(-10);

function classify(log) {
  const direction = String(log.direction || "").toLowerCase().startsWith("out") ? "outbound" : "inbound";
  const result = String(log.result || log.call_result || "").toLowerCase();
  const answered = /answer|connect/.test(result) && !/not[_ ]?answer|no answer/.test(result);
  const voicemail = /voicemail/.test(result) || log.has_voicemail === true;
  // An inbound call nobody answered (abandoned, hang up, missed, voicemail) is a missed call.
  const missed = direction === "inbound" && (!answered || voicemail);
  return { direction, missed };
}

function isBusinessHoursET() {
  const et = new Date().toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", hour12: false });
  const isWeekday = !/^(Sat|Sun)/.test(et);
  const hour = parseInt(et.replace(/\D/g, ""), 10);
  return isWeekday && hour >= 9 && hour < 17;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    let zoomToken;
    try {
      zoomToken = await getZoomToken();
    } catch (err) {
      await sendCallLogErrorEmail(base44,
        "Zoom Connection Error",
        `The app could not sign in to Zoom to pull calls.\n\nError: ${err.message}\n\nCheck the Zoom app credentials (ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_ACCOUNT_ID) and that the Zoom app is still activated. New calls will not be imported until this is fixed.`
      );
      return Response.json({ error: err.message }, { status: 500 });
    }

    const now = Date.now();
    const from = new Date(now - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);
    const to = new Date(now).toISOString().slice(0, 10);

    let logs;
    try {
      logs = await fetchCallLogs(zoomToken, from, to);
    } catch (err) {
      await sendCallLogErrorEmail(base44,
        "Zoom Call Log Error",
        `The app signed in to Zoom but could not read Zoom Phone call logs.\n\nError: ${err.message}\n\nThis often means the Zoom app is missing the Zoom Phone call log scope, or Zoom is temporarily unavailable. New calls will not be imported until this is fixed.`
      );
      return Response.json({ error: err.message }, { status: 500 });
    }

    // Existing records in the window, by Zoom ID and by phone/time fingerprint.
    const windowStartIso = new Date(now - (LOOKBACK_DAYS + 1) * 86400000).toISOString();
    const existing = await base44.asServiceRole.entities.CallRecord.filter(
      { call_date: { $gte: windowStartIso } }, "-call_date", 3000
    );
    const byId = new Map(existing.map(r => [String(r.zoom_meeting_id), r]));
    const existingFingerprints = existing.map(r => ({
      t: new Date(r.call_date).getTime(), dir: r.call_direction, phone: digits(r.caller_phone),
    }));
    const alreadyImportedByOtherId = (t, dir, phone) =>
      existingFingerprints.some(f => f.dir === dir && f.phone === phone && Math.abs(f.t - t) <= 3 * 60000);

    // Oldest first, so a backlog is worked through in order across runs.
    logs.sort((a, b) => new Date(a.date_time) - new Date(b.date_time));

    const toCreate = [];
    let transcriptRetries = 0;
    let transcriptsFilled = 0;
    let skipped = 0;
    const errors = [];

    for (const log of logs) {
      const callId = String(log.id || log.call_id || "");
      if (!callId || !log.date_time) continue;
      const t = new Date(log.date_time).getTime();
      const duration = Number(log.duration || 0);
      const { direction, missed } = classify(log);
      const phone = digits(direction === "inbound" ? log.caller_number : (log.callee_number || log.callee_did_number));

      const have = byId.get(callId);
      if (have) {
        skipped++;
        // Transcript arrived after the first import: fill it in and re-queue for AI.
        if (!(have.transcript || "").trim() && log.recording_id && transcriptRetries < MAX_TRANSCRIPT_RETRIES) {
          transcriptRetries++;
          try {
            const transcript = await fetchTranscript(log.recording_id, zoomToken);
            if (transcript) {
              await base44.asServiceRole.entities.CallRecord.update(have.id, { transcript, ai_enriched: false, enrich_attempts: 0 });
              transcriptsFilled++;
            }
          } catch (err) { errors.push(`transcript ${callId}: ${err.message}`); }
        }
        continue;
      }

      if (duration < MIN_DURATION_SECONDS) continue;                  // too short to matter
      if (now - t < MIN_AGE_MINUTES * 60000) continue;                // too fresh, next run
      if (alreadyImportedByOtherId(t, direction, phone)) { skipped++; continue; }
      if (toCreate.length >= MAX_NEW_PER_RUN) continue;               // rest go next run

      let transcript = null;
      try { transcript = await fetchTranscript(log.recording_id, zoomToken); }
      catch (err) { errors.push(`transcript ${callId}: ${err.message}`); }   // still import without it

      const name = direction === "inbound" ? log.caller_name : log.callee_name;
      const number = direction === "inbound" ? log.caller_number : (log.callee_number || log.callee_did_number);
      toCreate.push({
        zoom_meeting_id: callId,
        call_date: new Date(log.date_time).toISOString(),
        call_duration_seconds: duration,
        call_direction: direction,
        caller_phone: number ? String(number).trim() : null,
        caller_name: name ? String(name).trim() : null,
        transcript: transcript || null,
        zoom_recording_id: log.recording_id ? String(log.recording_id) : null,
        // Replaced with the Google Drive link once archiveCallRecordings saves the audio.
        recording_url: log.recording_id ? `https://zoom.us/recording/download/${log.recording_id}` : null,
        missed_call: missed,
        status: "pending_review",
        ai_enriched: false,
      });
    }

    let imported = 0;
    for (let i = 0; i < toCreate.length; i += 50) {
      const batch = toCreate.slice(i, i + 50);
      try {
        await base44.asServiceRole.entities.CallRecord.bulkCreate(batch);
        imported += batch.length;
      } catch (err) {
        errors.push(`create batch ${i}: ${err.message}`);
      }
    }

    if (errors.length > 0 && imported === 0 && toCreate.length > 0) {
      await sendCallLogErrorEmail(base44,
        "Zoom Call Import Failed",
        `Calls were fetched from Zoom but could not be saved.\n\nErrors:\n${errors.slice(0, 5).join("\n")}\n\nThe next run will retry them automatically.`
      );
    } else if (errors.some(e => /Transcript download failed \((401|403)/.test(e))) {
      await sendCallLogErrorEmail(base44,
        "Zoom Transcript Access Problem",
        `Zoom refused the transcript download.\n\nError: ${errors.find(e => e.startsWith("transcript"))}\n\nThe Zoom app probably needs the recording/transcript scope. Calls are still being imported, but without transcripts, so AI analysis cannot run on them.`
      );
    }

    // Health: newest call Zoom knows about (any length). Silence in business hours = trouble.
    const newestZoomCall = logs.length ? new Date(logs[logs.length - 1].date_time).toISOString() : null;
    const hoursSince = newestZoomCall ? (now - new Date(newestZoomCall).getTime()) / 3600000 : null;
    if (isBusinessHoursET() && (hoursSince === null || hoursSince > STALE_HOURS)) {
      await sendCallLogErrorEmail(base44,
        "Zoom Returned No Recent Calls",
        `Zoom Phone reported no calls in the last ${hoursSince === null ? `${LOOKBACK_DAYS} days` : hoursSince.toFixed(1) + " hours"} (newest: ${newestZoomCall || "none"}) during business hours. Either the phones are quiet, or the Zoom connection is not returning data.`
      );
    }

    const patch = { last_zoom_pull_at: new Date().toISOString() };
    if (newestZoomCall) patch.last_zoom_newest_call_date = newestZoomCall;
    const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
    if (settingsList?.[0]) await base44.asServiceRole.entities.AppSettings.update(settingsList[0].id, patch);
    else await base44.asServiceRole.entities.AppSettings.create({ key: "global", ...patch });

    return Response.json({
      from, to, zoomCalls: logs.length, imported, skipped, transcriptsFilled,
      newestZoomCall, errors: errors.slice(0, 5),
    });
  } catch (error) {
    await sendCallLogErrorEmail(base44,
      "Zoom Pull Unexpected Error",
      `The Zoom call pull hit an unexpected error.\n\nError: ${error.message}\n\nNew calls may not be imported until this is fixed.`
    );
    return Response.json({ error: error.message }, { status: 500 });
  }
});
