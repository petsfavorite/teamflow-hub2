import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// FAST IMPORT ONLY — no AI analysis. Pulls raw sheet rows and creates
// CallRecord entries marked pending_review with ai_enriched=false.
// AI enrichment is handled separately by enrichCallRecords to avoid timeouts.

function extractRecordingUrl(rawLink) {
  if (!rawLink) return null;
  const trimmed = String(rawLink).trim();
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed);
      return obj.webViewLink || obj.webContentLink || obj.url || null;
    } catch { return null; }
  }
  if (trimmed.startsWith("http")) return trimmed;
  return null;
}

const AUDIO_LINK_HEADERS = [
  "audio link", "recording link", "recording url", "audio url",
  "call audio", "audio", "recording", "link to audio", "audio file",
  "call recording", "recording link url", "audio recording", "call audio link",
];

function parseDurationSeconds(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s.includes(":")) {
    const parts = s.split(":").map(Number);
    if (parts.length === 2 && !parts.some(isNaN)) return parts[0] * 60 + parts[1];
    if (parts.length === 3 && !parts.some(isNaN)) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  const num = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isNaN(num) ? null : num;
}

function findAudioLinkHeader(headers) {
  return headers.find(h => {
    if (!h || !h.trim()) return false;
    const lower = h.trim().toLowerCase();
    return AUDIO_LINK_HEADERS.some(ah => lower === ah);
  });
}

