import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("googlesheets");
    const spreadsheetId = Deno.env.get("GOOGLE_SHEET_ID");

    // Get all sheet_row records to know which rows were touched
    const allRecords = await base44.asServiceRole.entities.CallRecord.list('-created_date', 2000);
    const sheetRecords = allRecords.filter(r => r.zoom_meeting_id?.startsWith('sheet_row_'));

    if (sheetRecords.length === 0) {
      return Response.json({ cleared: 0, message: 'No sheet records found' });
    }

    // Build clear requests for columns G, H, I for each row
    const clearRanges = [];
    for (const rec of sheetRecords) {
      const rowIndex = parseInt(rec.zoom_meeting_id.split('_')[2]);
      if (isNaN(rowIndex)) continue;
      clearRanges.push(`Sheet1!G${rowIndex}:I${rowIndex}`);
    }

    // batchClear in chunks of 900
    const CHUNK_SIZE = 900;
    let cleared = 0;
    for (let i = 0; i < clearRanges.length; i += CHUNK_SIZE) {
      const chunk = clearRanges.slice(i, i + CHUNK_SIZE);
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ranges: chunk })
        }
      );
      if (!res.ok) throw new Error(await res.text());
      cleared += chunk.length;
      if (i + CHUNK_SIZE < clearRanges.length) await new Promise(r => setTimeout(r, 500));
    }

    return Response.json({ cleared, total: sheetRecords.length, message: 'Columns G, H, I cleared for all sheet rows' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});