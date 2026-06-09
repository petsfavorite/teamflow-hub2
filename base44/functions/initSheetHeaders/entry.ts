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

    // Headers: columns A-I
    // A-F: input columns read by scheduledSheetSync
    // G-I: written back by writeCallDataToSheet
    const headers = [
      "Date",
      "Inbound/Outbound",
      "Caller",
      "Callee",
      "Answered By",
      "Booking Status",
      "Team Member",
      "Caller Type",
      "Booking Outcome"
    ];

    const writeRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${sheetName}!A1`)}:valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [headers] })
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