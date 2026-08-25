import { createHmac } from 'node:crypto';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import OpenAI from 'npm:openai';
import { fuzzyMatchUser, aiNotesIndicatesMissed } from '../../shared/staffMatching.ts';
import { analyzeCall, checkBookingOffered, buildExtraAliases } from '../../shared/callAnalysis.ts';

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

    const [zoomToken, sheetsConn, userList, settingsList] = await Promise.all([
      getZoomToken(),
      base44.asServiceRole.connectors.getConnection("googlesheets"),
      base44.asServiceRole.entities.User.list(),
      base44.asServiceRole.entities.AppSettings.filter({ key: "global" }),
    ]);

    const { accessToken: sheetsToken } = sheetsConn;
    const spreadsheetId = Deno.env.get("GOOGLE_SHEET_ID");
    const cdOpts = settingsList?.[0]?.call_dashboard_options || {};
    const aiPrompts = {
      ai_caller_type_prompt: cdOpts.ai_caller_type_prompt || null,
      ai_booking_prompt: cdOpts.ai_booking_prompt || null,
    };
    const bookingOfferedPrompt = cdOpts.ai_booking_offered_prompt || null;
    const extraAliases = buildExtraAliases(cdOpts.name_aliases);

    console.log(`[INFO] Processing recording for meeting ${meetingId} - ${topic}`);

    // Download and transcribe
    const audioBuffer = await downloadRecording(audioFile.download_url, zoomToken);
    console.log(`[INFO] Downloaded audio: ${audioBuffer.byteLength} bytes`);

    const transcript = await transcribeAudio(audioBuffer, openai);
    console.log(`[INFO] Transcript length: ${transcript.length} chars`);

    // Determine call direction from topic or default inbound
    const callDirection = topic.toLowerCase().includes("outbound") ? "outbound" : "inbound";

    // AI analysis (using configurable prompts)
    const analysis = await analyzeCall(transcript, callDirection, userList, openai, aiPrompts);
    console.log(`[INFO] Analysis complete: ${JSON.stringify(analysis).substring(0, 200)}`);

    // Booking offered check (only for missed bookings)
    let booking_offered = null;
    if (analysis.booking_outcome === "appt_not_booked" && transcript) {
      try {
        const offeredResult = await checkBookingOffered(transcript, openai, bookingOfferedPrompt);
        booking_offered = !!offeredResult.booking_offered;
      } catch (err) {
        console.error(`[WARN] booking offered check failed: ${err.message}`);
      }
    }

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

    // Missed call: inbound where no team member spoke (no one at the clinic answered),
    // or the AI explicitly flagged it as a missed call in ai_notes.
    const aiSaysMissed = aiNotesIndicatesMissed(analysis.ai_notes);
    const teamMember = fuzzyMatchUser(analysis.team_member, userList, extraAliases);
    const missed_call = callDirection === "inbound" && (!teamMember || aiSaysMissed);

    // Save CallRecord to DB
    const zoom_meeting_id = sheetRowNumber ? `sheet_row_${sheetRowNumber}` : meetingId;
    await base44.asServiceRole.entities.CallRecord.create({
      zoom_meeting_id,
      call_date: startTime,
      call_duration_seconds: duration * 60,
      call_direction: callDirection,
      caller_phone: analysis.caller_phone || null,
      caller_name: analysis.caller_name || null,
      team_member: missed_call ? null : teamMember,
      transcript,
      transcript_summary: analysis.transcript_summary || null,
      caller_type: missed_call ? "not_applicable" : (analysis.caller_type || "not_applicable"),
      caller_intent: missed_call ? null : (analysis.caller_intent || null),
      bookable: missed_call ? "no" : (analysis.bookable || "unclear"),
      booking_outcome: analysis.booking_outcome || "appt_not_booked",
      was_booked: analysis.booking_outcome === "appt_booked",
      booked_date: analysis.booked_date || null,
      booking_offered: missed_call ? null : booking_offered,
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