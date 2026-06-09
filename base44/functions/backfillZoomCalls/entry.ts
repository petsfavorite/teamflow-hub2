import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import OpenAI from 'npm:openai';

// ── Zoom OAuth token ──────────────────────────────────────────────────────────
async function getZoomToken() {
  const clientId     = Deno.env.get("ZOOM_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");
  const accountId    = Deno.env.get("ZOOM_ACCOUNT_ID");
  const creds = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    { method: "POST", headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" } }
  );
  if (!res.ok) throw new Error("Zoom token error: " + await res.text());
  return (await res.json()).access_token;
}

// ── Fetch all Zoom Phone call recordings for a date range (paginated) ────────
async function fetchAllRecordings(zoomToken, from, to) {
  const allRecordings = [];
  let nextPageToken = "";
  do {
    const params = new URLSearchParams({ from, to, page_size: "300" });
    if (nextPageToken) params.set("next_page_token", nextPageToken);
    const res = await fetch(
      `https://api.zoom.us/v2/phone/recordings?${params}`,
      { headers: { Authorization: `Bearer ${zoomToken}` } }
    );
    if (!res.ok) throw new Error("Zoom recordings list error: " + await res.text());
    const data = await res.json();
    allRecordings.push(...(data.recordings || []));
    nextPageToken = data.next_page_token || "";
  } while (nextPageToken);
  return allRecordings;
}

// ── Download audio ────────────────────────────────────────────────────────────
async function downloadRecording(downloadUrl, zoomToken) {
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${zoomToken}` }
  });
  if (!res.ok) throw new Error("Download failed: " + res.status);
  return await res.arrayBuffer();
}

// ── Transcribe via Whisper ────────────────────────────────────────────────────
async function transcribeAudio(audioBuffer, fileType, openai) {
  const mimeType = fileType === "M4A" ? "audio/mp4" : "video/mp4";
  const ext      = fileType === "M4A" ? "m4a" : "mp4";
  const blob = new Blob([audioBuffer], { type: mimeType });
  const file = new File([blob], `recording.${ext}`, { type: mimeType });
  const transcription = await openai.audio.transcriptions.create({ file, model: "whisper-1" });
  return transcription.text || "";
}

// ── AI analysis ───────────────────────────────────────────────────────────────
async function analyzeTranscript(transcript, callDirection, userList, openai) {
  const teamEntries = userList.map(u => `"${u.full_name}"`).join("\n");
  const prompt = `You are an AI analyzing a phone call transcript for a veterinary clinic / pet boarding / doggie daycare facility.

TRANSCRIPT:
${transcript}

CALL DIRECTION: ${callDirection}

${teamEntries ? `KNOWN STAFF MEMBERS:\n${teamEntries}\n\nTEAM MEMBER ATTRIBUTION RULES:\n- For OUTBOUND calls: team_member = null\n- For MISSED CALLS (no answer, voicemail): team_member = null\n- For INBOUND calls: identify the staff member who answered/spoke\n- MUST match exactly to a KNOWN STAFF MEMBER (case-insensitive OK)\n- Aliases: "Caroline", "Dr. Cofer", "Dr. Caroline Cofer" = "Caroline Cofer"; "Ariana" or "Arianna" = "Aryana"; "Rebecca" must refer to "Rebecca Evatt" (only Rebecca on staff)\n- If unsure or cannot determine: use "Please Check"\n- Return ONLY the exact full name from KNOWN STAFF MEMBERS, or null, or "Please Check"` : ""}

CALLER TYPE LOGIC:
- "existing_client": We have seen this animal/owner before at our clinic
- "potential_client": Wants a service we provide AND we have NOT seen them before
- "not_applicable": Sales call, asking for a service we don't provide (e.g., exotic animals we don't see), calling from another clinic, or voicemail

CLASSIFICATION RULES:
- NOT_APPLICABLE if: sales pitch, asking for species/services we don't offer (like exotics, wildlife, livestock), calling from another clinic, or it's a voicemail
- EXISTING_CLIENT if: they mention they've been here before, you recognize their pet's name, they reference past visits, or they have an established history
- POTENTIAL_CLIENT if: they want boarding, doggie daycare, or vet services, AND we have no prior relationship

Return JSON with these fields:
- team_member: string or null (must exist in KNOWN STAFF MEMBERS exactly, or null for outbound/missed calls, or "Please Check" if uncertain)
- caller_name: string or null
- caller_phone: string or null (10-digit phone or however it appears)
- callee_phone: string or null (clinic phone being called)
- caller_type: "existing_client" | "potential_client" | "not_applicable"
- caller_intent: string (1-sentence: what they're calling about)
- bookable: "yes" | "no" | "unclear" (could a booking realistically happen from this call?)
- booking_outcome: "appt_booked" | "appt_not_booked" | "appt_not_needed"
  NOTE: "appt_not_needed" for voicemails, wrong numbers, or confirmations. "appt_not_booked" only when we spoke live but failed to book.
- booked_date: "YYYY-MM-DDTHH:MM:00" if appt_booked, else null
- appointment_offered: boolean (was an appointment offered to them during the call, even if not booked?)
- transcript_summary: 2-3 sentence summary
- ai_notes: brief flags or follow-up notes

Return ONLY valid JSON, no markdown.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }
  });
  return JSON.parse(response.choices[0].message.content);
}

