import { Badge } from "@/components/ui/badge";
import { CalendarCheck, CalendarX, CalendarMinus, Handshake, HandshakeIcon } from "lucide-react";

export default function BookingStatus({ bookable, wasBooked, bookedDate, bookingOutcome, bookingOffered }) {
  if (bookingOutcome === "appt_not_booked") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 gap-1 text-xs"><CalendarX className="w-3 h-3" />Missed Booking</Badge>
        {bookingOffered === true && (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1 text-xs"><Handshake className="w-3 h-3" />Booking Offered</Badge>
        )}
        {bookingOffered === false && (
          <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 gap-1 text-xs"><Handshake className="w-3 h-3" />No Booking Offered</Badge>
        )}
      </div>
    );
  }
  const isBooked = wasBooked || bookingOutcome === "appt_booked";
  if (isBooked) {
    return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 text-xs"><CalendarCheck className="w-3 h-3" />Booked</Badge>;
  }
  return <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 gap-1 text-xs"><CalendarMinus className="w-3 h-3" />Not Bookable</Badge>;
}