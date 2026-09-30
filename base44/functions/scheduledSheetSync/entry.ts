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
    // A1 notation needs single quotes around tab names (spaces, punctuation)
    const q = `'${sheetName.replace(/'/g, "''")}'`;

    const headersRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${q}!1:1`)}`,
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
    if (colCallId < 0) {
      // Without a Call ID column, records are keyed by sheet row number, which shifts
      // whenever rows are inserted at the top — causing duplicates and mismatches.
      await sendCallLogErrorEmail(base44,
        "Sheet Missing Call ID Column",
        `The call log sheet has no "Call ID" column, so calls are identified by sheet row number. If new rows are inserted at the top of the sheet, calls can be duplicated or matched to the wrong record.\n\nColumns found: ${headers.join(", ")}`
      );
    }

    // Read rows in chunks from the top until we pass the 60-day cutoff
    const rawRows = [];
    let chunkStart = 2;
    let reachedCutoff = false;
    while (!reachedCutoff) {
      const chunkEnd = chunkStart + CHUNK_SIZE - 1;
      const dataRange = `${q}!${chunkStart}:${chunkEnd}`;
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

    // Date-based filter: only process rows newer than last_synced_call_date, minus a
    // 24h overlap. The overlap catches calls that land in the sheet late (their start
    // time is older than the newest row) and rows whose transcript is filled in after
    // the first import. The dedup check below keeps the overlap from creating duplicates.
    const LOOKBACK_MS = 24 * 60 * 60 * 1000;
    let rowsToProcess = rowsWithData;
    if (lastSyncedDate) {
      const floor = new Date(new Date(lastSyncedDate).getTime() - LOOKBACK_MS).toISOString();
      rowsToProcess = rowsWithData.filter(row => !row.__parsedDate || row.__parsedDate > floor);
    }

    // Dedup check: use Call ID when available, fall back to sheet_row_N.
    // Query in batches to avoid 414 (URI too long) when scanning many rows.
    // Skip entirely when there are no new rows to process (saves entity reads).
    const existingById = new Map();
    if (rowsToProcess.length > 0) {
      const zoomIds = rowsToProcess.map(r => r.__callId || `sheet_row_${r.__rowIndex}`);
      const DEDUP_BATCH = 100;
      for (let i = 0; i < zoomIds.length; i += DEDUP_BATCH) {
        const batch = zoomIds.slice(i, i + DEDUP_BATCH);
        const existingCalls = await base44.asServiceRole.entities.CallRecord.filter({ zoom_meeting_id: { $in: batch } });
        existingCalls.forEach(c => existingById.set(c.zoom_meeting_id, c));
      }
    }

    // Fingerprints of recent records (any source), so a call already imported by the direct
    // Zoom pull under a different ID format is not imported a second time from the sheet.
    const digits = (v) => String(v || "").replace(/\D/g, "").slice(-10);
    let recentFingerprints = [];
    if (rowsToProcess.length > 0) {
      const recentFloor = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
      const recent = await base44.asServiceRole.entities.CallRecord.filter(
        { call_date: { $gte: recentFloor } }, "-call_date", 3000
      );
      recentFingerprints = recent.map(r => ({
        t: new Date(r.call_date).getTime(), dir: r.call_direction, phone: digits(r.caller_phone),
      }));
    }
    const seenElsewhere = (rec) => {
      const t = new Date(rec.call_date).getTime();
      const phone = digits(rec.caller_phone);
      return recentFingerprints.some(f => f.dir === rec.call_direction && f.phone === phone && Math.abs(f.t - t) <= 3 * 60000);
    };

    let imported = 0;
    let skipped = 0;
    let transcriptsFilled = 0;
    const recordsToCreate = [];
    const failures = [];

    for (const row of rowsToProcess) {
      const rowKey = row.__callId || `sheet_row_${row.__rowIndex}`;
      const existing = existingById.get(rowKey);
      if (existing) {
        skipped++;
        // Transcript arrived after the first import: fill it in and re-queue for AI.
        const built = buildCallRecord(row.__raw, cols, row.__rowIndex, row.__callId);
        if (built.transcript && !(existing.transcript || "").trim()) {
          try {
            await base44.asServiceRole.entities.CallRecord.update(existing.id, {
              transcript: built.transcript,
              ai_enriched: false,
              enrich_attempts: 0,
            });
            transcriptsFilled++;
          } catch (err) {
            failures.push(`transcript update ${rowKey}: ${err.message}`);
          }
        }
        continue;
      }
      const built = buildCallRecord(row.__raw, cols, row.__rowIndex, row.__callId);
      // Only trust the fingerprint for rows with a real parsed date and a phone number.
      if (row.__parsedDate && built.caller_phone && seenElsewhere(built)) { skipped++; continue; }
      recordsToCreate.push(built);
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
        failures.push(`create batch ${i}: ${err.message}`);
      }
    }

    if (failures.length > 0) {
      await sendCallLogErrorEmail(base44,
        "Call Import Failed",
        `The call log sync could not save some calls to the database.\n\nErrors:\n${failures.slice(0, 5).join("\n")}\n\nThe sync will retry these calls automatically on the next run.`
      );
    }

    // Newest call date in the sheet, ignoring rows dated more than a day in the future
    // (a bad date must not poison the high-water mark and hide every later call).
    const sanityLimit = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const newestInSheet = records
      .map(r => r.__parsedDate)
      .filter(d => d && d <= sanityLimit)
      .sort()
      .pop() || null;

    // Advance the high-water mark only when every row was saved successfully, so a
    // failed batch is retried next run instead of being skipped forever.
    const settingsPatch = { last_sync_run_at: new Date().toISOString() };
    if (newestInSheet) settingsPatch.last_sync_newest_call_date = newestInSheet;
    if (imported > 0) settingsPatch.last_sync_imported_at = new Date().toISOString();
    if (failures.length === 0 && newestInSheet && (!lastSyncedDate || newestInSheet > lastSyncedDate)) {
      settingsPatch.last_synced_call_date = newestInSheet;
    }
    if (settings) {
      await base44.asServiceRole.entities.AppSettings.update(settings.id, settingsPatch);
    } else {
      await base44.asServiceRole.entities.AppSettings.create({ key: "global", ...settingsPatch });
    }

    // Stale-sheet alert: the sync itself is healthy but nothing new is landing in the
    // sheet during business hours, so the Zoom -> Sheet step has likely stopped.
    const STALE_HOURS = 3;
    const et = new Date().toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", hour12: false });
    const isWeekday = !/^(Sat|Sun)/.test(et);
    const etHour = parseInt(et.replace(/\D/g, ""), 10);
    const duringBusinessHours = isWeekday && etHour >= 9 && etHour < 17;
    const hoursSinceNewest = newestInSheet ? (Date.now() - new Date(newestInSheet).getTime()) / 3600000 : null;
    // If the direct Zoom pull is running, a quiet sheet is expected and not an error.
    const zoomPullHealthy = settings?.last_zoom_pull_at &&
      Date.now() - new Date(settings.last_zoom_pull_at).getTime() < 30 * 60000;
    if (!zoomPullHealthy && duringBusinessHours && (hoursSinceNewest === null || hoursSinceNewest > STALE_HOURS)) {
      await sendCallLogErrorEmail(base44,
        "No New Calls in Sheet",
        `The Google Sheet has not received a new call in ${hoursSinceNewest === null ? "an unknown time" : hoursSinceNewest.toFixed(1) + " hours"} (newest call: ${newestInSheet || "none found"}), and it is currently business hours.\n\nThe app's sync is running fine, so the step that copies Zoom Phone calls into the sheet has probably stopped. Check that tool, and check that the sheet has not run out of rows.`
      );
    }

    return Response.json({
      imported, skipped, transcriptsFilled, failures: failures.slice(0, 5), pendingEnrichment: imported + transcriptsFilled,
      rowsScanned: rawRows.length, cutoffDate,
      lastSyncedDate: lastSyncedDate || null,
      newestDateInSheet: newestInSheet || null,
      rowsWithDataCount: rowsWithData.length,
      rowsToProcessCount: rowsToProcess.length,
    });
  } catch (error) {
    await sendCallLogErrorEmail(base44,
      "Unexpected Error",
      `The scheduled call log sync encountered an unexpected error.\n\nError: ${error.message}\n\nNew calls will not be imported until this is fixed.`
    );
    return Response.json({ error: error.message }, { status: 500 });
  }
});