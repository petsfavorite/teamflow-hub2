// Shared call-record deduplication helpers used by dedupCallRecords.
// Two records are duplicates if they share the same zoom_meeting_id (a real
// Zoom UUID, not a sheet_row_N placeholder) OR the same fingerprint
// (direction + last-10-digits phone + call_date within 3 minutes).

export const digits = (v) => String(v || "").replace(/\D/g, "").slice(-10);

export const isRealZoomId = (id) => {
  const s = String(id || "");
  return s.length > 0 && !s.startsWith("sheet_row_");
};

// Score a record by how much useful data it carries. Higher = keep this one.
export function scoreRecord(r) {
  let score = 0;
  if ((r.transcript || "").trim()) score += 5;
  if (r.ai_enriched) score += 3;
  if ((r.transcript_summary || "").trim()) score += 2;
  if ((r.ai_notes || "").trim()) score += 2;
  if ((r.team_member || "").trim()) score += 3;
  if ((r.recording_url || "").trim()) score += 1;
  if ((r.zoom_recording_id || "").trim()) score += 1;
  if ((r.recording_drive_file_id || "").trim()) score += 1;
  if ((r.caller_name || "").trim()) score += 1;
  if ((r.caller_type || "").trim()) score += 1;
  if ((r.caller_intent || "").trim()) score += 1;
  if ((r.bookable || "").trim()) score += 1;
  if ((r.booking_outcome || "").trim()) score += 1;
  if (typeof r.was_booked === "boolean") score += 1;
  if (typeof r.booking_offered === "boolean") score += 1;
  if (typeof r.missed_call === "boolean") score += 1;
  if (typeof r.clinic_closed === "boolean") score += 1;
  if (r.status === "reviewed") score += 2;
  if (r.status === "flagged") score += 1;
  // Prefer a real Zoom UUID over a sheet_row_N placeholder.
  if (isRealZoomId(r.zoom_meeting_id)) score += 2;
  return score;
}

// Merge fields from the losers into the winner, filling gaps only.
export function mergeInto(winner, losers) {
  const merged = { ...winner };
  const fields = [
    "transcript", "transcript_summary", "ai_notes",
    "caller_name", "caller_phone", "caller_type", "caller_intent",
    "team_member", "bookable", "booking_outcome", "booked_date",
    "recording_url", "zoom_recording_id", "recording_drive_file_id",
  ];
  for (const f of fields) {
    if (!(merged[f] || "").trim()) {
      for (const l of losers) {
        if ((l[f] || "").trim()) { merged[f] = l[f]; break; }
      }
    }
  }
  // Booleans: adopt from a loser if the winner is missing them.
  for (const f of ["was_booked", "booking_offered", "missed_call", "clinic_closed"]) {
    if (typeof merged[f] !== "boolean") {
      for (const l of losers) {
        if (typeof l[f] === "boolean") { merged[f] = l[f]; break; }
      }
    }
  }
  // ai_enriched: true if any duplicate was enriched.
  if (!merged.ai_enriched) {
    for (const l of losers) { if (l.ai_enriched) { merged.ai_enriched = true; break; } }
  }
  // status: prefer the most-reviewed.
  const rank = { reviewed: 3, flagged: 2, pending_review: 1 };
  for (const l of losers) {
    if ((rank[l.status] || 0) > (rank[merged.status] || 0)) merged.status = l.status;
  }
  // Duration: prefer the larger (sometimes one source truncates).
  for (const l of losers) {
    if ((l.call_duration_seconds || 0) > (merged.call_duration_seconds || 0)) {
      merged.call_duration_seconds = l.call_duration_seconds;
    }
  }
  // Prefer a real Zoom UUID over sheet_row_N.
  if (!isRealZoomId(merged.zoom_meeting_id)) {
    for (const l of losers) {
      if (isRealZoomId(l.zoom_meeting_id)) { merged.zoom_meeting_id = l.zoom_meeting_id; break; }
    }
  }
  return merged;
}

export function fingerprint(r) {
  return {
    t: new Date(r.call_date).getTime(),
    dir: r.call_direction,
    phone: digits(r.caller_phone),
  };
}

export function sameFingerprint(a, b) {
  return a.dir === b.dir && a.phone === b.phone && a.phone.length >= 7 &&
    Math.abs(a.t - b.t) <= 3 * 60000;
}