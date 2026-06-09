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

// ── Fetch all cloud recordings for a date range (paginated) ───────────────────
async function fetchAllRecordings(zoomToken, from, to) {
  const allMeetings = [];
  let nextPageToken = "";
  do {
    const params = new URLSearchParams({ from, to, page_size: "300" });
    if (nextPageToken) params.set("next_page_token", nextPageToken);
    const res = await fetch(
      `https://api.zoom.us/v2/accounts/me/recordings?${params}`,
      { headers: { Authorization: `Bearer ${zoomToken}` } }
    );
    if (!res.ok) throw new Error("Zoom recordings list error: " + await res.text());
    const data = await res.json();
    allMeetings.push(...(data.meetings || []));
    nextPageToken = data.next_page_token || "";
  } while (nextPageToken);
  return allMeetings;
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

${teamEntries ? `KNOWN STAFF MEMBERS:\n${teamEntries}\n\nNotes:\n- "Caroline", "Dr. Cofer", or "Dr. Caroline Cofer" refers to Caroline Cofer.\n- "Ariana" or "Arianna" almost certainly refers to Aryana.` : ""}

Return JSON with these fields:
- team_member: string or null (null if outbound; for inbound, first staff member who introduces themselves — match to KNOWN STAFF MEMBERS)
- caller_name: string or null
- caller_phone: string or null
- caller_type: "potential_client" | "returning_client" | "not_applicable"
- caller_intent: string (1-sentence)
- bookable: "yes" | "no" | "unclear"
- booking_outcome: "appt_booked" | "appt_not_booked" | "appt_not_needed"
  NOTE: "appt_not_needed" for voicemails or appointment confirmations. "appt_not_booked" only when we spoke live and failed to book.
- booked_date: "YYYY-MM-DDTHH:MM:00" if appt_booked, else null
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

    const from = "2026-04-01";
    const to   = new Date().toISOString().slice(0, 10);

    console.log(`[INFO] Backfilling Zoom recordings from ${from} to ${to}`);

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

    const meetings = await fetchAllRecordings(zoomToken, from, to);
    console.log(`[INFO] Found ${meetings.length} meetings in Zoom`);

    const sheetName = await getSheetName(spreadsheetId, sheetsToken);

    let processed = 0;
    let skipped   = 0;
    const errors  = [];

    for (const meeting of meetings) {
      const meetingId = String(meeting.uuid || meeting.id);

      // Skip if already imported
      if (existingMeetingIds.has(meetingId)) {
        skipped++;
        continue;
      }

      const files = meeting.recording_files || [];
      const audioFile = files.find(f => f.file_type === "M4A" && f.status === "completed")
                     || files.find(f => f.file_type === "MP4" && f.status === "completed")
                     || files.find(f => f.status === "completed");

      if (!audioFile?.download_url) {
        skipped++;
        continue;
      }

      try {
        const audioBuffer = await downloadRecording(audioFile.download_url, zoomToken);
        const fileType    = audioFile.file_type || "MP4";
        const transcript  = await transcribeAudio(audioBuffer, fileType, openai);

        const topic         = meeting.topic || "";
        const callDirection = topic.toLowerCase().includes("outbound") ? "outbound" : "inbound";
        const startTime     = meeting.start_time || new Date().toISOString();
        const duration      = meeting.duration || 0; // minutes

        const analysis = await analyzeTranscript(transcript, callDirection, userList, openai);

        // Append to sheet
        const rowValues = [
          new Date(startTime).toLocaleString("en-US", { timeZone: "America/New_York" }),
          duration,
          callDirection,
          analysis.caller_name  || "",
          analysis.caller_phone || "",
          analysis.team_member  || "",
          analysis.caller_type  || "not_applicable",
          analysis.booking_outcome || "appt_not_booked",
          analysis.transcript_summary || "",
          analysis.ai_notes || "",
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
          recording_url: audioFile.play_url || audioFile.download_url || null,
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
        console.log(`[INFO] Processed ${processed}: ${topic} (${startTime})`);

        // Throttle to avoid rate limits
        await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        console.error(`[ERROR] Meeting ${meetingId}: ${err.message}`);
        errors.push(`${meetingId}: ${err.message}`);
      }
    }

    return Response.json({ processed, skipped, errors: errors.slice(0, 20), total: meetings.length });
  } catch (error) {
    console.error("[ERROR]", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});