// Returns the Eastern timezone offset in ms to ADD to a "local-as-UTC" timestamp
function easternOffsetMs(msFromEpoch) {
  const d = new Date(msFromEpoch);
  const year = d.getUTCFullYear();
  const dstStart = new Date(Date.UTC(year, 2, 8, 2, 0, 0));
  while (dstStart.getUTCDay() !== 0) dstStart.setUTCDate(dstStart.getUTCDate() + 1);
  const dstEnd = new Date(Date.UTC(year, 10, 1, 2, 0, 0));
  while (dstEnd.getUTCDay() !== 0) dstEnd.setUTCDate(dstEnd.getUTCDate() + 1);
  const isDST = msFromEpoch >= dstStart.getTime() && msFromEpoch < dstEnd.getTime();
  return isDST ? 4 * 3600 * 1000 : 5 * 3600 * 1000;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let connResult;
    try {
      connResult = await base44.asServiceRole.connectors.getConnection("googlesheets");
    } catch (connErr) {
      return Response.json({ error: "getConnection failed: " + connErr.message }, { status: 500 });
    }
    const { accessToken } = connResult;
    const spreadsheetId = Deno.env.get("GOOGLE_SHEET_ID");

    // New calls are PREPENDED at the top of the sheet — always scan from row 2.
    const startRow = 2;
    const endRow = startRow + 499; // 500-row window from the top

    // First, get the actual sheet name from spreadsheet metadata
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!metaRes.ok) {
      const err = await metaRes.text();
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
      return Response.json({ error: err }, { status: headersRes.status });
    }

    const headersData = await headersRes.json();
    const headers = headersData.values?.[0] || [];
    if (!headers.length) return Response.json({ imported: 0, skipped: 0 });

    const audioLinkHeader = findAudioLinkHeader(headers);
    const durationHeader = headers.find(h => h && h.trim().toLowerCase().includes("duration"));
    const callIdHeader = headers.find(h => h && h.trim().toLowerCase() === "call id");

    // Fetch the window of rows
    const dataRange = `${sheetName}!${startRow}:${endRow}`;
    const dataRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(dataRange)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!dataRes.ok) {
      const err = await dataRes.text();
      return Response.json({ error: err }, { status: dataRes.status });
    }

    const dataJson = await dataRes.json();
    const rawRows = dataJson.values || [];

    if (rawRows.length === 0) {
      return Response.json({ imported: 0, skipped: 0, message: "No rows found" });
    }

    // Map rows to objects using actual sheet row numbers
    const records = rawRows.map((row, idx) => {
      const obj = { __rowIndex: startRow + idx, __raw: row };
      headers.forEach((h, i) => {
        if (h && h.trim()) obj[h.trim()] = row[i] ?? "";
      });
      obj.__callId = callIdHeader ? (row[headers.indexOf(callIdHeader)] || "").trim() : "";
      return obj;
    });

    const rowsToProcess = records.filter(row => {
      const hasAnyData = Object.entries(row).some(([k, v]) => k !== '__rowIndex' && k !== '__raw' && v !== '');
      if (!hasAnyData) return false;
      // Skip calls with no duration or shorter than 10 seconds
      if (durationHeader) {
        const durSec = parseDurationSeconds(row[durationHeader]);
        if (durSec === null || durSec < 10) return false;
      }
      return true;
    });

    // Dedup check: use Call ID when available, fall back to sheet_row_N
    const zoomIds = rowsToProcess.map(r => r.__callId || `sheet_row_${r.__rowIndex}`);
    const existingCalls = await base44.asServiceRole.entities.CallRecord.filter({ zoom_meeting_id: { $in: zoomIds } });
    const existingIds = new Set(existingCalls.map(c => c.zoom_meeting_id));

    let imported = 0;
    let skipped = 0;
    const recordsToCreate = [];

    for (const row of rowsToProcess) {
      const rowKey = row.__callId || `sheet_row_${row.__rowIndex}`;
      if (existingIds.has(rowKey)) {
        skipped++;
        continue;
      }

      const directionRaw = String(row.__raw[1] || "").toLowerCase().trim();
      const call_direction = directionRaw.startsWith("out") || directionRaw === "out" ? "outbound" : "inbound";
      const transcript = String(row.__raw[11] || "").trim();

      const phoneRaw = call_direction === "inbound" ? String(row.__raw[2] || "") : String(row.__raw[4] || "");
      const nameRaw = call_direction === "inbound" ? String(row.__raw[3] || "") : String(row.__raw[5] || "");
      const caller_phone = (phoneRaw && phoneRaw.toLowerCase() !== "anonymous") ? phoneRaw.trim() : null;
      const caller_name = nameRaw.trim() || null;

      const recording_url = extractRecordingUrl(row.__raw[9]);
      const call_duration_seconds = durationHeader ? parseDurationSeconds(row[durationHeader]) : null;

      // Parse date
      let callDateISO = new Date().toISOString();
      const dateRaw = String(row.__raw[0] || "");
      if (dateRaw) {
        const serial = parseFloat(dateRaw);
        if (!isNaN(serial) && serial > 40000) {
          const msFromEpoch = (serial - 25569) * 86400 * 1000;
          callDateISO = new Date(msFromEpoch + easternOffsetMs(msFromEpoch)).toISOString();
        } else if (dateRaw.includes("/") || dateRaw.includes("-")) {
          const parsed = new Date(dateRaw);
          if (!isNaN(parsed)) callDateISO = parsed.toISOString();
        }
      }

      const zoom_meeting_id = row.__callId || `sheet_row_${row.__rowIndex}`;

      recordsToCreate.push({
        zoom_meeting_id,
        call_date: callDateISO,
        call_direction,
        call_duration_seconds,
        caller_phone,
        caller_name,
        transcript: transcript || null,
        recording_url,
        missed_call: false, // will be set by AI enricher
        status: "pending_review",
        ai_enriched: false,
        __rowIndex: row.__rowIndex,
      });
    }

    // Bulk-create in batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < recordsToCreate.length; i += BATCH_SIZE) {
      const batch = recordsToCreate.slice(i, i + BATCH_SIZE);
      const payloads = batch.map(({ __rowIndex, ...r }) => r);
      try {
        await base44.asServiceRole.entities.CallRecord.bulkCreate(payloads);
        imported += batch.length;
      } catch (err) {
        console.error(`Batch ${i} create failed:`, err.message);
      }
    }

    return Response.json({ imported, skipped, pendingEnrichment: imported });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});