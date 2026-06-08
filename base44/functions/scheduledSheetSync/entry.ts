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

${teamEntries ? `KNOWN STAFF MEMBERS:\n${teamEntries}\n\nNotes:\n- "Caroline", "Dr. Cofer", or "Dr. Caroline Cofer" refers to a staff member named Caroline Cofer.\n- "Ariana" or "Arianna" in the transcript almost certainly refers to the staff member named Aryana — use the closest match from the list above.` : ""}

Return a JSON object with these fields:
- team_member: string or null
  RULES:
  * If call_direction is "outbound", always set team_member to null — do not assign a team member.
  * For inbound calls: the team member is usually the FIRST staff name mentioned in the transcript, as they introduce themselves (e.g. "Thank you for calling, this is Sarah"). Match that name to the exact name from the KNOWN STAFF MEMBERS list above. If no match, return null.
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
  // OpenAI frequently transcribes "Aryana" as "Ariana"
  "ariana": "aryana",
  "arianna": "aryana",
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

    // --- Load the last processed row index from AppSettings ---
    const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
    const settings = settingsList?.[0] || null;
    const lastProcessedRow = settings?.last_synced_sheet_row || 1; // 1 = header row, so data starts at row 2

    // Only fetch rows we haven't seen yet (start from lastProcessedRow + 1)
    const startRow = lastProcessedRow + 1;
    // Fetch a window of 500 rows at a time
    const endRow = startRow + 499;

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

    // Fetch the window of new rows (no column limit — use row-only range)
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
      headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
      return obj;
    });

    // Process only rows that have a date (skip truly blank rows)
    // Also log a sample to help debug column names
    if (records.length > 0) {
      console.log(`[DEBUG] First row keys: ${Object.keys(records[0]).filter(k => k !== '__rowIndex').join(', ')}`);
      console.log(`[DEBUG] First row sample: ${JSON.stringify(records[0]).substring(0, 300)}`);
    }
    const rowsToProcess = records.filter(row => {
      const dateVal = row["Date/Time"] || row["Call Date"] || row["Date"] || row["date"] || row["Timestamp"];
      // fallback: any non-empty non-rowIndex value
      if (dateVal) return true;
      const hasAnyData = Object.entries(row).some(([k, v]) => k !== '__rowIndex' && v !== '');
      return hasAnyData;
    });
    const remaining = rawRows.length === 500 ? "possibly more" : 0;

    let imported = 0;
    let skipped = 0;
    const errors = [];
    let maxProcessedRow = lastProcessedRow;

    // Process sequentially to avoid CPU spikes from parallel OpenAI calls
    for (const row of rowsToProcess) {
      try {
        const callDate = row["Date/Time"] || row["Call Date"] || row["Date"] || row["date"] || row["Timestamp"] || "";
        const transcript = row["Transcript"] || "";
        const rawLink = row["Link to Recording"] || "";
        const directionRaw = (row["Inbound/Outbound"] || "").toLowerCase();
        const call_direction = directionRaw.includes("out") ? "outbound" : "inbound";

        const zoom_meeting_id = `sheet_row_${row.__rowIndex}`;

        // Robust date parsing — try multiple formats
        let callDateISO;
        if (callDate) {
          const parsed = new Date(callDate);
          if (!isNaN(parsed.getTime())) {
            callDateISO = parsed.toISOString();
          } else {
            // Try M/D/YYYY H:MM or M/D/YYYY formats
            const mdyMatch = callDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(.*)$/);
            if (mdyMatch) {
              const reconstructed = `${mdyMatch[3]}-${mdyMatch[1].padStart(2,'0')}-${mdyMatch[2].padStart(2,'0')}T${mdyMatch[4] || '00:00'}`;
              const p2 = new Date(reconstructed);
              callDateISO = isNaN(p2.getTime()) ? new Date().toISOString() : p2.toISOString();
            } else {
              callDateISO = new Date().toISOString(); // fallback to now
            }
          }
        } else {
          callDateISO = new Date().toISOString();
        }

        const callerInfo = { call_date: callDate, call_direction };
        const analysis = await analyzeTranscript(transcript, callerInfo, userList);

        if (call_direction === "outbound") {
          analysis.team_member = null;
        } else if (analysis.team_member && userList.length) {
          const matched = fuzzyMatchUser(analysis.team_member, userList);
          analysis.team_member = matched || null;
        }

        const recordingUrl = extractRecordingUrl(rawLink);

        await base44.asServiceRole.entities.CallRecord.create({
          zoom_meeting_id,
          call_date: callDateISO,
          call_direction,
          transcript: transcript || null,
          recording_url: recordingUrl,
          status: "pending_review",
          was_booked: analysis.booking_outcome === "appt_booked",
          ...analysis,
        });

        imported++;
        if (row.__rowIndex > maxProcessedRow) maxProcessedRow = row.__rowIndex;
        // Small pause to avoid entity rate limits
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        errors.push(`Row ${row.__rowIndex}: ${err.message}`);
        skipped++;
        // Still advance past this row so we don't get stuck on it forever
        if (row.__rowIndex > maxProcessedRow) maxProcessedRow = row.__rowIndex;
      }
    }

    // --- Save the high-water mark so next run starts from here ---
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