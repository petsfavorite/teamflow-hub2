// Shared helpers for Google Sheets call-log sync functions.
// Used by scheduledSheetSync and backfillCallsByDateRange.

export function extractRecordingUrl(rawLink) {
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

export const AUDIO_LINK_HEADERS = [
  "audio link", "recording link", "recording url", "audio url",
  "call audio", "audio", "recording", "link to audio", "audio file",
  "call recording", "recording link url", "audio recording", "call audio link",
];

export function parseDurationSeconds(raw) {
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

export function findAudioLinkHeader(headers) {
  return headers.find(h => {
    if (!h || !h.trim()) return false;
    const lower = h.trim().toLowerCase();
    return AUDIO_LINK_HEADERS.some(ah => lower === ah);
  });
}

export function findCol(headers, candidates, fallback) {
  for (const c of candidates) {
    const idx = headers.findIndex(h => h && h.trim().toLowerCase() === c);
    if (idx >= 0) return idx;
  }
  return fallback;
}

export function easternOffsetMs(msFromEpoch) {
  const d = new Date(msFromEpoch);
  const year = d.getUTCFullYear();
  const dstStart = new Date(Date.UTC(year, 2, 8, 2, 0, 0));
  while (dstStart.getUTCDay() !== 0) dstStart.setUTCDate(dstStart.getUTCDate() + 1);
  const dstEnd = new Date(Date.UTC(year, 10, 1, 2, 0, 0));
  while (dstEnd.getUTCDay() !== 0) dstEnd.setUTCDate(dstEnd.getUTCDate() + 1);
  const isDST = msFromEpoch >= dstStart.getTime() && msFromEpoch < dstEnd.getTime();
  return isDST ? 4 * 3600 * 1000 : 5 * 3600 * 1000;
}

export function parseCallDate(dateRaw) {
  if (!dateRaw) return null;
  const s = String(dateRaw).trim();
  if (!s) return null;
  const serial = parseFloat(s);
  if (!isNaN(serial) && serial > 40000) {
    const msFromEpoch = (serial - 25569) * 86400 * 1000;
    return new Date(msFromEpoch + easternOffsetMs(msFromEpoch)).toISOString();
  }
  if (s.includes("/") || s.includes("-")) {
    const parsed = new Date(s);
    if (!isNaN(parsed)) return parsed.toISOString();
  }
  return null;
}

// Resolve all column indices from headers in one call.
export function resolveColumns(headers) {
  const colDate = findCol(headers, ["date", "start time", "call date", "start date", "time"], 0);
  const colDirection = findCol(headers, ["direction", "call direction", "type"], 1);
  const colFromPhone = findCol(headers, ["from number", "from phone", "caller number", "caller phone", "from"], 2);
  const colFromName = findCol(headers, ["from name", "caller name"], 3);
  const colToPhone = findCol(headers, ["to number", "to phone", "to"], 4);
  const colToName = findCol(headers, ["to name"], 5);
  const colTranscript = findCol(headers, ["transcript", "transcription"], 11);

  const audioLinkHeader = findAudioLinkHeader(headers);
  const colRecording = audioLinkHeader ? headers.indexOf(audioLinkHeader) : 9;
  const durationHeaderStr = headers.find(h => h && h.trim().toLowerCase().includes("duration"));
  const colDuration = durationHeaderStr ? headers.indexOf(durationHeaderStr) : -1;
  const callIdHeader = headers.find(h => h && h.trim().toLowerCase() === "call id");
  const colCallId = callIdHeader ? headers.indexOf(callIdHeader) : -1;

  return { colDate, colDirection, colFromPhone, colFromName, colToPhone, colToName, colTranscript, colRecording, colDuration, colCallId };
}

// Build a CallRecord payload from a raw sheet row (array) + resolved columns.
export function buildCallRecord(raw, cols, rowIndex, callId) {
  const directionRaw = String(raw[cols.colDirection] || "").toLowerCase().trim();
  const call_direction = directionRaw.startsWith("out") || directionRaw === "out" ? "outbound" : "inbound";
  const transcript = String(raw[cols.colTranscript] || "").trim();

  const phoneRaw = call_direction === "inbound" ? String(raw[cols.colFromPhone] || "") : String(raw[cols.colToPhone] || "");
  const nameRaw = call_direction === "inbound" ? String(raw[cols.colFromName] || "") : String(raw[cols.colToName] || "");
  const caller_phone = (phoneRaw && phoneRaw.toLowerCase() !== "anonymous") ? phoneRaw.trim() : null;
  const caller_name = nameRaw.trim() || null;

  const recording_url = extractRecordingUrl(raw[cols.colRecording]);
  const call_duration_seconds = cols.colDuration >= 0 ? parseDurationSeconds(raw[cols.colDuration]) : null;

  const zoom_meeting_id = callId || `sheet_row_${rowIndex}`;
  const parsedDate = parseCallDate(raw[cols.colDate]);

  return {
    zoom_meeting_id,
    call_date: parsedDate || new Date().toISOString(),
    call_direction,
    call_duration_seconds,
    caller_phone,
    caller_name,
    transcript: transcript || null,
    recording_url,
    missed_call: false,
    status: "pending_review",
    ai_enriched: false,
  };
}