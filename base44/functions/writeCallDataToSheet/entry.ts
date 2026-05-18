import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { callRecordId } = await req.json();

    if (!callRecordId) {
      return Response.json({ error: 'callRecordId required' }, { status: 400 });
    }

    // Fetch the call record
    const callRecord = await base44.asServiceRole.entities.CallRecord.list();
    const record = callRecord.find(r => r.id === callRecordId);

    if (!record || !record.zoom_meeting_id?.startsWith('sheet_row_')) {
      return Response.json({ error: 'Call record not found or not from sheet' }, { status: 404 });
    }

    // Extract row number from zoom_meeting_id (sheet_row_2 → 2)
    const rowIndex = parseInt(record.zoom_meeting_id.split('_')[2]);
    if (isNaN(rowIndex)) {
      return Response.json({ error: 'Invalid row index' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("googlesheets");
    const spreadsheetId = Deno.env.get("GOOGLE_SHEET_ID");

    // Fetch headers to find column indices
    const headerRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:Z1`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!headerRes.ok) {
      return Response.json({ error: 'Failed to fetch headers' }, { status: 500 });
    }

    const headerData = await headerRes.json();
    const headers = headerData.values?.[0] || [];

    // Find column indices for the fields we want to write back
    const teamMemberCol = headers.findIndex(h => h?.toLowerCase().includes('team') || h?.toLowerCase().includes('staff') || h?.toLowerCase().includes('answered'));
    const callerTypeCol = headers.findIndex(h => h?.toLowerCase().includes('caller type'));
    const bookingStatusCol = headers.findIndex(h => h?.toLowerCase().includes('booking') || h?.toLowerCase().includes('booked'));

    // Build the update values array
    const updateValues = [];
    if (teamMemberCol >= 0) {
      updateValues.push({
        range: `Sheet1!${String.fromCharCode(65 + teamMemberCol)}${rowIndex}`,
        values: [[record.team_member || '']]
      });
    }
    if (callerTypeCol >= 0) {
      updateValues.push({
        range: `Sheet1!${String.fromCharCode(65 + callerTypeCol)}${rowIndex}`,
        values: [[record.caller_type || '']]
      });
    }
    if (bookingStatusCol >= 0) {
      updateValues.push({
        range: `Sheet1!${String.fromCharCode(65 + bookingStatusCol)}${rowIndex}`,
        values: [[record.booking_outcome || '']]
      });
    }

    if (updateValues.length === 0) {
      return Response.json({ message: 'No matching columns found in sheet' }, { status: 200 });
    }

    // Write back to sheet using batchUpdate
    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: updateValues,
          valueInputOption: 'USER_ENTERED'
        })
      }
    );

    if (!updateRes.ok) {
      const err = await updateRes.text();
      return Response.json({ error: err }, { status: updateRes.status });
    }

    return Response.json({ message: 'Call data written to sheet', rowIndex });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});