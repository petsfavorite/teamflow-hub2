import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Fixed column positions: G=6, H=7, I=8 (0-indexed)
const WRITE_COLUMNS = [
  { key: 'team_member',     col: 'G' },
  { key: 'caller_type',     col: 'H' },
  { key: 'booking_outcome', col: 'I' },
];

// Write many records in one batchUpdate call (one range per column, using sparse updates)
async function batchWriteRecords(records, accessToken, spreadsheetId) {
  if (records.length === 0) return { written: 0 };

  const updateValues = [];
  for (const col of WRITE_COLUMNS) {
    for (const rec of records) {
      const rowIndex = parseInt(rec.zoom_meeting_id.split('_')[2]);
      if (isNaN(rowIndex)) continue;
      updateValues.push({
        range: `Sheet1!${col.col}${rowIndex}`,
        values: [[rec[col.key] || '']]
      });
    }
  }

  if (updateValues.length === 0) return { written: 0 };

  // Google Sheets batchUpdate allows up to 1000 ranges per request; split if needed
  const CHUNK_SIZE = 900;
  let written = 0;
  for (let i = 0; i < updateValues.length; i += CHUNK_SIZE) {
    const chunk = updateValues.slice(i, i + CHUNK_SIZE);
    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: chunk, valueInputOption: 'USER_ENTERED' })
      }
    );
    if (!updateRes.ok) throw new Error(await updateRes.text());
    written += chunk.length / WRITE_COLUMNS.length;
    // Small delay between chunks to avoid rate limits
    if (i + CHUNK_SIZE < updateValues.length) await new Promise(r => setTimeout(r, 1100));
  }
  return { written: Math.round(written) };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    // Support both direct invocation ({ callRecordId }) and entity automation payload ({ event, data })
    const callRecordId = body.callRecordId || body.event?.entity_id;
    const { backfillAll } = body;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("googlesheets");
    const spreadsheetId = Deno.env.get("GOOGLE_SHEET_ID");

    // --- BACKFILL MODE ---
    if (backfillAll) {
      const allRecords = await base44.asServiceRole.entities.CallRecord.list('-created_date', 2000);
      const sheetRecords = allRecords.filter(r => r.zoom_meeting_id?.startsWith('sheet_row_'));
      const { written } = await batchWriteRecords(sheetRecords, accessToken, spreadsheetId);
      return Response.json({ written, total: sheetRecords.length });
    }

    // --- SINGLE RECORD MODE (used by automation) ---
    if (!callRecordId) {
      return Response.json({ error: 'callRecordId or backfillAll required' }, { status: 400 });
    }

    const allRecords = await base44.asServiceRole.entities.CallRecord.list('-created_date', 2000);
    const record = allRecords.find(r => r.id === callRecordId);

    if (!record || !record.zoom_meeting_id?.startsWith('sheet_row_')) {
      return Response.json({ error: 'Call record not found or not from sheet' }, { status: 404 });
    }

    const { written } = await batchWriteRecords([record], accessToken, spreadsheetId);
    return Response.json({ message: 'Call data written to sheet', written });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});