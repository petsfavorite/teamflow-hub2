import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';
import OpenAI from 'npm:openai';
import { fuzzyMatchUser, aiNotesIndicatesMissed } from '../../shared/staffMatching.ts';
import { analyzeCall, checkBookingOffered, buildExtraAliases } from '../../shared/callAnalysis.ts';

function extractRecordingUrl(rawLink) {
  if (!rawLink) return null;
  const trimmed = String(rawLink).trim();
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed);
      return obj.webViewLink || obj.webContentLink || obj.url || null;
    } catch { return null; }
  }
  if (trimmed.startsWith("http")) return trimmed;
  return null;
}

// Flexible audio-link column detection — matches common header variations
const AUDIO_LINK_HEADERS = [
  "audio link", "recording link", "recording url", "audio url",
  "call audio", "audio", "recording", "link to audio", "audio file",
  "call recording", "recording link url", "audio recording", "call audio link",
];

function findAudioLinkHeader(headers) {
  return headers.find(h => {
    if (!h || !h.trim()) return false;
    const lower = h.trim().toLowerCase();
    return AUDIO_LINK_HEADERS.some(ah => lower === ah);
  });
}

// Returns the Eastern timezone offset in ms to ADD to a "local-as-UTC" timestamp
// to get the correct UTC time. EDT (Mar–early Nov) = +4h, EST = +5h.
function easternOffsetMs(msFromEpoch) {
  const d = new Date(msFromEpoch);
  const year = d.getUTCFullYear();
  const dstStart = new Date(Date.UTC(year, 2, 8, 2, 0, 0));
  while (dstStart.getUTCDay() !== 0) dstStart.setUTCDate(dstStart.getUTCDate() + 1);
  const dstEnd = new Date(Date.UTC(year, 10, 1, 2, 0, 0));
  while (dstEnd.getUTCDay() !== 0) dstEnd.setUTCDate(dstEnd.getUTCDate() + 1);
  const isDST = msFromEpoch >= dstStart.getTime() && msFromEpoch < dstEnd.getTime();
  return isDST ? 4 * 3600 * 1000 : 5 * 3600 * 1000;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let connResult;
    try {
      connResult = await base44.asServiceRole.connectors.getConnection("googlesheets");
    } catch (connErr) {
      console.error("[ERROR] getConnection failed:", connErr.message);
      return Response.json({ error: "getConnection failed: " + connErr.message }, { status: 500 });
    }
    const { accessToken } = connResult;
    const spreadsheetId = Deno.env.get("GOOGLE_SHEET_ID");

    // --- Load settings (prompts + name aliases) ---
    const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
    const settings = settingsList?.[0] || null;
    const lastProcessedRow = settings?.last_synced_sheet_row || 1;
    const cdOpts = settings?.call_dashboard_options || {};
    const aiPrompts = {
      ai_caller_type_prompt: cdOpts.ai_caller_type_prompt || null,
      ai_booking_prompt: cdOpts.ai_booking_prompt || null,
    };
    const bookingOfferedPrompt = cdOpts.ai_booking_offered_prompt || null;
    const extraAliases = buildExtraAliases(cdOpts.name_aliases);

    // Only fetch rows we haven't seen yet (start from lastProcessedRow + 1)
    const startRow = lastProcessedRow + 1;
    const endRow = startRow + 49;

    // First, get the actual sheet name from spreadsheet metadata
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!metaRes.ok) {
      const err = await metaRes.text();
      return Response.json({ error: "metadata fetch failed: " + err }, { status: metaRes.status });
    }
    const metaJson = await metaRes.json();
    const sheetName = metaJson.sheets?.[0]?.properties?.title || "Sheet1";
    console.log(`[INFO] Using sheet name: "${sheetName}"`);

    const [headersRes, userList] = await Promise.all([
      fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${sheetName}!1:1`)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ),
      base44.asServiceRole.entities.User.list(),
    ]);

    if (!headersRes.ok) {
      const err = await headersRes.text();
      return Response.json({ error: err }, { status: headersRes.status });
    }

    const headersData = await headersRes.json();
    const headers = headersData.values?.[0] || [];
    if (!headers.length) return Response.json({ imported: 0, skipped: 0, remaining: 0 });

    // Detect the audio link column (if present)
    const audioLinkHeader = findAudioLinkHeader(headers);

    // Fetch the window of new rows
    const dataRange = `${sheetName}!${startRow}:${endRow}`;
    const dataRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(dataRange)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!dataRes.ok) {
      const err = await dataRes.text();
      return Response.json({ error: err }, { status: dataRes.status });
    }

    const dataJson = await dataRes.json();
    const rawRows = dataJson.values || [];

    console.log(`[INFO] Fetching range ${dataRange}, got ${rawRows.length} rows`);

    if (rawRows.length === 0) {
      return Response.json({ imported: 0, skipped: 0, remaining: 0, message: "No new rows found", debugRange: dataRange });
    }

    // Map rows to objects using actual sheet row numbers
    const records = rawRows.map((row, idx) => {
      const obj = { __rowIndex: startRow + idx };
      headers.forEach((h, i) => {
        if (h && h.trim()) obj[h.trim()] = row[i] ?? "";
      });
      return obj;
    });

    const rowsToProcess = records.filter(row => {
      const hasAnyData = Object.entries(row).some(([k, v]) => k !== '__rowIndex' && v !== '');
      if (!hasAnyData) return false;
      const phone = String(row["Caller Phone"] || row["Callee Phone"] || "").toLowerCase().trim();
      const teamMember = String(row["Team Member"] || "").trim();
      const transcript = String(row["Transcript"] || "").trim();
      const isAnonymousOnly = (phone === "anonymous" || phone === "") && !teamMember && !transcript;
      return !isAnonymousOnly;
    });
    const remaining = rawRows.length === 50 ? "possibly more" : 0;

    // Build a set of already-existing zoom_meeting_ids for this batch
    const zoomIds = rowsToProcess.map(r => `sheet_row_${r.__rowIndex}`);
    const existingCalls = await base44.asServiceRole.entities.CallRecord.filter({ zoom_meeting_id: { $in: zoomIds } });
    const existingIds = new Set(existingCalls.map(c => c.zoom_meeting_id));

    // Fetch recent Zoom-imported calls for cross-source dedup
    const weekAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const recentZoomCalls = await base44.asServiceRole.entities.CallRecord.filter({
      call_date: { $gte: weekAgo }
    }, "-call_date", 500);
    const zoomByDirection = {};
    for (const c of recentZoomCalls) {
      if (c.zoom_meeting_id && !c.zoom_meeting_id.startsWith("sheet_row_")) {
        const key = c.call_direction || "inbound";
        if (!zoomByDirection[key]) zoomByDirection[key] = [];
        zoomByDirection[key].push(new Date(c.call_date).getTime());
      }
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];
    let maxProcessedRow = lastProcessedRow;

    const recordsToCreate = [];
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

    for (const row of rowsToProcess) {
      if (existingIds.has(`sheet_row_${row.__rowIndex}`)) {
        skipped++;
        if (row.__rowIndex > maxProcessedRow) maxProcessedRow = row.__rowIndex;
        continue;
      }
      const directionRaw = String(
        row["Inbound/Outbound"] || row["Direction"] || row["Call Direction"] ||
        row["Call Type"] || row["Type"] || row["Incoming/Outgoing"] || ""
      ).toLowerCase().trim();
      const call_direction = directionRaw.startsWith("out") || directionRaw === "out" ? "outbound" : "inbound";
      const transcript = String(row["Transcript"] || "").trim();
      try {
        const callerPhoneField = String(row["Caller Phone"] || "");
        const calleePhoneField = String(row["Callee Phone"] || "");
        const rawPhone = call_direction === "inbound" ? callerPhoneField : calleePhoneField;
        const caller_phone = (rawPhone && rawPhone.toLowerCase() !== "anonymous") ? rawPhone : null;

        // Audio link from the detected column
        const recording_url = audioLinkHeader ? extractRecordingUrl(row[audioLinkHeader]) : null;

        // --- AI analysis of transcript (if available) ---
        let team_member_raw = null;
        let caller_type = "not_applicable";
        let booking_outcome = "appt_not_booked";
        let caller_name = null;
        let caller_intent = null;
        let bookable = "unclear";
        let transcript_summary = null;
        let ai_notes = null;
        let booked_date = null;
        let booking_offered = null;

        if (transcript) {
          const analysis = await analyzeCall(transcript, call_direction, userList, openai, aiPrompts);
          team_member_raw = analysis.team_member || null;
          caller_name = analysis.caller_name || null;
          caller_type = analysis.caller_type || "not_applicable";
          caller_intent = analysis.caller_intent || null;
          bookable = analysis.bookable || "unclear";
          booking_outcome = analysis.booking_outcome || "appt_not_booked";
          booked_date = analysis.booked_date || null;
          transcript_summary = analysis.transcript_summary || null;
          ai_notes = analysis.ai_notes || null;
        } else {
          // Fallback: read from columns when no transcript
          const callerTypeRaw = String(row["Caller Type"] || "").toLowerCase();
          if (callerTypeRaw.includes("potential") || callerTypeRaw.includes("new")) caller_type = "potential_client";
          else if (callerTypeRaw.includes("return") || callerTypeRaw.includes("existing")) caller_type = "returning_client";

          const bookingRaw = String(row["Booking Outcome"] || "").toLowerCase();
          if (bookingRaw.includes("booked") || bookingRaw.includes("scheduled") || bookingRaw.includes("yes")) booking_outcome = "appt_booked";
          else if (bookingRaw.includes("not needed") || bookingRaw.includes("n/a") || bookingRaw.includes("not applicable") || bookingRaw.includes("unsure")) booking_outcome = "appt_not_needed";
        }

        // Team member: AI raw name → fuzzy match with extra aliases
        let team_member = null;
        const teamMemberSource = team_member_raw || String(row["Team Member"] || "").trim();
        if (teamMemberSource && userList.length) {
          team_member = fuzzyMatchUser(teamMemberSource, userList, extraAliases);
        }

        // Missed call: inbound where no team member spoke, or AI flagged it
        const aiSaysMissed = aiNotesIndicatesMissed(ai_notes);
        const missed_call = call_direction === "inbound" && (!team_member || aiSaysMissed);
        if (missed_call) {
          team_member = null;
          caller_type = "not_applicable";
        }

        // Booking offered check (only for missed bookings)
        if (booking_outcome === "appt_not_booked" && !missed_call && transcript) {
          try {
            const offeredResult = await checkBookingOffered(transcript, openai, bookingOfferedPrompt);
            booking_offered = !!offeredResult.booking_offered;
          } catch (err) {
            console.error(`[WARN] booking offered check failed for row ${row.__rowIndex}: ${err.message}`);
          }
        }

        // Parse date
        let callDateISO = new Date().toISOString();
        const dateRaw = String(row["Date"] || "");
        if (dateRaw) {
          const serial = parseFloat(dateRaw);
          if (!isNaN(serial) && serial > 40000) {
            const msFromEpoch = (serial - 25569) * 86400 * 1000;
            callDateISO = new Date(msFromEpoch + easternOffsetMs(msFromEpoch)).toISOString();
          } else if (dateRaw.includes("/") || dateRaw.includes("-")) {
            const parsed = new Date(dateRaw);
            if (!isNaN(parsed)) callDateISO = parsed.toISOString();
          }
        }

        // Skip if this call was already imported from Zoom (same direction, within ±2 min)
        const callTimeMs = new Date(callDateISO).getTime();
        const zoomTimes = zoomByDirection[call_direction];
        if (zoomTimes && zoomTimes.some(t => Math.abs(t - callTimeMs) < 2 * 60 * 1000)) {
          skipped++;
          if (row.__rowIndex > maxProcessedRow) maxProcessedRow = row.__rowIndex;
          continue;
        }

        const zoom_meeting_id = `sheet_row_${row.__rowIndex}`;

        recordsToCreate.push({
          zoom_meeting_id,
          call_date: callDateISO,
          call_direction,
          caller_phone,
          caller_name,
          team_member,
          caller_type,
          caller_intent,
          bookable,
          booking_outcome,
          was_booked: booking_outcome === "appt_booked",
          booked_date,
          booking_offered,
          recording_url,
          transcript: transcript || null,
          transcript_summary,
          ai_notes,
          missed_call,
          status: "pending_review",
          __rowIndex: row.__rowIndex,
        });
      } catch (err) {
        errors.push(`Row ${row.__rowIndex}: ${err.message}`);
        skipped++;
      }
    }

    // Bulk-create in batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < recordsToCreate.length; i += BATCH_SIZE) {
      const batch = recordsToCreate.slice(i, i + BATCH_SIZE);
      const payloads = batch.map(({ __rowIndex, ...r }) => r);
      try {
        await base44.asServiceRole.entities.CallRecord.bulkCreate(payloads);
        imported += batch.length;
        const batchMax = Math.max(...batch.map(r => r.__rowIndex));
        if (batchMax > maxProcessedRow) maxProcessedRow = batchMax;
      } catch (err) {
        errors.push(`Batch ${i}-${i + BATCH_SIZE}: ${err.message}`);
        skipped += batch.length;
      }
    }

    // --- Save the high-water mark ---
    if (maxProcessedRow > lastProcessedRow) {
      const updateData = { last_synced_sheet_row: maxProcessedRow };
      if (settings?.id) {
        await base44.asServiceRole.entities.AppSettings.update(settings.id, updateData);
      } else {
        await base44.asServiceRole.entities.AppSettings.create({ key: "global", ...updateData });
      }
    }

    return Response.json({ imported, skipped, remaining, lastProcessedRow, maxProcessedRow, errors: errors.slice(0, 5) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});