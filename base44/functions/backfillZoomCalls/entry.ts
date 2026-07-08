import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import OpenAI from 'npm:openai';

// ── Zoom OAuth token ──────────────────────────────────────────────────────────
async function getZoomToken() {
  const clientId     = Deno.env.get("ZOOM_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");
  const accountId    = Deno.env.get("ZOOM_ACCOUNT_ID");
  
  if (!clientId || !clientSecret || !accountId) {
    throw new Error("Missing Zoom credentials (ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, or ZOOM_ACCOUNT_ID)");
  }
  
  const creds = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    { method: "POST", headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" } }
  );
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Zoom OAuth failed (${res.status}): ${errorText}`);
  }
  const data = await res.json();
  return data.access_token;
}

// ── Fetch all Zoom Phone call logs for a date range (paginated) ────────
async function fetchAllCallLogs(zoomToken, from, to) {
  const allCalls = [];
  let nextPageToken = "";
  do {
    const params = new URLSearchParams({ from, to, page_size: "300" });
    if (nextPageToken) params.set("next_page_token", nextPageToken);
    const res = await fetch(
      `https://api.zoom.us/v2/phone/call_logs?${params}`,
      { headers: { Authorization: `Bearer ${zoomToken}` } }
    );
    if (!res.ok) throw new Error("Zoom call logs error: " + await res.text());
    const data = await res.json();
    allCalls.push(...(data.call_logs || []));
    nextPageToken = data.next_page_token || "";
  } while (nextPageToken);
  return allCalls;
}

// ── Fetch Zoom Phone transcript (302 redirect → JSON timeline) ───────────────
async function getRecordingTranscript(recordingId, zoomToken) {
  if (!recordingId) {
    console.warn(`[WARN] No recording_id — skipping transcript`);
    return null;
  }

  try {
    // Correct endpoint: /phone/recording_transcript/download/{recordingId}
    // Returns 302 redirect to a JSON file
    const res = await fetch(
      `https://api.zoom.us/v2/phone/recording_transcript/download/${recordingId}`,
      {
        headers: { Authorization: `Bearer ${zoomToken}` },
        redirect: "follow"
      }
    );

    if (!res.ok) {
      const body = await res.text();
      console.warn(`[WARN] Transcript download ${res.status} for ${recordingId}: ${body}`);
      return null;
    }

    const contentType = res.headers.get("content-type") || "";
    let transcriptData;
    if (contentType.includes("application/json") || contentType.includes("text/plain")) {
      transcriptData = await res.json();
    } else {
      // Try JSON parse anyway
      const raw = await res.text();
      try { transcriptData = JSON.parse(raw); } catch { 
        console.warn(`[WARN] Unexpected transcript format for ${recordingId}: ${raw.slice(0, 200)}`);
        return null;
      }
    }

    // Parse timeline array into plain text
    const timeline = transcriptData?.timeline || [];
    if (timeline.length === 0) {
      console.warn(`[WARN] Empty timeline for ${recordingId}`);
      return null;
    }

    const text = timeline.map(t => t.text || t.raw_text || "").filter(Boolean).join(" ");
    console.log(`[INFO] Got Zoom transcript for ${recordingId} — ${timeline.length} segments, ${text.length} chars`);
    return text || null;
  } catch (err) {
    console.warn(`[WARN] Transcript fetch failed for ${recordingId}: ${err.message}`);
    return null;
  }
}


// ── Nickname → first name fragment aliases (shared by both resolve functions) ──
// Keys are lowercase nickname variants; values are the canonical first name (lowercase)
// that should match a user's full_name.split(" ")[0].toLowerCase()
const NICKNAME_ALIASES = {
  // Rebecca Evatt
  "becca": "rebecca", "becky": "rebecca", "bec": "rebecca",
  // Aryana Vizcano
  "arianna": "aryana", "ariana": "aryana", "ary": "aryana", "anna": "aryana",
  // Amanda Sandor
  "mandy": "amanda", "aman": "amanda",
  // Katie DeJesus
  "kate": "katie", "katelyn": "katie", "kaitlyn": "katie", "caitlin": "katie",
  // Jen Rising
  "jennifer": "jen", "jenny": "jen",
  // Skye Means
  "sky": "skye",
  // Hailey Laughter
  "haley": "hailey", "hayley": "hailey",
};

// Caroline is the vet — mentioned on calls but never the answerer
const NEVER_ASSIGN_AS_ANSWERER = ["caroline", "dr cofer", "dr. cofer", "dr caroline", "dr. caroline"];

function resolveStaffName(rawName, userList) {
  if (!rawName || rawName === "null" || rawName === "Please Check") return null;
  let key = rawName.toLowerCase().trim().replace(/\s+/g, " ");

  // Hard block: never assign Caroline as answerer
  if (NEVER_ASSIGN_AS_ANSWERER.some(blocked => key === blocked || key.includes(blocked))) return null;

  // Normalize nickname to canonical first name
  const normalized = NICKNAME_ALIASES[key] || key;

  if (userList && userList.length) {
    // 1. Exact full name
    const exact = userList.find(u => u.full_name.toLowerCase() === normalized);
    if (exact) return exact.full_name;

    // 2. First name match (after nickname normalization)
    const firstMatch = userList.find(u => u.full_name.toLowerCase().split(" ")[0] === normalized);
    if (firstMatch) return firstMatch.full_name;

    // 3. Word boundary match in full name
    const wordMatch = userList.find(u => u.full_name.toLowerCase().split(" ").some(w => w === normalized));
    if (wordMatch) return wordMatch.full_name;
  }

  return null;
}

