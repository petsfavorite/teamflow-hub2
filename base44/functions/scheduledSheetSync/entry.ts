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
  * For inbound calls: the staff member who ANSWERED — usually the FIRST staff name mentioned, as they introduce themselves (e.g. "Thank you for calling, this is Sarah"). Match to the exact name from KNOWN STAFF MEMBERS. If no match, return null.
  * For outbound calls: the staff member who MADE the call (they introduce themselves). Match to KNOWN STAFF MEMBERS. If they do not say their name, return null. Never assign Caroline/Dr. Cofer.
- caller_name: string or null
- caller_phone: string or null
- caller_type: "potential_client" | "returning_client" | "not_applicable"
  For inbound: classify the caller. For outbound: classify the RECEIVER (external person called), not the staff member.
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

// Nickname → canonical first name (lowercase). Used for fuzzy matching.
const NAME_ALIASES = {
  // Rebecca Evatt
  "becca": "rebecca", "becky": "rebecca", "bec": "rebecca",
  // Aryana Vizcano
  "arianna": "aryana", "ariana": "aryana", "ary": "aryana", "anna": "aryana",
  // Amanda Sandor
  "mandy": "amanda", "aman": "amanda",
  // Katie DeJesus
  "kate": "katie", "katelyn": "katie", "kaitlyn": "katie", "caitlin": "katie", "kaitlin": "katie",
  // Jen Rising
  "jennifer": "jen", "jenny": "jen",
  // Skye Means
  "sky": "skye",
  // Hailey Laughter
  "haley": "hailey", "hayley": "hailey",
};

const NEVER_ASSIGN_AS_ANSWERER = ["caroline cofer", "dr. cofer", "dr cofer", "caroline", "dr caroline", "dr. caroline"];

