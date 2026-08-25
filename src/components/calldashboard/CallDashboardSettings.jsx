import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, Loader2, Sparkles, Users, MessageSquare } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/components/hooks/useCurrentUser";

const DEFAULT_OPTIONS = {
  caller_types: [
    { value: "potential_client", label: "Potential Client" },
    { value: "returning_client", label: "Returning Client" },
    { value: "not_applicable", label: "Not a Client" },
  ],
  booking_outcomes: [
    { value: "appt_booked", label: "Appt Booked" },
    { value: "appt_not_booked", label: "Appt Not Booked" },
    { value: "appt_not_needed", label: "Appt Not Needed" },
  ],
  call_statuses: [
    { value: "pending_review", label: "Pending Review" },
    { value: "reviewed", label: "Reviewed" },
    { value: "flagged", label: "Flagged" },
  ],
};

const DEFAULT_CALLER_TYPE_PROMPT = `Classify the CALLER (the external person, NOT the staff member) as one of:
- "potential_client": a new inquiry from someone who has not used the facility before
- "returning_client": an existing client who has used the facility before (they mention a pet by name, reference a previous visit, or are calling about an existing appointment/boarding stay)
- "not_applicable": NOT a client — vendor, wrong number, solicitor, personal call for a staff member, etc.
When in doubt between potential and returning, prefer "returning_client" if the caller seems familiar with the facility or mentions specific pets/services.`;

const DEFAULT_BOOKING_PROMPT = `Determine the booking outcome:
- "appt_booked": an appointment or boarding reservation was successfully scheduled during this call
- "appt_not_booked": a missed booking — the caller wanted to schedule something but no appointment was booked (ONLY when staff spoke live and failed to book)
- "appt_not_needed": no booking was needed — confirming existing appointment, prescription refill, payment, general question, or voicemail with no live conversation`;

const DEFAULT_BOOKING_OFFERED_PROMPT = `For calls where a booking was NOT made, determine if staff OFFERED an appointment:
- true: staff suggested a specific time/date or asked if the caller wanted to book, but the caller declined or did not commit
- false: no appointment was offered, the caller hung up before booking was discussed, or it was a voicemail/missed call`;

const DEFAULT_MISSED_CALL_PROMPT = `Determine if this INBOUND call was a "missed call" — no one at the clinic answered:
- true: the call went to voicemail, no staff member spoke, or the caller hung up before anyone answered
- false: a staff member answered and had a conversation (even briefly)
Outbound calls are NEVER missed calls.`;

function OptionList({ title, items, onChange }) {
  const addItem = () => onChange([...items, { value: "", label: "" }]);
  const removeItem = (i) => onChange(items.filter((_, idx) => idx !== i));
  const updateItem = (i, field, val) => {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: val };
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold text-slate-700">{title}</Label>
        <Button type="button" size="sm" variant="outline" onClick={addItem} className="h-7 text-xs gap-1">
          <Plus className="w-3 h-3" /> Add
        </Button>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              placeholder="Value (internal key)"
              value={item.value}
              onChange={(e) => updateItem(i, "value", e.target.value)}
              className="h-8 text-sm flex-1"
            />
            <Input
              placeholder="Display label"
              value={item.label}
              onChange={(e) => updateItem(i, "label", e.target.value)}
              className="h-8 text-sm flex-1"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(i)} className="h-8 w-8 p-0 text-rose-400 hover:text-rose-600 hover:bg-rose-50 flex-shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-slate-400 italic">No options — using defaults</p>}
      </div>
    </div>
  );
}

