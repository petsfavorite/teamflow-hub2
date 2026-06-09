import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin' && user?.role !== 'super_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("googlesheets");
    const spreadsheetId = Deno.env.get("GOOGLE_SHEET_ID");

    // Get actual sheet name
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const metaJson = await metaRes.json();
    const sheetName = metaJson.sheets?.[0]?.properties?.title || "Sheet1";

    // All columns in one place
    // A: Date, B: Inbound/Outbound, C: Caller Phone, D: Callee Phone, E: Team Member
    // F: Bookable (yes/no/unclear), G: Caller Type (existing/potential/not_applicable), H: Booking Outcome (booked/not_booked/not_needed)
    // I: Appointment Offered (yes/no)
    const headers = [
      "Date",
      "Inbound/Outbound",
      "Caller Phone",
      "Callee Phone",
      "Team Member",
      "Bookable",
      "Caller Type",
      "Booking Outcome",
      "Appointment Offered",
      "Transcript"
    ];

    // Step 1: Clear the entire sheet so no stale data or ghost columns remain
    const clearRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${sheetName}`)}:clear`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }
    );
    if (!clearRes.ok) {
      const err = await clearRes.text();
      return Response.json({ error: "clear failed: " + err }, { status: 500 });
    }

    // Step 2: Write the canonical headers to row 1
    const writeRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${sheetName}!A1`)}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ range: `${sheetName}!A1`, majorDimension: 'ROWS', values: [headers] })
      }
    );

    if (!writeRes.ok) {
      const err = await writeRes.text();
      return Response.json({ error: err }, { status: 500 });
    }

    // Also reset the high-water mark in AppSettings so sync starts fresh from row 2
    const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
    const settings = settingsList?.[0];
    if (settings?.id) {
      await base44.asServiceRole.entities.AppSettings.update(settings.id, { last_synced_sheet_row: 1 });
    } else {
      await base44.asServiceRole.entities.AppSettings.create({ key: "global", last_synced_sheet_row: 1 });
    }

    return Response.json({ success: true, headers, sheetName });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});