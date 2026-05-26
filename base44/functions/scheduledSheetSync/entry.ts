import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';
import OpenAI from 'npm:openai';

async function analyzeTranscript(transcript, callerInfo, userList) {
  if (!transcript) return {};
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

  const teamEntries = userList.map(u => `"${u.full_name}"`).join("\n");

  const prompt = `You are an AI analyzing a phone call transcript for a veterinary clinic / pet boarding / doggie daycare facility.

TRANSCRIPT:
${transcript}

CALLER INFO: ${JSON.stringify(callerInfo)}

${teamEntries ? `KNOWN STAFF MEMBERS:\n${teamEntries}\n\nIMPORTANT: Match the name spoken in the transcript to one of the exact names above. Return that exact name. If no match, return null.` : ""}

Return a JSON object with these fields:
- team_member: string or null (exact name from staff list above, or null)
- caller_name: string or null
- caller_phone: string or null
- caller_type: "potential_client" | "returning_client" | "not_applicable"
- caller_intent: string (1-sentence)
- bookable: "yes" | "no" | "unclear"
- booking_outcome: "appt_booked" | "appt_not_booked" | "appt_not_needed"
  NOTE: Use "appt_not_needed" if voicemail (no live conversation) or confirming existing appt. "appt_not_booked" only when we actually spoke to the caller and failed to book.
- booked_date: YYYY-MM-DDTHH:MM:00 if appt_booked, else null
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

const NAME_ALIASES = {
  "katelyn": "katie",
  "kaitlyn": "katie",
  "caitlyn": "katie",
  "caitlin": "katie",
  "kaitlin": "katie",
};

function fuzzyMatchUser(detectedName, userList) {
  if (!detectedName || !userList.length) return detectedName;
  let lower = detectedName.toLowerCase().trim();

  // Apply alias normalization before matching
  if (NAME_ALIASES[lower]) lower = NAME_ALIASES[lower];

  const exact = userList.find(u => u.full_name.toLowerCase() === lower);
  if (exact) return exact.full_name;

  const firstNameMatch = userList.find(u => {
    const firstName = u.full_name.toLowerCase().split(" ")[0];
    return firstName === lower;
  });
  if (firstNameMatch) return firstNameMatch.full_name;

  const containsMatch = userList.find(u => {
    const uLower = u.full_name.toLowerCase();
    return uLower.includes(lower) || lower.includes(uLower);
  });
  if (containsMatch) return containsMatch.full_name;

  return null;
}

function extractRecordingUrl(rawLink) {
  if (!rawLink) return null;
  if (rawLink.trim().startsWith("{")) {
    try {
      const obj = JSON.parse(rawLink);
      return obj.webViewLink || obj.webContentLink || null;
    } catch { return null; }
  }
  if (rawLink.startsWith("http")) return rawLink;
  return null;
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

    // Fetch up to 2000 rows; only metadata columns (A:D) to keep payload small,
    // then fetch full data only for new rows
    const range = "Sheet1!A1:Z2000";

    const [sheetRes, userList, allExistingRecords] = await Promise.all([
      fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ),
      base44.asServiceRole.entities.User.list(),
      base44.asServiceRole.entities.CallRecord.list("-created_date", 2000),
    ]);

    if (!sheetRes.ok) {
      const err = await sheetRes.text();
      return Response.json({ error: err }, { status: sheetRes.status });
    }

    const data = await sheetRes.json();
    const rows = data.values || [];
    if (rows.length < 2) return Response.json({ imported: 0, skipped: 0, remaining: 0 });

    const headers = rows[0];
    const records = rows.slice(1).map((row, idx) => {
      const obj = { __rowIndex: idx + 2 };
      headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
      return obj;
    });

    const existingIds = new Set(
      (allExistingRecords || []).map(r => r.zoom_meeting_id).filter(Boolean)
    );

    const newRows = records.filter(row => !existingIds.has(`sheet_row_${row.__rowIndex}`));

    // Process in small batches to avoid timeouts
    const MAX_PER_RUN = 15;
    const rowsToProcess = newRows.slice(0, MAX_PER_RUN);
    const remaining = newRows.length - rowsToProcess.length;

    let imported = 0;
    let skipped = 0;
    const errors = [];

    // Process in parallel groups of 5 to stay within memory/time limits
    const CONCURRENCY = 5;
    for (let i = 0; i < rowsToProcess.length; i += CONCURRENCY) {
      const batch = rowsToProcess.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (row) => {
        try {
          const callDate = row["Date/Time"] || row["Call Date"];
          const transcript = row["Transcript"] || "";
          const rawLink = row["Link to Recording"] || "";
          const directionRaw = (row["Inbound/Outbound"] || "").toLowerCase();
          const call_direction = directionRaw.includes("out") ? "outbound" : "inbound";

          if (!callDate) { skipped++; return; }

          const zoom_meeting_id = `sheet_row_${row.__rowIndex}`;
          const callerInfo = { call_date: callDate, call_direction };
          const analysis = await analyzeTranscript(transcript, callerInfo, userList);

          if (analysis.team_member && userList.length) {
            const matched = fuzzyMatchUser(analysis.team_member, userList);
            analysis.team_member = matched || null;
          }

          const recordingUrl = extractRecordingUrl(rawLink);

          await base44.asServiceRole.entities.CallRecord.create({
            zoom_meeting_id,
            call_date: new Date(callDate).toISOString(),
            call_direction,
            transcript: transcript || null,
            recording_url: recordingUrl,
            status: "pending_review",
            was_booked: analysis.booking_outcome === "appt_booked",
            ...analysis,
          });
          imported++;
        } catch (err) {
          errors.push(err.message);
          skipped++;
        }
      }));
    }

    return Response.json({ imported, skipped, remaining, errors: errors.slice(0, 5) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});