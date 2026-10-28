// How long a caller has to be on the line before the call counts.
//
// An incoming call where the caller was on the line for less than 10 seconds
// (answered or not — a hang-up, a pocket dial, a quick wrong number) counts for
// nothing: not in the totals, the charts, or the missed-call numbers.
export const MIN_INBOUND_SECONDS = 10;

// Outbound calls keep their existing 30-second floor.
export const MIN_OUTBOUND_SECONDS = 30;

export function isCountableCall(call) {
  const seconds = Number(call?.call_duration_seconds);
  if (!Number.isFinite(seconds)) return false;
  const minimum = call?.call_direction === "inbound" ? MIN_INBOUND_SECONDS : MIN_OUTBOUND_SECONDS;
  return seconds >= minimum;
}