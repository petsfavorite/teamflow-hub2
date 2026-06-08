import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Save, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

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

export default function CallDashboardSettings({ open, onClose }) {
  const [options, setOptions] = useState(null);
  const [settingsId, setSettingsId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    base44.entities.AppSettings.filter({ key: "global" }).then((results) => {
      const rec = results?.[0];
      if (rec) {
        setSettingsId(rec.id);
        setOptions(rec.call_dashboard_options || { ...DEFAULT_OPTIONS });
      } else {
        setSettingsId(null);
        setOptions({ ...DEFAULT_OPTIONS });
      }
    });
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    const data = { key: "global", call_dashboard_options: options };
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
          <DialogTitle>Call Dashboard Settings</DialogTitle>
          <p className="text-sm text-slate-500">Customize the dropdown options available when reviewing calls.</p>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-5">
          {!options ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : (
            <>
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