import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const NAME_ALIASES = {
  "katelyn": "katie", "kaitlyn": "katie", "caitlyn": "katie",
  "caitlin": "katie", "kaitlin": "katie",
  "ariana": "aryana", "arianna": "aryana",
};

function fuzzyMatchUser(detectedName, userList) {
  if (!detectedName || !userList.length) return detectedName;
  let lower = detectedName.toLowerCase().trim();
  if (NAME_ALIASES[lower]) lower = NAME_ALIASES[lower];
  const exact = userList.find(u => u.full_name.toLowerCase() === lower);
  if (exact) return exact.full_name;
  const firstNameMatch = userList.find(u => u.full_name.toLowerCase().split(" ")[0] === lower);
  if (firstNameMatch) return firstNameMatch.full_name;
  const containsMatch = userList.find(u => {
    const uLower = u.full_name.toLowerCase();
    return uLower.includes(lower) || lower.includes(uLower);
  });
  return containsMatch ? containsMatch.full_name : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin' && user?.role !== 'super_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("googlesheets");
    const spreadsheetId = Deno.env.get("GOOGLE_SHEET_ID");

    // Find all CallRecords with null caller_type (the broken ones)
    const allRecords = await base44.asServiceRole.entities.CallRecord.list('-created_date', 2000);
    const broken = allRecords.filter(r =>
      r.zoom_meeting_id?.startsWith('sheet_row_') && r.caller_type == null
    );

    if (broken.length === 0) return Response.json({ updated: 0, message: 'Nothing to backfill' });

    const rowNumbers = broken.map(r => parseInt(r.zoom_meeting_id.split('_')[2])).filter(n => !isNaN(n));
    const minRow = Math.min(...rowNumbers);
    const maxRow = Math.max(...rowNumbers);

    console.log(`[INFO] Backfilling ${broken.length} records, rows ${minRow}-${maxRow}`);

    // Fetch the sheet range covering all broken rows
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!${minRow}:${maxRow}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const sheetData = await sheetRes.json();
    const rawRows = sheetData.values || [];

    // Fetch headers
    const headersRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!1:1`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const headersData = await headersRes.json();
    const headers = headersData.values?.[0] || [];

    // Build a map: row number -> row object
    const rowMap = {};
    rawRows.forEach((row, idx) => {
      const rowNum = minRow + idx;
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
      rowMap[rowNum] = obj;
    });

    const userList = await base44.asServiceRole.entities.User.list();

    // Accept optional offset/limit for chunked runs
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const offset = body.offset || 0;
    const chunkSize = body.chunkSize || 50;
    const chunk = broken.slice(offset, offset + chunkSize);

    let updated = 0;
    for (const record of chunk) {
      const rowNum = parseInt(record.zoom_meeting_id.split('_')[2]);
      const row = rowMap[rowNum];
      if (!row) continue;

      const directionRaw = String(row["Inbound/Outbound"] || row["Direction"] || row["Call Direction"] || row["Call Type"] || row["Type"] || row["Incoming/Outgoing"] || "").toLowerCase().trim();
      const call_direction = directionRaw.startsWith("out") || directionRaw === "out" ? "outbound" : "inbound";

      const callerField = row["Caller"] || "";
      const calleeField = row["Callee"] || "";
      let caller_phone = null;
      let caller_name = null;

      if (call_direction === "inbound") {
        if (/\d{7,}/.test(callerField)) caller_phone = callerField;
        else caller_name = callerField || null;
      } else {
        if (/\d{7,}/.test(calleeField)) caller_phone = calleeField;
        else caller_name = calleeField || null;
      }

      let team_member = row["Answered By"] || null;
      if (team_member && userList.length) {
        const matched = fuzzyMatchUser(team_member, userList);
        team_member = matched || team_member || null;
      }
      if (call_direction === "outbound") team_member = null;

      const callerTypeRaw = (row["Caller Type"] || "").toLowerCase();
      let caller_type = "not_applicable";
      if (callerTypeRaw.includes("potential") || callerTypeRaw.includes("new")) caller_type = "potential_client";
      else if (callerTypeRaw.includes("return") || callerTypeRaw.includes("existing")) caller_type = "returning_client";

      const bookingRaw = (row["Booking Status"] || "").toLowerCase();
      let booking_outcome = "appt_not_booked";
      if (bookingRaw.includes("booked") || bookingRaw.includes("scheduled") || bookingRaw.includes("yes")) booking_outcome = "appt_booked";
      else if (bookingRaw.includes("not needed") || bookingRaw.includes("n/a") || bookingRaw.includes("not applicable")) booking_outcome = "appt_not_needed";

      await base44.asServiceRole.entities.CallRecord.update(record.id, {
        caller_phone,
        caller_name,
        team_member,
        caller_type,
        booking_outcome,
        was_booked: booking_outcome === "appt_booked",
      });
      updated++;
      await new Promise(r => setTimeout(r, 150));
    }

    const nextOffset = offset + chunkSize;
    const remaining = broken.length - nextOffset;
    return Response.json({ updated, total: broken.length, offset, nextOffset, remaining, done: remaining <= 0 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});