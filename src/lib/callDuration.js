// How long a caller has to be on the line before the call counts.
//
// Anything shorter — inbound or outbound — counts for nothing: not in the
// totals, the charts, or the missed-call numbers.
//
// One exception: an inbound missed call that lands outside business hours.
// After hours every call rolls straight to the queue or voicemail, so its
// duration says nothing about whether it was "real" — short or even
// unrecorded, it was still a call no one could answer. Those are counted.
import moment from "moment-timezone";
import { getAppTimezone } from "@/lib/timezone";

export const MIN_INBOUND_SECONDS = 15;
export const MIN_OUTBOUND_SECONDS = 15;

// Clinic business hours (America/New_York): Mon–Fri 7am–7pm, Sat/Sun 8am–6pm.
export function isClinicOpen(date, timezone = getAppTimezone()) {
  const m = moment(date).tz(timezone);
  const day = m.day();
  const hour = m.hour();
  const isWeekend = day === 0 || day === 6;
  return isWeekend ? hour >= 8 && hour < 18 : hour >= 7 && hour < 19;
}

export function isCountableCall(call, timezone = getAppTimezone()) {
  const seconds = Number(call?.call_duration_seconds);
  const minimum = call?.call_direction === "inbound" ? MIN_INBOUND_SECONDS : MIN_OUTBOUND_SECONDS;
  if (Number.isFinite(seconds) && seconds >= minimum) return true;
  // After-hours inbound missed calls count regardless of duration.
  if (call?.call_direction === "inbound" && call?.missed_call && !isClinicOpen(call?.call_date, timezone)) {
    return true;
  }
  return false;
}