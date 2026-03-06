import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronDown } from "lucide-react";
import { format, startOfDay, endOfDay, subDays, startOfToday, endOfToday } from "date-fns";
import { cn } from "@/lib/utils";

const PRESETS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "last7" },
  { label: "Last 30 days", value: "last30" },
  { label: "Custom range", value: "custom" },
];

export function getDateRange(preset, customStart, customEnd) {
  const now = new Date();
  switch (preset) {
    case "today": return { start: startOfToday(), end: endOfToday() };
    case "yesterday": { const y = subDays(now, 1); return { start: startOfDay(y), end: endOfDay(y) }; }
    case "last7": return { start: startOfDay(subDays(now, 6)), end: endOfToday() };
    case "last30": return { start: startOfDay(subDays(now, 29)), end: endOfToday() };
    case "custom": return { start: customStart ? startOfDay(customStart) : null, end: customEnd ? endOfDay(customEnd) : null };
    default: return { start: null, end: null };
  }
}

export default function DateRangePicker({ preset, onPresetChange, customStart, customEnd, onCustomChange }) {
  const [open, setOpen] = useState(false);
  const [pickingEnd, setPickingEnd] = useState(false);
  const currentPreset = PRESETS.find(p => p.value === preset);
  const label = (() => {
    if (preset !== "custom") return currentPreset?.label || "All time";
    if (customStart && customEnd) return `${format(customStart, "MMM d")} – ${format(customEnd, "MMM d, yyyy")}`;
    if (customStart) return `From ${format(customStart, "MMM d, yyyy")}`;
    return "Custom range";
  })();

  const handleDayClick = (day) => {
    if (!pickingEnd) { onCustomChange(day, null); setPickingEnd(true); }
    else {
      if (day < customStart) onCustomChange(day, customStart);
      else onCustomChange(customStart, day);
      setPickingEnd(false); setOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex gap-1 flex-wrap">
        {PRESETS.filter(p => p.value !== "custom").map(p => (
          <Button key={p.value} variant={preset === p.value ? "default" : "outline"} size="sm"
            className={cn("text-xs h-8", preset === p.value ? "bg-blue-600 hover:bg-blue-700 text-white" : "text-slate-600")}
            onClick={() => onPresetChange(p.value)}>{p.label}</Button>
        ))}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant={preset === "custom" ? "default" : "outline"} size="sm"
            className={cn("text-xs h-8 gap-1.5", preset === "custom" ? "bg-blue-600 hover:bg-blue-700 text-white" : "text-slate-600")}
            onClick={() => { onPresetChange("custom"); setOpen(true); setPickingEnd(false); }}>
            <CalendarIcon className="w-3.5 h-3.5" />{preset === "custom" ? label : "Custom range"}<ChevronDown className="w-3 h-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <p className="text-xs text-slate-500 mb-2">{!pickingEnd ? "Select start date" : "Select end date"}</p>
          <Calendar mode="single" selected={pickingEnd ? customEnd : customStart} onSelect={handleDayClick} disabled={(date) => date > new Date()} initialFocus />
          {customStart && <p className="text-xs text-slate-500 mt-2">Start: <strong>{format(customStart, "MMM d, yyyy")}</strong>{customEnd && <> · End: <strong>{format(customEnd, "MMM d, yyyy")}</strong></>}</p>}
        </PopoverContent>
      </Popover>
    </div>
  );
}