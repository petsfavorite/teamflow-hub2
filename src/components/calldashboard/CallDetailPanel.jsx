import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneIncoming, PhoneOutgoing, Clock, User, FileText, MessageSquare, CalendarCheck, Music, ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import CallerTypeBadge from "./CallerTypeBadge";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

const VALID_STAFF = [
  "Caroline Cofer", "Rebecca Evatt", "Skye Means", "Jody Miranda",
  "Jen Rising", "Katie DeJesus", "Hailey Laughter", "Support Staff"
];

const DEFAULT_CALLER_TYPES = [
  { value: "potential_client", label: "Potential Client" },
  { value: "returning_client", label: "Returning Client" },
  { value: "not_applicable", label: "Not a Client" },
];
const DEFAULT_BOOKING_OUTCOMES = [
  { value: "appt_booked", label: "Appt Booked" },
  { value: "appt_not_booked", label: "Appt Not Booked" },
  { value: "appt_not_needed", label: "Appt Not Needed" },
];

export default function CallDetailPanel({ call, open, onClose, onUpdate, isAdmin, users = [] }) {
  const [pendingChanges, setPendingChanges] = useState({});
  const [status, setStatus] = useState(call?.status || "pending_review");
  const [teamMember, setTeamMember] = useState(call?.team_member || "");
  const [callerType, setCallerType] = useState(call?.caller_type || "");
  const [bookingOutcome, setBookingOutcome] = useState(call?.booking_outcome || "");
  const [missedCall, setMissedCall] = useState(call?.missed_call || false);
  const [saving, setSaving] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const { data: appSettings } = useQuery({
    queryKey: ["appSettings"],
    queryFn: () => base44.entities.AppSettings.filter({ key: "global" }).then(r => r?.[0] || null),
  });
  const cdOptions = appSettings?.call_dashboard_options || {};
  const callerTypeOptions = cdOptions.caller_types?.length ? cdOptions.caller_types : DEFAULT_CALLER_TYPES;
  const bookingOutcomeOptions = cdOptions.booking_outcomes?.length ? cdOptions.booking_outcomes : DEFAULT_BOOKING_OUTCOMES;

  useEffect(() => {
    if (call) {
      setStatus(call.status || "pending_review");
      setTeamMember(call.team_member || "");
      setCallerType(call.caller_type || "");
      setBookingOutcome(call.booking_outcome || "");
      setMissedCall(call.missed_call || false);
      setPendingChanges({});
    }
  }, [call?.id]);

  useEffect(() => {
    if (!open && call && Object.keys(pendingChanges).length > 0) {
      base44.entities.CallRecord.update(call.id, pendingChanges);
      setPendingChanges({});
      onUpdate?.();
    }
  }, [open]);

  if (!call) return null;

  const date = new Date(call.call_date);
  const duration = call.call_duration_seconds ? `${Math.floor(call.call_duration_seconds / 60)}m ${call.call_duration_seconds % 60}s` : "—";

  const handleStatusChange = async (newStatus) => {
    setStatus(newStatus);
    setSaving(true);
    await base44.entities.CallRecord.update(call.id, { status: newStatus });
    setSaving(false);
    onUpdate?.();
  };

  const handleUpdate = (updates) => setPendingChanges(prev => ({ ...prev, ...updates }));

  return (
    <Sheet open={open} onOpenChange={(isOpen) => {
      if (!isOpen && Object.keys(pendingChanges).length > 0) {
        base44.entities.CallRecord.update(call.id, pendingChanges).then(() => { onUpdate?.(); setPendingChanges({}); });
      }
      onClose();
    }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-3 pb-4">
          <SheetTitle className="text-lg font-bold text-slate-900">Call Details</SheetTitle>
          <div className="flex flex-wrap items-center gap-2"><CallerTypeBadge type={call.caller_type} /></div>
        </SheetHeader>

        <div className="space-y-5 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <MetaItem icon={call.call_direction === "outbound" ? PhoneOutgoing : PhoneIncoming} label={call.call_direction === "outbound" ? "Outgoing Call" : "Incoming Call"} value={call.caller_name || call.caller_phone || "Unknown"} iconClass={call.call_direction === "outbound" ? "text-blue-400" : "text-emerald-400"} />
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 text-xs text-slate-400"><User className="w-3 h-3" />Team Member</div>
              {isAdmin ? (
                <Select value={teamMember || ""} onValueChange={(value) => { setTeamMember(value); handleUpdate({ team_member: value || null }); }}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="— None —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>— None —</SelectItem>
                    <SelectItem value="Please Check">⚠️ Please Check</SelectItem>
                    {VALID_STAFF.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm font-medium text-slate-700">{teamMember || "—"}</p>
              )}
            </div>
            <MetaItem icon={Clock} label="Date & Time" value={date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " · " + date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} />
            <MetaItem icon={Clock} label="Duration" value={duration} />
          </div>

          <Separator />

          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Caller Type</p>
            {isAdmin ? (
              <Select value={callerType} onValueChange={(value) => { setCallerType(value); handleUpdate({ caller_type: value }); }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {callerTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <div>
                {callerType === "potential_client" && <Badge className="bg-blue-100 text-blue-700">Potential Client</Badge>}
                {callerType === "returning_client" && <Badge className="bg-emerald-100 text-emerald-700">Returning Client</Badge>}
                {callerType === "not_applicable" && <Badge variant="outline">Not a Client</Badge>}
              </div>
            )}
          </div>

          {call.caller_intent && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Caller Intent</p>
              <p className="text-sm text-slate-700 leading-relaxed">{call.caller_intent}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Booking Outcome</p>
            {isAdmin ? (
              <Select value={bookingOutcome} onValueChange={(value) => { setBookingOutcome(value); handleUpdate({ booking_outcome: value }); }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {bookingOutcomeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm text-slate-600">
                {bookingOutcome === "appt_booked" && "Appt Booked"}
                {bookingOutcome === "appt_not_booked" && "Appt Not Booked"}
                {bookingOutcome === "appt_not_needed" && "Appt Not Needed"}
                {!bookingOutcome && "Not set"}
              </div>
            )}
            {bookingOutcome === "appt_booked" && call.booked_date && (
              <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <CalendarCheck className="w-3 h-3" />Booked for {new Date(call.booked_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>

          <Separator />

          {call.transcript_summary && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><MessageSquare className="w-3 h-3" />AI Summary</p>
              <div className="bg-blue-50 rounded-xl p-3.5"><p className="text-sm text-slate-700 leading-relaxed">{call.transcript_summary}</p></div>
            </div>
          )}

          {call.ai_notes && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">AI Notes</p>
              <p className="text-sm text-slate-600 leading-relaxed">{call.ai_notes}</p>
            </div>
          )}

          {call.recording_url && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Music className="w-3 h-3" />Call Recording</p>
              <a href={call.recording_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"><Music className="w-4 h-4" />Open Recording</a>
            </div>
          )}

          {call.transcript && (
            <div className="space-y-1.5">
              <button onClick={() => setTranscriptOpen(!transcriptOpen)} className="w-full flex items-center justify-between gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors">
                <span className="flex items-center gap-1.5"><FileText className="w-3 h-3" />Full Transcript</span>
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", transcriptOpen && "rotate-180")} />
              </button>
              {transcriptOpen && (
                <div className="bg-slate-50 rounded-xl p-3.5 max-h-64 overflow-y-auto">
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap font-mono">{call.transcript}</p>
                </div>
              )}
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Checkbox id="missed-call-checkbox" checked={missedCall} disabled={!isAdmin || saving}
                onCheckedChange={(checked) => { setMissedCall(!!checked); handleUpdate({ missed_call: !!checked }); }} />
              <label htmlFor="missed-call-checkbox" className={cn("text-sm font-medium cursor-pointer", isAdmin ? "text-slate-700" : "text-slate-500 cursor-default")}>
                Missed Call <span className="text-xs font-normal text-slate-400">(no one answered)</span>
              </label>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox id="flagged-checkbox" checked={status === "flagged"} disabled={!isAdmin || saving}
                onCheckedChange={async (checked) => handleStatusChange(checked ? "flagged" : "pending_review")} />
              <label htmlFor="flagged-checkbox" className={cn("text-sm font-medium cursor-pointer", isAdmin ? "text-slate-700" : "text-slate-500 cursor-default")}>Flag for Review</label>
              {saving && <span className="text-xs text-slate-400">Saving...</span>}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MetaItem({ icon: Icon, label, value, iconClass }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-xs text-slate-400"><Icon className={cn("w-3 h-3", iconClass || "text-slate-400")} />{label}</div>
      <p className="text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}