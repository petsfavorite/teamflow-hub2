import { Badge } from "@/components/ui/badge";
import { CalendarCheck, CalendarX, CalendarMinus } from "lucide-react";

export default function BookingStatus({ bookable, wasBooked, bookedDate, bookingOutcome }) {
  if (bookingOutcome === "appt_not_booked") {
    return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 gap-1 text-xs"><CalendarX className="w-3 h-3" />Missed Booking</Badge>;
  }
  const isBooked = wasBooked || bookingOutcome === "appt_booked";
  if (isBooked) {
    return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 text-xs"><CalendarCheck className="w-3 h-3" />Booked</Badge>;
  }
  return <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 gap-1 text-xs"><CalendarMinus className="w-3 h-3" />Not Bookable</Badge>;
}