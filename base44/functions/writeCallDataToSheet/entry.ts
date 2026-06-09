import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Columns we write back (by header name, not fixed position)
const WRITE_COLUMNS = ['Team Member', 'Caller Type', 'Booking Outcome'];

// Map CallRecord fields to sheet header names
function getWriteValue(record, header) {
  switch (header) {
    case 'Team Member':    return record.team_member || '';
    case 'Caller Type':    return record.caller_type?.replace(/_/g, ' ') || '';
    case 'Booking Outcome': return record.booking_outcome?.replace(/_/g, ' ') || '';
    default: return '';
  }
}

async function getSheetMeta(spreadsheetId, accessToken) {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const metaJson = await metaRes.json();
  const sheetName = metaJson.sheets?.[0]?.properties?.title || 'Sheet1';

  const headersRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${sheetName}!1:1`)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const headersJson = await headersRes.json();
  const headers = headersJson.values?.[0] || [];
  return { sheetName, headers };
}

// Column index (0-based) → letter
function colLetter(idx) {
  let s = '';
  idx++;
  while (idx > 0) {
    idx--;
    s = String.fromCharCode(65 + (idx % 26)) + s;
    idx = Math.floor(idx / 26);
  }
  return s;
}

async function batchWriteRecords(records, accessToken, spreadsheetId, sheetName, headers) {
  if (records.length === 0) return { written: 0 };

  const updateValues = [];
  for (const headerName of WRITE_COLUMNS) {
    const colIdx = headers.indexOf(headerName);
    if (colIdx === -1) continue;
    const col = colLetter(colIdx);

    for (const rec of records) {
      const rowIndex = parseInt(rec.zoom_meeting_id?.split('_')[2]);
      if (isNaN(rowIndex)) continue;
      updateValues.push({
        range: `${sheetName}!${col}${rowIndex}`,
        values: [[getWriteValue(rec, headerName)]]
      });
    }
  }

  if (updateValues.length === 0) return { written: 0 };

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
    if (i + CHUNK_SIZE < updateValues.length) await new Promise(r => setTimeout(r, 1100));
  }
  return { written: Math.round(written) };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const callRecordId = body.callRecordId || body.event?.entity_id;
    const { backfillAll } = body;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');
    const { sheetName, headers } = await getSheetMeta(spreadsheetId, accessToken);

    if (backfillAll) {
      const allRecords = await base44.asServiceRole.entities.CallRecord.list('-created_date', 2000);
      const sheetRecords = allRecords.filter(r => r.zoom_meeting_id?.startsWith('sheet_row_'));
      const { written } = await batchWriteRecords(sheetRecords, accessToken, spreadsheetId, sheetName, headers);
      return Response.json({ written, total: sheetRecords.length });
    }

    if (!callRecordId) {
      return Response.json({ error: 'callRecordId or backfillAll required' }, { status: 400 });
    }

    const allRecords = await base44.asServiceRole.entities.CallRecord.list('-created_date', 2000);
    const record = allRecords.find(r => r.id === callRecordId);

    if (!record || !record.zoom_meeting_id?.startsWith('sheet_row_')) {
      return Response.json({ error: 'Call record not found or not from sheet' }, { status: 404 });
    }

    const { written } = await batchWriteRecords([record], accessToken, spreadsheetId, sheetName, headers);
    return Response.json({ message: 'Call data written to sheet', written });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});