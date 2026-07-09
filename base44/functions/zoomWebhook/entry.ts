import { createHmac } from 'node:crypto';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import OpenAI from 'npm:openai';

// ── Zoom OAuth: get a short-lived access token ──────────────────────────────
async function getZoomToken() {
  const clientId     = Deno.env.get("ZOOM_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");
  const accountId    = Deno.env.get("ZOOM_ACCOUNT_ID");
  const creds = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    { method: "POST", headers: { Authorization: `Basic ${creds}` } }
  );
  if (!res.ok) throw new Error("Zoom token error: " + await res.text());
  const data = await res.json();
  return data.access_token;
}

// ── Download Zoom recording audio as ArrayBuffer ─────────────────────────────
async function downloadRecording(downloadUrl, zoomToken) {
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${zoomToken}` }
  });
  if (!res.ok) throw new Error("Recording download failed: " + res.status);
  return await res.arrayBuffer();
}

// ── Transcribe audio via OpenAI Whisper ──────────────────────────────────────
async function transcribeAudio(audioBuffer, openai) {
  const blob = new Blob([audioBuffer], { type: "audio/mp4" });
  const file = new File([blob], "recording.mp4", { type: "audio/mp4" });
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  return transcription.text || "";
}

// ── AI analysis of the transcript ────────────────────────────────────────────
async function analyzeTranscript(transcript, callDirection, userList, openai) {
  const teamEntries = userList.map(u => `"${u.full_name}"`).join("\n");
  const prompt = `You are an AI analyzing a phone call transcript for a veterinary clinic / pet boarding / doggie daycare facility.

TRANSCRIPT:
${transcript}

CALL DIRECTION: ${callDirection}

${teamEntries ? `KNOWN STAFF MEMBERS:\n${teamEntries}\n\nNotes:\n- "Caroline", "Dr. Cofer", or "Dr. Caroline Cofer" refers to Caroline Cofer.\n- "Ariana" or "Arianna" almost certainly refers to Aryana — use the closest match from the list above.` : ""}

Return a JSON object with these fields:
- team_member: string or null
  RULES: For inbound: the staff member who ANSWERED (first staff name mentioned, e.g. "this is Sarah"). For outbound: the staff member who MADE the call (they introduce themselves). Match to KNOWN STAFF MEMBERS exactly. If they do not say their name, return null. Never assign Caroline/Dr. Cofer.
- caller_name: string or null (the customer/external caller's name)
- caller_phone: string or null
- caller_type: "potential_client" | "returning_client" | "not_applicable"
  For inbound: classify the caller. For outbound: classify the RECEIVER (external person called), not the staff member.
- caller_intent: string (1-sentence summary of why they called)
- bookable: "yes" | "no" | "unclear"
- booking_outcome: "appt_booked" | "appt_not_booked" | "appt_not_needed"
  NOTE: Use "appt_not_needed" for voicemails or appointment confirmations. "appt_not_booked" only when we spoke live and failed to book.
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

// ── Append a row to Google Sheet ──────────────────────────────────────────────
async function appendToSheet(sheetData, accessToken, spreadsheetId) {
  const { rowValues, sheetName } = sheetData;
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
  // Extract the row number that was written
  const updatedRange = data.updates?.updatedRange || "";
  const match = updatedRange.match(/(\d+)$/);
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

// ── Main webhook handler ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const bodyText = await req.text();
    let body;
    try { body = JSON.parse(bodyText); } catch { return Response.json({ received: true }); }

    // Handle Zoom URL validation challenge
    if (body.event === "endpoint.url_validation") {
      const secret = Deno.env.get("ZOOM_WEBHOOK_SECRET");
      if (!secret) return Response.json({ error: "Webhook secret not configured" }, { status: 500 });
      const plainToken = body.payload?.plainToken;
      if (!plainToken) return Response.json({ error: "No plainToken" }, { status: 400 });
      const hash = createHmac("sha256", secret).update(plainToken).digest("hex");
      return Response.json({ plainToken, encryptedToken: hash });
    }

    // Only process recording.completed events
    if (body.event !== "recording.completed") {
      return Response.json({ received: true, skipped: `event=${body.event}` });
    }

    const payload   = body.payload?.object || {};
    const meetingId = String(payload.id || payload.uuid || "");
    const topic     = payload.topic || "";
    const startTime = payload.start_time || new Date().toISOString();
    const duration  = payload.duration || 0; // minutes

    // Find the audio recording file (prefer M4A, fallback to MP4)
    const files = payload.recording_files || [];
    const audioFile = files.find(f => f.file_type === "M4A" && f.status === "completed")
                   || files.find(f => f.file_type === "MP4" && f.status === "completed")
                   || files.find(f => f.status === "completed");

    if (!audioFile?.download_url) {
      return Response.json({ received: true, skipped: "no audio file found" });
    }

    // Initialize clients
    const base44 = createClientFromRequest(req);
    const openai  = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

    const [zoomToken, sheetsConn, userList] = await Promise.all([
      getZoomToken(),
      base44.asServiceRole.connectors.getConnection("googlesheets"),
      base44.asServiceRole.entities.User.list(),
    ]);

    const { accessToken: sheetsToken } = sheetsConn;
    const spreadsheetId = Deno.env.get("GOOGLE_SHEET_ID");

    console.log(`[INFO] Processing recording for meeting ${meetingId} - ${topic}`);

    // Download and transcribe
    const audioBuffer = await downloadRecording(audioFile.download_url, zoomToken);
    console.log(`[INFO] Downloaded audio: ${audioBuffer.byteLength} bytes`);

    const transcript = await transcribeAudio(audioBuffer, openai);
    console.log(`[INFO] Transcript length: ${transcript.length} chars`);

    // Determine call direction from topic or default inbound
    const callDirection = topic.toLowerCase().includes("outbound") ? "outbound" : "inbound";

    // AI analysis
    const analysis = await analyzeTranscript(transcript, callDirection, userList, openai);
    console.log(`[INFO] Analysis complete: ${JSON.stringify(analysis).substring(0, 200)}`);

    // Build sheet row:
    // A: Date | B: Duration (min) | C: Direction | D: Caller Name | E: Caller Phone
    // F: Team Member | G: Caller Type | H: Booking Outcome | I: Summary | J: AI Notes
    const sheetName = await getSheetName(spreadsheetId, sheetsToken);
    const rowValues = [
      new Date(startTime).toLocaleString("en-US", { timeZone: "America/New_York" }),
      duration,
      callDirection,
      analysis.caller_name || "",
      analysis.caller_phone || "",
      analysis.team_member || "",
      analysis.caller_type || "not_applicable",
      analysis.booking_outcome || "appt_not_booked",
      analysis.transcript_summary || "",
      analysis.ai_notes || "",
    ];

    const sheetRowNumber = await appendToSheet({ rowValues, sheetName }, sheetsToken, spreadsheetId);
    console.log(`[INFO] Appended to sheet row: ${sheetRowNumber}`);

    // Missed call: inbound where no team member spoke (no one at the clinic answered)
    const missed_call = callDirection === "inbound" && !analysis.team_member;

    // Save CallRecord to DB
    const zoom_meeting_id = sheetRowNumber ? `sheet_row_${sheetRowNumber}` : meetingId;
    await base44.asServiceRole.entities.CallRecord.create({
      zoom_meeting_id,
      call_date: startTime,
      call_duration_seconds: duration * 60,
      call_direction: callDirection,
      caller_phone: analysis.caller_phone || null,
      caller_name: analysis.caller_name || null,
      team_member: missed_call ? null : (analysis.team_member || null),
      transcript,
      transcript_summary: analysis.transcript_summary || null,
      recording_url: audioFile.play_url || audioFile.download_url || null,
      caller_type: missed_call ? "not_applicable" : (analysis.caller_type || "not_applicable"),
      caller_intent: missed_call ? null : (analysis.caller_intent || null),
      bookable: missed_call ? "no" : (analysis.bookable || "unclear"),
      booking_outcome: analysis.booking_outcome || "appt_not_booked",
      was_booked: analysis.booking_outcome === "appt_booked",
      booked_date: analysis.booked_date || null,
      ai_notes: analysis.ai_notes || null,
      missed_call,
      status: "pending_review",
    });

    return Response.json({ received: true, meetingId, sheetRow: sheetRowNumber, transcript_length: transcript.length });
  } catch (error) {
    console.error("[ERROR]", error.message);
    // Always return 200 to Zoom so it doesn't retry
    return Response.json({ received: true, error: error.message });
  }
});