function fuzzyMatchUser(detectedName, userList) {
  if (!detectedName || !userList.length) return null;
  let lower = detectedName.toLowerCase().trim();

  // Hard block: never assign Caroline Cofer as the answerer
  if (NEVER_ASSIGN_AS_ANSWERER.some(blocked => lower === blocked || lower.includes(blocked))) {
    return null;
  }

  // Apply alias normalization before matching
  if (NAME_ALIASES[lower]) lower = NAME_ALIASES[lower];

  // 1. Exact full name match
  const exact = userList.find(u => u.full_name.toLowerCase() === lower);
  if (exact) return exact.full_name;

  // 2. Exact first name match (most common — sheet often has just first names)
  const firstNameMatch = userList.find(u => {
    const firstName = u.full_name.toLowerCase().split(" ")[0];
    return firstName === lower;
  });
  if (firstNameMatch) return firstNameMatch.full_name;

  // 3. Partial alias: check if the detected name is an alias fragment of a user
  for (const [alias, canonical] of Object.entries(NAME_ALIASES)) {
    if (lower.includes(alias)) {
      lower = lower.replace(alias, canonical);
      break;
    }
  }
  const aliasFirstName = userList.find(u => {
    const firstName = u.full_name.toLowerCase().split(" ")[0];
    return firstName === lower;
  });
  if (aliasFirstName) return aliasFirstName.full_name;

  // 4. Substring match — detected name is contained in a user's full name
  const substringMatch = userList.find(u => {
    const uLower = u.full_name.toLowerCase();
    // Only match if the detected token matches a whole word in the user's name
    const words = uLower.split(" ");
    return words.some(w => w === lower);
  });
  if (substringMatch) return substringMatch.full_name;

  // 5. Initials match (e.g. "KS" → first letters of first+last name)
  if (/^[a-z]{2,3}$/.test(lower)) {
    const initialsMatch = userList.find(u => {
      const parts = u.full_name.toLowerCase().split(" ");
      const initials = parts.map(p => p[0]).join("");
      return initials === lower;
    });
    if (initialsMatch) return initialsMatch.full_name;
  }

  // No confident match — return null so we don't assign a wrong person
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
    // Only use headers that are non-empty strings to avoid blank-column offset issues
    const records = rawRows.map((row, idx) => {
      const obj = { __rowIndex: startRow + idx };
      headers.forEach((h, i) => {
        if (h && h.trim()) obj[h.trim()] = row[i] ?? "";
      });
      return obj;
    });

    // Process only rows that have any data (skip blank rows)
    if (records.length > 0) {
      console.log(`[DEBUG] First row keys: ${Object.keys(records[0]).filter(k => k !== '__rowIndex').join(', ')}`);
      console.log(`[DEBUG] First row sample: ${JSON.stringify(records[0]).substring(0, 300)}`);
    }
    const rowsToProcess = records.filter(row => {
      const hasAnyData = Object.entries(row).some(([k, v]) => k !== '__rowIndex' && v !== '');
      if (!hasAnyData) return false;
      // Skip rows with no real caller info, no team member, and no transcript
      const phone = (row["Caller Phone"] || row["Callee Phone"] || "").toLowerCase().trim();
      const teamMember = (row["Team Member"] || "").trim();
      const transcript = (row["Transcript"] || "").trim();
      const isAnonymousOnly = (phone === "anonymous" || phone === "") && !teamMember && !transcript;
      return !isAnonymousOnly;
    });
    const remaining = rawRows.length === 500 ? "possibly more" : 0;

    // Build a set of already-existing zoom_meeting_ids for this batch to avoid duplicates
    const zoomIds = rowsToProcess.map(r => `sheet_row_${r.__rowIndex}`);
    const existingCalls = await base44.asServiceRole.entities.CallRecord.filter({ zoom_meeting_id: { $in: zoomIds } });
    const existingIds = new Set(existingCalls.map(c => c.zoom_meeting_id));

    let imported = 0;
    let skipped = 0;
    const errors = [];
    let maxProcessedRow = lastProcessedRow;

    const recordsToCreate = [];

    for (const row of rowsToProcess) {
      // Skip if already imported
      if (existingIds.has(`sheet_row_${row.__rowIndex}`)) {
        skipped++;
        if (row.__rowIndex > maxProcessedRow) maxProcessedRow = row.__rowIndex;
        continue;
      }
      try {
        const directionRaw = (row["Inbound/Outbound"] || "").toLowerCase();
        const call_direction = directionRaw.includes("out") ? "outbound" : "inbound";

        // Columns: "Caller Phone" (inbound external) and "Callee Phone" (outbound external)
        const callerPhoneField = row["Caller Phone"] || "";
        const calleePhoneField = row["Callee Phone"] || "";
        const rawPhone = call_direction === "inbound" ? callerPhoneField : calleePhoneField;
        // Treat "Anonymous" or empty as null
        const caller_phone = (rawPhone && rawPhone.toLowerCase() !== "anonymous") ? rawPhone : null;

        // team_member from "Team Member" column
        let team_member = null;
        if (row["Team Member"] && userList.length) {
          team_member = fuzzyMatchUser(row["Team Member"], userList);
        }

        // caller_type from "Caller Type" column
        const callerTypeRaw = (row["Caller Type"] || "").toLowerCase();
        let caller_type = "not_applicable";
        if (callerTypeRaw.includes("potential") || callerTypeRaw.includes("new")) caller_type = "potential_client";
        else if (callerTypeRaw.includes("return") || callerTypeRaw.includes("existing")) caller_type = "returning_client";

        // booking_outcome from "Booking Outcome" column
        const bookingRaw = (row["Booking Outcome"] || "").toLowerCase();
        let booking_outcome = "appt_not_booked";
        if (bookingRaw.includes("booked") || bookingRaw.includes("scheduled") || bookingRaw.includes("yes")) booking_outcome = "appt_booked";
        else if (bookingRaw.includes("not needed") || bookingRaw.includes("n/a") || bookingRaw.includes("not applicable") || bookingRaw.includes("unsure")) booking_outcome = "appt_not_needed";

        // Parse date: Google Sheets serial number (days since Dec 30, 1899) or ISO string
        let callDateISO = new Date().toISOString();
        const dateRaw = row["Date"] || "";
        if (dateRaw) {
          const serial = parseFloat(dateRaw);
          if (!isNaN(serial) && serial > 40000) {
            // Google Sheets serial date → JS date
            const msFromEpoch = (serial - 25569) * 86400 * 1000;
            callDateISO = new Date(msFromEpoch).toISOString();
          } else if (dateRaw.includes("/") || dateRaw.includes("-")) {
            const parsed = new Date(dateRaw);
            if (!isNaN(parsed)) callDateISO = parsed.toISOString();
          }
        }

        const transcript = row["Transcript"] || "";
        const zoom_meeting_id = `sheet_row_${row.__rowIndex}`;

        // Missed call: inbound with no transcript (no one spoke to the client)
        const missed_call = call_direction === "inbound" && !transcript;
        // A missed call has no answerer — clear any team member from the sheet
        if (missed_call) {
          team_member = null;
          caller_type = "not_applicable";
        }

        recordsToCreate.push({
          zoom_meeting_id,
          call_date: callDateISO,
          call_direction,
          caller_phone,
          team_member,
          caller_type,
          booking_outcome,
          was_booked: booking_outcome === "appt_booked",
          transcript: transcript || null,
          missed_call,
          status: "pending_review",
          __rowIndex: row.__rowIndex,
        });
      } catch (err) {
        errors.push(`Row ${row.__rowIndex}: ${err.message}`);
        skipped++;
      }
    }

    // Bulk-create in batches of 50 to avoid rate limits
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