function NameAliasList({ aliases, users, onChange }) {
  const addAlias = () => onChange([...aliases, { alias: "", full_name: "" }]);
  const removeAlias = (i) => onChange(aliases.filter((_, idx) => idx !== i));
  const updateAlias = (i, field, val) => {
    const updated = [...aliases];
    updated[i] = { ...updated[i], [field]: val };
    onChange(updated);
  };

  const sortedUsers = [...users].sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> Name Aliases
        </Label>
        <Button type="button" size="sm" variant="outline" onClick={addAlias} className="h-7 text-xs gap-1">
          <Plus className="w-3 h-3" /> Add
        </Button>
      </div>
      <p className="text-xs text-slate-500">Map names as they appear in transcripts to the correct team member. The AI uses these to resolve ambiguous or nickname matches.</p>
      <div className="space-y-2">
        {aliases.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              placeholder="Name in transcript (e.g. Ariana)"
              value={entry.alias}
              onChange={(e) => updateAlias(i, "alias", e.target.value)}
              className="h-8 text-sm flex-1"
            />
            <span className="text-xs text-slate-400 flex-shrink-0">→</span>
            <Select value={entry.full_name || ""} onValueChange={(val) => updateAlias(i, "full_name", val)}>
              <SelectTrigger className="h-8 text-sm flex-1">
                <SelectValue placeholder="Select team member" />
              </SelectTrigger>
              <SelectContent>
                {sortedUsers.map(u => {
                  const display = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.full_name;
                  return <SelectItem key={u.id} value={u.full_name}>{display}</SelectItem>;
                })}
              </SelectContent>
            </Select>
            <Button type="button" variant="ghost" size="sm" onClick={() => removeAlias(i)} className="h-8 w-8 p-0 text-rose-400 hover:text-rose-600 hover:bg-rose-50 flex-shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        {aliases.length === 0 && <p className="text-xs text-slate-400 italic">No custom aliases — built-in nicknames still apply</p>}
      </div>
    </div>
  );
}