// ── AI analysis ───────────────────────────────────────────────────────────────
async function analyzeTranscript(transcript, callDirection, isMissedCall, openai, userList) {
  const staffLines = userList.map(u => `"${u.full_name}"`).join(", ");
  const aliasLines = Object.entries(NICKNAME_ALIASES)
    .map(([nick, first]) => {
      const user = userList.find(u => u.full_name.toLowerCase().split(" ")[0] === first);
      return user ? `  "${nick}" → "${user.full_name}"` : null;
    })
    .filter(Boolean)
    .join("\n");

  const prompt = `You are an AI analyzing a phone call transcript for a veterinary clinic / pet boarding / doggie daycare facility.

TRANSCRIPT:
${transcript}

CALL DIRECTION: ${callDirection}
MISSED CALL (not answered): ${isMissedCall ? "YES" : "NO"}

KNOWN STAFF MEMBERS (ONLY valid values for team_member):
${staffLines}

MISSED CALL RULES (if MISSED CALL is YES):
- team_member = null (no one answered)
- caller_intent = null (do not guess intent from a voicemail/ringless call)
- caller_type = "not_applicable"
- bookable = "no"

TEAM MEMBER ATTRIBUTION RULES:
- For INBOUND calls: identify which staff member ANSWERED the call using the first name they say.
  Staff often only say their first name. Use these nickname mappings:
${aliasLines}
  Never assign Caroline/Dr. Cofer — she is the vet mentioned by callers, not the answerer.
- For OUTBOUND calls: identify which staff member MADE the call (the staff caller, not the receiver) using the first name they say when introducing themselves. Use the same nickname mappings. Never assign Caroline/Dr. Cofer.
- Only assign a name if they actually state their name and you are at least 90% confident. If they do not say their name, return null. If unsure but a name is spoken, return the first name only as a string and we will resolve it. Never return "Please Check".

CALLER TYPE LOGIC:
- For INBOUND calls: classify the CALLER (the external person calling in).
- For OUTBOUND calls: classify the RECEIVER (the external person being called), NOT the staff member.
- "returning_client": mentions being here before or has an established history
- "potential_client": wants boarding, daycare, or vet services, no prior relationship
- "not_applicable": sales call, exotic/wildlife/livestock species, calling from another clinic, or voicemail/missed call

EXTRACTION RULES:
- If you are NOT 95%+ confident about a value, use "Unsure" (for strings) or null (for optional fields)
- For phone numbers: extract explicit digits only, do not guess

Return JSON with these fields:
- team_member: string | null (exact match from KNOWN STAFF MEMBERS, or a first name if uncertain — we will resolve it)
- caller_name: string | "Unsure" | null
- caller_phone: string | null
- callee_phone: string | null
- caller_type: "potential_client" | "returning_client" | "not_applicable" | "Unsure"
- caller_intent: string (1-sentence summary)
- bookable: "yes" | "no" | "unclear" | "Unsure"
- booking_outcome: "appt_booked" | "appt_not_booked" | "appt_not_needed" | "Unsure"
- booked_date: "YYYY-MM-DDTHH:MM:00" | null
- appointment_offered: boolean
- transcript_summary: string (2-3 sentences, or "Unclear" if unintelligible)
- ai_notes: string | null

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
    console.log("[DEBUG] Starting backfillZoomCalls");
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
    console.log("[DEBUG] Fetching connectors and user list...");
    let zoomToken, sheetsConn, userList;
    try {
      [zoomToken, sheetsConn, userList] = await Promise.all([
        getZoomToken().catch(e => { throw new Error(`Zoom token error: ${e.message}`); }),
        base44.asServiceRole.connectors.getConnection("googlesheets").catch(e => { throw new Error(`Sheets connection error: ${e.message}`); }),
        base44.asServiceRole.entities.User.list().catch(e => { throw new Error(`User list error: ${e.message}`); }),
      ]);
      console.log("[DEBUG] Got connections and user list");
    } catch (setupError) {
      const errorMsg = setupError instanceof Error ? setupError.message : JSON.stringify(setupError);
      console.error("[ERROR] Setup failed:", errorMsg);
      throw setupError;
    }
    const { accessToken: sheetsToken } = sheetsConn;
    const spreadsheetId = Deno.env.get("GOOGLE_SHEET_ID");
    console.log(`[DEBUG] Using spreadsheet: ${spreadsheetId}`);

    // Get existing call IDs so we don't duplicate
    const existingRecords = await base44.asServiceRole.entities.CallRecord.list('-created_date', 5000);
    const existingCallIds = new Set(existingRecords.map(r => String(r.zoom_meeting_id)));

    // Fetch call logs (which includes phone numbers)
    const allCallLogs = await fetchAllCallLogs(zoomToken, from, to);
    console.log(`[INFO] Found ${allCallLogs.length} Zoom Phone call logs`);

    // Filter to only unprocessed calls
    const pending = allCallLogs.filter(c => !existingCallIds.has(String(c.id)));
    console.log(`[INFO] ${pending.length} unprocessed calls remaining`);

    const sheetName = await getSheetName(spreadsheetId, sheetsToken);

    let processed = 0;
    let skipped   = allCallLogs.length - pending.length;
    const errors  = [];

    // Process only up to batchSize calls per call
    const batch = pending.slice(0, batchSize);

    for (const callLog of batch) {
      const callId = String(callLog.id);
      try {
        // Extract phone numbers from Zoom API response
        const callFromNumber = callLog.caller_number || null; // e.g., "+18645853401"
        const callToNumber = callLog.callee_did_number || callLog.callee_number || null; // e.g., "+18646868583" or "1378"
        
        const callDirection = callLog.direction || "inbound";
        const startTime     = callLog.date_time || new Date().toISOString();
        const duration      = callLog.duration || 0;
        const callerName    = callLog.caller_name || null;
        // "not_answered" result = missed call
        const isMissedCall  = callLog.result === "not_answered" || (!callLog.result && duration === 0 && !callLog.recording_id);
        const recording_url = callLog.recording_id ? `https://zoom.us/recording/download/${callLog.recording_id}` : null;

        // Download transcript
        let transcript = "";
        try {
          const fetchedTranscript = await getRecordingTranscript(callLog.recording_id, zoomToken);
          transcript = fetchedTranscript || "";
          if (!transcript) {
            console.warn(`[WARN] No transcript available for recording ${callLog.recording_id || 'N/A'}`);
          }
        } catch (transcriptErr) {
          console.warn(`[WARN] Could not download/transcribe recording ${callLog.recording_id}: ${transcriptErr.message}`);
        }

        const analysisInput = transcript || `CALL METADATA ONLY - No transcript available.\nCaller: ${callerName || callFromNumber || "Unknown"}\nDirection: ${callDirection}\nDuration: ${duration}s\nMissed Call: ${isMissedCall}\nCallee: ${callToNumber || "Unknown"}`;
        const analysis = await analyzeTranscript(analysisInput, callDirection, isMissedCall, openai, userList);

        // Use call log phone numbers, fallback to AI extraction
        const finalCallerPhone = callFromNumber || analysis.caller_phone || null;
        const finalCalleePhone = callToNumber || analysis.callee_phone || null;

        // Append to sheet (headers: Date, Inbound/Outbound, Caller, Callee, Answered By, Booking Status, Team Member, Caller Type, Booking Outcome)
        const callDate = new Date(startTime);
        const dateStr = callDate.toLocaleDateString("en-US", { timeZone: "America/New_York" });
        const timeStr = callDate.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });
        const rowValues = [
          `${dateStr} ${timeStr}`,
          callDirection,
          finalCallerPhone || "",
          finalCalleePhone || "",
          analysis.team_member  || "",
          analysis.bookable || "unclear",
          analysis.caller_type  || "not_applicable",
          analysis.booking_outcome || "appt_not_booked",
          analysis.appointment_offered ? "yes" : "no",
        ];
        const sheetRowNumber = await appendToSheet(rowValues, sheetName, sheetsToken, spreadsheetId);

        // Resolve team member to a valid app user full name
        const resolvedTeamMember = isMissedCall ? null : resolveStaffName(analysis.team_member, userList);

        // Save to DB — always use the real Zoom call ID for dedup
        await base44.asServiceRole.entities.CallRecord.create({
          zoom_meeting_id: callId,
          call_date: startTime,
          call_duration_seconds: duration,
          call_direction: callDirection,
          caller_phone: finalCallerPhone,
          caller_name:  callerName || analysis.caller_name || null,
          team_member:  resolvedTeamMember,
          transcript,
          transcript_summary: analysis.transcript_summary || null,
          recording_url: recording_url || null,
          caller_type:   analysis.caller_type   || "not_applicable",
          caller_intent: analysis.caller_intent || null,
          bookable:      analysis.bookable       || "unclear",
          booking_outcome: analysis.booking_outcome || "appt_not_booked",
          was_booked: analysis.booking_outcome === "appt_booked",
          booked_date: analysis.booked_date || null,
          missed_call: isMissedCall,
          ai_notes: analysis.ai_notes || null,
          status: "pending_review",
        });

        processed++;
        console.log(`[INFO] Processed call ${callId} (${startTime}) - from: ${finalCallerPhone}, to: ${finalCalleePhone}`);

        // Throttle to avoid rate limits
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.error(`[ERROR] Call ${callId}: ${err.message}`);
        errors.push(`${callId}: ${err.message}`);
      }
    }

    const remaining = pending.length - batch.length;
    return Response.json({
      processed,
      skipped,
      errors: errors.slice(0, 20),
      total: allCallLogs.length,
      remaining,
      done: remaining === 0,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error("[ERROR]", errorMsg);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
});