// ── Append row to Google Sheet ────────────────────────────────────────────────
async function appendToSheet(rowValues, sheetName, accessToken, spreadsheetId) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [rowValues] })
    }
  );
  if (!res.ok) throw new Error("Sheet append failed: " + await res.text());
  const data = await res.json();
  const match = (data.updates?.updatedRange || "").match(/(\d+)$/);
  return match ? parseInt(match[1]) : null;
}

// ── Get sheet name ────────────────────────────────────────────────────────────
async function getSheetName(spreadsheetId, accessToken) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return "Sheet1";
  const data = await res.json();
  return data.sheets?.[0]?.properties?.title || "Sheet1";
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const from       = body.from       || "2026-04-01";
    const to         = body.to         || new Date().toISOString().slice(0, 10);
    const batchSize  = body.batch_size || 5;

    console.log(`[INFO] Backfilling Zoom recordings from ${from} to ${to}, batch_size=${batchSize}`);

    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
    const [zoomToken, sheetsConn, userList] = await Promise.all([
      getZoomToken(),
      base44.asServiceRole.connectors.getConnection("googlesheets"),
      base44.asServiceRole.entities.User.list(),
    ]);
    const { accessToken: sheetsToken } = sheetsConn;
    const spreadsheetId = Deno.env.get("GOOGLE_SHEET_ID");

    // Get existing meeting IDs so we don't duplicate
    const existingRecords = await base44.asServiceRole.entities.CallRecord.list('-created_date', 5000);
    const existingMeetingIds = new Set(existingRecords.map(r => String(r.zoom_meeting_id)));

    const allRecordings = await fetchAllRecordings(zoomToken, from, to);
    console.log(`[INFO] Found ${allRecordings.length} Zoom Phone recordings`);

    // Filter to only unprocessed recordings with a download URL
    const pending = allRecordings.filter(m => m.download_url && !existingMeetingIds.has(String(m.id)));
    console.log(`[INFO] ${pending.length} unprocessed recordings remaining`);

    const sheetName = await getSheetName(spreadsheetId, sheetsToken);

    let processed = 0;
    let skipped   = allRecordings.length - pending.length;
    const errors  = [];

    // Process only up to batchSize recordings per call
    const batch = pending.slice(0, batchSize);

    for (const meeting of batch) {
      const meetingId = String(meeting.id);
      try {
        const audioBuffer = await downloadRecording(meeting.download_url, zoomToken);
        const transcript  = await transcribeAudio(audioBuffer, "M4A", openai);

        const callDirection = meeting.direction === "outbound" ? "outbound" : "inbound";
        const startTime     = meeting.start_time;
        if (!startTime) throw new Error("Call has no start_time");
        const duration      = Math.round((meeting.duration || 0) / 60); // seconds -> minutes

        const analysis = await analyzeTranscript(transcript, callDirection, userList, openai);

        // Append to sheet (headers: Date, Inbound/Outbound, Caller, Callee, Answered By, Booking Status, Team Member, Caller Type, Booking Outcome)
        const callDate = new Date(startTime);
        const dateStr = callDate.toLocaleDateString("en-US", { timeZone: "America/New_York" });
        const timeStr = callDate.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });
        const rowValues = [
          `${dateStr} ${timeStr}`,
          callDirection,
          analysis.caller_phone || "",
          analysis.callee_phone || "",
          analysis.team_member  || "",
          analysis.bookable || "unclear",
          analysis.caller_type  || "not_applicable",
          analysis.booking_outcome || "appt_not_booked",
          analysis.appointment_offered ? "yes" : "no",
        ];
        const sheetRowNumber = await appendToSheet(rowValues, sheetName, sheetsToken, spreadsheetId);

        // Save to DB
        const zoom_meeting_id = sheetRowNumber ? `sheet_row_${sheetRowNumber}` : meetingId;
        await base44.asServiceRole.entities.CallRecord.create({
          zoom_meeting_id,
          call_date: startTime,
          call_duration_seconds: duration * 60,
          call_direction: callDirection,
          caller_phone: analysis.caller_phone || null,
          caller_name:  analysis.caller_name  || null,
          team_member:  analysis.team_member  || null,
          transcript,
          transcript_summary: analysis.transcript_summary || null,
          recording_url: meeting.download_url || null,
          caller_type:   analysis.caller_type   || "not_applicable",
          caller_intent: analysis.caller_intent || null,
          bookable:      analysis.bookable       || "unclear",
          booking_outcome: analysis.booking_outcome || "appt_not_booked",
          was_booked: analysis.booking_outcome === "appt_booked",
          booked_date: analysis.booked_date || null,
          ai_notes: analysis.ai_notes || null,
          status: "pending_review",
        });

        processed++;
        console.log(`[INFO] Processed recording ${meetingId} (${startTime})`);

        // Throttle to avoid rate limits
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`[ERROR] Recording ${meetingId}: ${err.message}`);
        errors.push(`${meetingId}: ${err.message}`);
      }
    }

    const remaining = pending.length - batch.length;
    return Response.json({
      processed,
      skipped,
      errors: errors.slice(0, 20),
      total: allRecordings.length,
      remaining,
      done: remaining === 0,
    });
  } catch (error) {
    console.error("[ERROR]", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});