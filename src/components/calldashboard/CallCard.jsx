import { Card } from "@/components/ui/card";
import { PhoneIncoming, PhoneOutgoing, Clock, User, ChevronRight, PhoneMissed } from "lucide-react";
import CallerTypeBadge from "./CallerTypeBadge";
import BookingStatus from "./BookingStatus";
import { cn } from "@/lib/utils";

export default function CallCard({ call, onClick, nameMap = {} }) {
  const date = new Date(call.call_date);
  const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const duration = call.call_duration_seconds
    ? `${Math.floor(call.call_duration_seconds / 60)}m ${call.call_duration_seconds % 60}s` : "—";

  return (
    <Card className={cn("border-0 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group", call.status === "flagged" && "ring-1 ring-amber-300", call.status === "reviewed" && "opacity-75", call.missed_call && "ring-1 ring-rose-200 bg-rose-50/30")} onClick={() => onClick?.(call)}>
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                {call.call_direction === "outbound" ? <PhoneOutgoing className="w-3 h-3 text-blue-400" /> : <PhoneIncoming className="w-3 h-3 text-emerald-400" />}
                <span className={cn("font-medium", call.call_direction === "outbound" ? "text-blue-500" : "text-emerald-500")}>{call.call_direction === "outbound" ? "Outgoing" : "Incoming"}</span>
                <span className="text-slate-300">·</span>
                <span className="font-medium text-slate-400">{dateStr} · {timeStr}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400"><Clock className="w-3 h-3" /><span>{duration}</span></div>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div>
                <p className="text-sm font-semibold text-slate-900 truncate">{call.caller_name || call.caller_phone || "Unknown Caller"}</p>
                {call.caller_phone && call.caller_name && <p className="text-xs text-slate-400">{call.caller_phone}</p>}
              </div>
              {call.team_member && call.team_member !== "Please Check" ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50">
                  <User className="w-3 h-3 text-slate-400" />
                  <span className="text-xs font-medium text-slate-600">{call.team_member}</span>
                </div>
              ) : call.team_member === "Please Check" ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50">
                  <User className="w-3 h-3 text-amber-400" />
                  <span className="text-xs font-medium text-amber-600">Please Check</span>
                </div>
              ) : call.missed_call ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50">
                  <PhoneMissed className="w-3 h-3 text-rose-400" />
                  <span className="text-xs font-medium text-rose-600">Missed Call</span>
                </div>
              ) : call.call_direction === "inbound" ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50">
                  <User className="w-3 h-3 text-amber-400" />
                  <span className="text-xs font-medium text-amber-600">Not Answered</span>
                </div>
              ) : null}
            </div>
            {call.caller_intent && <p className="text-sm text-slate-600 line-clamp-1"><span className="text-slate-400 font-medium">Intent:</span> {call.caller_intent}</p>}
            <div className="flex flex-wrap items-center gap-2">
              {call.missed_call && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-600">
                  <PhoneMissed className="w-3 h-3" /> Missed
                </span>
              )}
              <CallerTypeBadge type={call.caller_type} />
              <BookingStatus bookable={call.bookable} wasBooked={call.was_booked} bookedDate={call.booked_date} bookingOutcome={call.booking_outcome} />
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors mt-1 flex-shrink-0" />
        </div>
      </div>
    </Card>
  );
}