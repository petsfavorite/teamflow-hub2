import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';
import { sendCallLogErrorEmail } from '../../shared/callLogErrorNotify.ts';
import { parseCallDate, parseDurationSeconds, resolveColumns, buildCallRecord } from '../../shared/sheetSyncHelpers.ts';

// FAST IMPORT ONLY — no AI analysis. Pulls raw sheet rows and creates
// CallRecord entries marked pending_review with ai_enriched=false.
// AI enrichment is handled separately by enrichCallRecords to avoid timeouts.

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    let connResult;
    try {
      connResult = await base44.asServiceRole.connectors.getConnection("googlesheets");
    } catch (connErr) {
      await sendCallLogErrorEmail(base44,
        "Google Sheets Connection Error",
        `The scheduled call log sync could not connect to Google Sheets.\n\nError: ${connErr.message}\n\nThis usually means the Google Sheets connection needs to be re-authorized. New calls will not be imported until this is fixed.`
      );
      return Response.json({ error: "getConnection failed: " + connErr.message }, { status: 500 });
    }
    const { accessToken } = connResult;
    const spreadsheetId = Deno.env.get("GOOGLE_SHEET_ID");

    // Load AppSettings for last_synced_call_date (high-water mark)
    const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
    const settings = settingsList?.[0] || null;
    const lastSyncedDate = settings?.last_synced_call_date || null;

    // Scan back 60 days of calls (not a fixed row count). Calls are prepended
    // at the top (newest first), so we read in chunks from row 2 and stop once
    // a chunk's oldest row is older than the 60-day cutoff.
    const cutoffDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const CHUNK_SIZE = 500;

    // First, get the actual sheet name from spreadsheet metadata
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!metaRes.ok) {
      const err = await metaRes.text();
      await sendCallLogErrorEmail(base44,
        "Sheet Metadata Error",
        `The scheduled call log sync could not read the Google Sheet metadata.\n\nError: ${err}\n\nNew calls will not be imported until this is fixed.`
      );
      return Response.json({ error: "metadata fetch failed: " + err }, { status: metaRes.status });
    }
    const metaJson = await metaRes.json();
    const sheetName = metaJson.sheets?.[0]?.properties?.title || "Sheet1";

    const headersRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${sheetName}!1:1`)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!headersRes.ok) {
      const err = await headersRes.text();
      await sendCallLogErrorEmail(base44,
        "Sheet Headers Error",
        `The scheduled call log sync could not read the Google Sheet headers.\n\nError: ${err}\n\nNew calls will not be imported until this is fixed.`
      );
      return Response.json({ error: err }, { status: headersRes.status });
    }

    const headersData = await headersRes.json();
    const headers = headersData.values?.[0] || [];
    if (!headers.length) return Response.json({ imported: 0, skipped: 0 });

    // Resolve column indices by header name (with fallback to current hardcoded positions).
    const cols = resolveColumns(headers);
    const { colDate, colDuration, colCallId } = cols;

    // Read rows in chunks from the top until we pass the 60-day cutoff
    const rawRows = [];
    let chunkStart = 2;
    let reachedCutoff = false;
    while (!reachedCutoff) {
      const chunkEnd = chunkStart + CHUNK_SIZE - 1;
      const dataRange = `${sheetName}!${chunkStart}:${chunkEnd}`;
      const dataRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(dataRange)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!dataRes.ok) {
        const err = await dataRes.text();
        await sendCallLogErrorEmail(base44,
          "Sheet Data Error",
          `The scheduled call log sync could not read the Google Sheet data (rows ${chunkStart}-${chunkEnd}).\n\nError: ${err}\n\nNew calls will not be imported until this is fixed.`
        );
        return Response.json({ error: err }, { status: dataRes.status });
      }

      const dataJson = await dataRes.json();
      const chunkRows = dataJson.values || [];
      if (chunkRows.length === 0) break;

      // Check the last row's date — if older than cutoff, we've read past 60 days
      const lastRow = chunkRows[chunkRows.length - 1];
      const lastDate = parseCallDate(lastRow[colDate]);
      if (lastDate && lastDate < cutoffDate) {
        reachedCutoff = true;
      }

      rawRows.push(...chunkRows);

      if (chunkRows.length < CHUNK_SIZE) break; // reached end of sheet
      chunkStart = chunkEnd + 1;

      // Safety cap: don't read more than 5000 rows per run
      if (rawRows.length >= 5000) break;
    }

    if (rawRows.length === 0) {
      return Response.json({ imported: 0, skipped: 0, message: "No rows found" });
    }

    // Map rows to objects using actual sheet row numbers (row 2 = first data row)
    const records = rawRows.map((row, idx) => {
      const obj = { __rowIndex: 2 + idx, __raw: row };
      headers.forEach((h, i) => {
        if (h && h.trim()) obj[h.trim()] = row[i] ?? "";
      });
      obj.__callId = colCallId >= 0 ? (row[colCallId] || "").trim() : "";
      obj.__parsedDate = parseCallDate(row[colDate]);
      return obj;
    });

    // Filter: must have data and duration >= 30 seconds
    const rowsWithData = records.filter(row => {
      const hasAnyData = Object.entries(row).some(([k, v]) => k !== '__rowIndex' && k !== '__raw' && k !== '__parsedDate' && v !== '');
      if (!hasAnyData) return false;
      if (colDuration >= 0) {
        const durSec = parseDurationSeconds(row.__raw[colDuration]);
        if (durSec === null || durSec < 30) return false;
      }
      return true;
    });

    // Date-based filter: only process rows newer than last_synced_call_date
    // (or all rows if no high-water mark exists yet). This reduces the dedup
    // query from ~470 IDs to just the handful of new calls.
    let rowsToProcess = rowsWithData;
    if (lastSyncedDate) {
      rowsToProcess = rowsWithData.filter(row => !row.__parsedDate || row.__parsedDate > lastSyncedDate);
    }

    // Dedup check: use Call ID when available, fall back to sheet_row_N.
    // Query in batches to avoid 414 (URI too long) when scanning many rows.
    let existingIds = new Set();
    if (rowsToProcess.length > 0) {
      const zoomIds = rowsToProcess.map(r => r.__callId || `sheet_row_${r.__rowIndex}`);
      const DEDUP_BATCH = 100;
      for (let i = 0; i < zoomIds.length; i += DEDUP_BATCH) {
        const batch = zoomIds.slice(i, i + DEDUP_BATCH);
        const existingCalls = await base44.asServiceRole.entities.CallRecord.filter({ zoom_meeting_id: { $in: batch } });
        existingCalls.forEach(c => existingIds.add(c.zoom_meeting_id));
      }
    }

    let imported = 0;
    let skipped = 0;
    const recordsToCreate = [];

    for (const row of rowsToProcess) {
      const rowKey = row.__callId || `sheet_row_${row.__rowIndex}`;
      if (existingIds.has(rowKey)) {
        skipped++;
        continue;
      }
      recordsToCreate.push(buildCallRecord(row.__raw, cols, row.__rowIndex, row.__callId));
    }

    // Bulk-create in batches of 50
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

    // Update last_synced_call_date to the newest parsed date across ALL rows
    // (not just imported ones) so the next run skips already-seen rows
    const maxDate = records
      .map(r => r.__parsedDate)
      .filter(Boolean)
      .sort()
      .pop();
    if (maxDate && (!lastSyncedDate || maxDate > lastSyncedDate)) {
      if (settings) {
        await base44.asServiceRole.entities.AppSettings.update(settings.id, {
          last_synced_call_date: maxDate,
        });
      } else {
        await base44.asServiceRole.entities.AppSettings.create({
          key: "global",
          last_synced_call_date: maxDate,
        });
      }
    }

    return Response.json({ imported, skipped, pendingEnrichment: imported, rowsScanned: rawRows.length, cutoffDate });
  } catch (error) {
    await sendCallLogErrorEmail(base44,
      "Unexpected Error",
      `The scheduled call log sync encountered an unexpected error.\n\nError: ${error.message}\n\nNew calls will not be imported until this is fixed.`
    );
    return Response.json({ error: error.message }, { status: 500 });
  }
});