export default function CallDashboardSettings({ open, onClose, users = [] }) {
  const [options, setOptions] = useState(null);
  const [settingsId, setSettingsId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [callerTypePrompt, setCallerTypePrompt] = useState("");
  const [bookingPrompt, setBookingPrompt] = useState("");
  const [bookingOfferedPrompt, setBookingOfferedPrompt] = useState("");
  const [missedCallPrompt, setMissedCallPrompt] = useState("");
  const [nameAliases, setNameAliases] = useState([]);
  const { user } = useCurrentUser();
  const isAdmin = user && ["admin", "super_admin"].includes(user.role);

  useEffect(() => {
    if (!open) return;
    base44.entities.AppSettings.filter({ key: "global" }).then((results) => {
      const rec = results?.[0];
      if (rec) {
        setSettingsId(rec.id);
        const cdOpts = rec.call_dashboard_options || {};
        setOptions({
          caller_types: cdOpts.caller_types || DEFAULT_OPTIONS.caller_types,
          booking_outcomes: cdOpts.booking_outcomes || DEFAULT_OPTIONS.booking_outcomes,
          call_statuses: cdOpts.call_statuses || DEFAULT_OPTIONS.call_statuses,
        });
        setCallerTypePrompt(cdOpts.ai_caller_type_prompt || DEFAULT_CALLER_TYPE_PROMPT);
        setBookingPrompt(cdOpts.ai_booking_prompt || DEFAULT_BOOKING_PROMPT);
        setBookingOfferedPrompt(cdOpts.ai_booking_offered_prompt || DEFAULT_BOOKING_OFFERED_PROMPT);
        setMissedCallPrompt(cdOpts.ai_missed_call_prompt || DEFAULT_MISSED_CALL_PROMPT);
        setNameAliases(cdOpts.name_aliases || []);
      } else {
        setSettingsId(null);
        setOptions({ ...DEFAULT_OPTIONS });
        setCallerTypePrompt(DEFAULT_CALLER_TYPE_PROMPT);
        setBookingPrompt(DEFAULT_BOOKING_PROMPT);
        setBookingOfferedPrompt(DEFAULT_BOOKING_OFFERED_PROMPT);
        setMissedCallPrompt(DEFAULT_MISSED_CALL_PROMPT);
        setNameAliases([]);
      }
    });
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    // Managers can only edit name aliases — preserve existing admin-only fields
    const existing = await base44.entities.AppSettings.filter({ key: "global" });
    const existingOpts = existing?.[0]?.call_dashboard_options || {};
    const data = {
      key: "global",
      call_dashboard_options: {
        caller_types: isAdmin ? (options?.caller_types || DEFAULT_OPTIONS.caller_types) : (existingOpts.caller_types || DEFAULT_OPTIONS.caller_types),
        booking_outcomes: isAdmin ? (options?.booking_outcomes || DEFAULT_OPTIONS.booking_outcomes) : (existingOpts.booking_outcomes || DEFAULT_OPTIONS.booking_outcomes),
        call_statuses: isAdmin ? (options?.call_statuses || DEFAULT_OPTIONS.call_statuses) : (existingOpts.call_statuses || DEFAULT_OPTIONS.call_statuses),
        ai_caller_type_prompt: isAdmin ? callerTypePrompt : (existingOpts.ai_caller_type_prompt || ""),
        ai_booking_prompt: isAdmin ? bookingPrompt : (existingOpts.ai_booking_prompt || ""),
        ai_booking_offered_prompt: isAdmin ? bookingOfferedPrompt : (existingOpts.ai_booking_offered_prompt || ""),
        ai_missed_call_prompt: isAdmin ? missedCallPrompt : (existingOpts.ai_missed_call_prompt || ""),
        name_aliases: nameAliases,
      },
    };
    if (settingsId) {
      await base44.entities.AppSettings.update(settingsId, data);
    } else {
      const rec = await base44.entities.AppSettings.create(data);
      setSettingsId(rec.id);
    }
    setSaving(false);
    onClose();
  };

  const update = (field, val) => setOptions(prev => ({ ...prev, [field]: val }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl w-full max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500" /> Call Dashboard Configuration
          </DialogTitle>
          <p className="text-sm text-slate-500">Customize AI prompts, name matching, and dropdown options.</p>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-5">
          {!options ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : (
            <>
              {/* AI Prompts — admin/super_admin only */}
              {isAdmin && (
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" /> AI Analysis Prompts
                  </Label>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">Caller Type Classification</Label>
                    <p className="text-xs text-slate-500">How the AI determines if a caller is a returning client, potential client, N/A, or a missed call.</p>
                    <Textarea
                      placeholder={DEFAULT_CALLER_TYPE_PROMPT}
                      value={callerTypePrompt}
                      onChange={(e) => setCallerTypePrompt(e.target.value)}
                      className="min-h-[80px] text-sm"
                    />
                    {!callerTypePrompt && <p className="text-xs text-slate-400 italic">Using default prompt</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">Booking Outcome</Label>
                    <p className="text-xs text-slate-500">How the AI determines if a call was booked, not bookable, or a missed booking.</p>
                    <Textarea
                      placeholder={DEFAULT_BOOKING_PROMPT}
                      value={bookingPrompt}
                      onChange={(e) => setBookingPrompt(e.target.value)}
                      className="min-h-[80px] text-sm"
                    />
                    {!bookingPrompt && <p className="text-xs text-slate-400 italic">Using default prompt</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">Booking Offered Check</Label>
                    <p className="text-xs text-slate-500">For each missed booking, the AI checks if an appointment was offered but the caller declined. Runs only on calls classified as "not booked."</p>
                    <Textarea
                      placeholder={DEFAULT_BOOKING_OFFERED_PROMPT}
                      value={bookingOfferedPrompt}
                      onChange={(e) => setBookingOfferedPrompt(e.target.value)}
                      className="min-h-[80px] text-sm"
                    />
                    {!bookingOfferedPrompt && <p className="text-xs text-slate-400 italic">Using default prompt</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">Missed Call Definition</Label>
                    <p className="text-xs text-slate-500">How the AI determines if an inbound call was missed (no one answered, voicemail, 0-second call). Only applies to inbound calls.</p>
                    <Textarea
                      placeholder={DEFAULT_MISSED_CALL_PROMPT}
                      value={missedCallPrompt}
                      onChange={(e) => setMissedCallPrompt(e.target.value)}
                      className="min-h-[80px] text-sm"
                    />
                    {!missedCallPrompt && <p className="text-xs text-slate-400 italic">Using default prompt</p>}
                  </div>
                </div>
              )}

              {isAdmin && <Separator />}

              {/* Name Aliases — visible to all managers+ */}
              <NameAliasList
                aliases={nameAliases}
                users={users}
                onChange={setNameAliases}
              />

              {/* Dropdown Options — admin/super_admin only */}
              {isAdmin && (
                <>
                  <Separator />
                  <OptionList
                    title="Caller Type Options"
                    items={options.caller_types || []}
                    onChange={(val) => update("caller_types", val)}
                  />
                  <Separator />
                  <OptionList
                    title="Booking Outcome Options"
                    items={options.booking_outcomes || []}
                    onChange={(val) => update("booking_outcomes", val)}
                  />
                  <Separator />
                  <OptionList
                    title="Call Status Options"
                    items={options.call_statuses || []}
                    onChange={(val) => update("call_statuses", val)}
                  />
                </>
              )}
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end flex-shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !options} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}