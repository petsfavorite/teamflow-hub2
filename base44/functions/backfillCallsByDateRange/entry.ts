import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { parseCallDate, parseDurationSeconds, resolveColumns, buildCallRecord } from '../../shared/sheetSyncHelpers.ts';

// One-time backfill: reads the ENTIRE Google Sheet (not just the top 500 rows),
// filters by caller-provided date ranges and duration >= 30s, dedups against
// existing CallRecords, and creates any missing ones. Used to fill gaps where
// calls scrolled past the 500-row window before the sync could pick them up.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin' && user?.role !== 'super_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    // Expect: { ranges: [{ start: ISO, end: ISO }, ...] }
    const ranges = body.ranges || [];
    if (!ranges.length) {
      return Response.json({ error: "No date ranges provided. Send { ranges: [{ start, end }] }" }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("googlesheets");
    const spreadsheetId = Deno.env.get("GOOGLE_SHEET_ID");

    // Get sheet name + total row count from metadata
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title,sheets.properties.gridProperties.rowCount`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!metaRes.ok) {
      return Response.json({ error: "metadata fetch failed: " + await metaRes.text() }, { status: metaRes.status });
    }
    const metaJson = await metaRes.json();
    const sheetInfo = metaJson.sheets?.[0] || {};
    const sheetName = sheetInfo.properties?.title || "Sheet1";
    const totalRows = sheetInfo.properties?.gridProperties?.rowCount || 5000;

    // Read headers
    const headersRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${sheetName}!1:1`)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const headersData = await headersRes.json();
    const headers = headersData.values?.[0] || [];
    if (!headers.length) return Response.json({ error: "No headers found" }, { status: 500 });

    const cols = resolveColumns(headers);

    // Read ALL rows in chunks of 1000 to avoid response size limits
    const allRows = [];
    const CHUNK = 1000;
    for (let start = 2; start <= totalRows + 1; start += CHUNK) {
      const end = Math.min(start + CHUNK - 1, totalRows + 1);
      const dataRange = `${sheetName}!${start}:${end}`;
      const dataRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(dataRange)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!dataRes.ok) {
        console.error(`Failed to read rows ${start}-${end}: ${await dataRes.text()}`);
        continue;
      }
      const dataJson = await dataRes.json();
      const rows = dataJson.values || [];
      if (!rows.length) break;
      for (let i = 0; i < rows.length; i++) {
        allRows.push({ __rowIndex: start + i, __raw: rows[i] });
      }
      if (rows.length < CHUNK) break;
    }

    // Filter by date ranges + duration >= 30s
    const inRange = [];
    for (const row of allRows) {
      const raw = row.__raw;
      const hasAnyData = raw.some(v => v !== "" && v != null);
      if (!hasAnyData) continue;

      const parsedDate = parseCallDate(raw[cols.colDate]);
      if (!parsedDate) continue;

      const inAnyRange = ranges.some(r => parsedDate >= r.start && parsedDate <= r.end);
      if (!inAnyRange) continue;

      if (cols.colDuration >= 0) {
        const durSec = parseDurationSeconds(raw[cols.colDuration]);
        if (durSec === null || durSec < 30) continue;
      }

      const callId = cols.colCallId >= 0 ? (raw[cols.colCallId] || "").trim() : "";
      inRange.push({ __rowIndex: row.__rowIndex, __parsedDate: parsedDate, __callId: callId, __raw: raw });
    }

    if (inRange.length === 0) {
      return Response.json({ imported: 0, skipped: 0, inRangeCount: 0, message: "No calls found in the given date ranges" });
    }

    // Dedup against existing records
    const zoomIds = inRange.map(r => r.__callId || `sheet_row_${r.__rowIndex}`);
    const existingCalls = await base44.asServiceRole.entities.CallRecord.filter({ zoom_meeting_id: { $in: zoomIds } });
    const existingIds = new Set(existingCalls.map(c => c.zoom_meeting_id));

    const recordsToCreate = [];
    let skipped = 0;

    for (const row of inRange) {
      const rowKey = row.__callId || `sheet_row_${row.__rowIndex}`;
      if (existingIds.has(rowKey)) {
        skipped++;
        continue;
      }
      recordsToCreate.push(buildCallRecord(row.__raw, cols, row.__rowIndex, row.__callId));
    }

    // Bulk-create in batches of 50
    let imported = 0;
    const BATCH_SIZE = 50;
    for (let i = 0; i < recordsToCreate.length; i += BATCH_SIZE) {
      const batch = recordsToCreate.slice(i, i + BATCH_SIZE);
      try {
        await base44.asServiceRole.entities.CallRecord.bulkCreate(batch);
        imported += batch.length;
      } catch (err) {
        console.error(`Batch ${i} create failed:`, err.message);
      }
    }

    return Response.json({
      imported,
      skipped,
      inRangeCount: inRange.length,
      totalRowsScanned: allRows.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});