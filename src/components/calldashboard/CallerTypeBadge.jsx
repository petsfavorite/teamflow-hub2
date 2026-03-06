import { Badge } from "@/components/ui/badge";
import { UserPlus, UserCheck, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const config = {
  potential_client: { label: "Potential Client", icon: UserPlus, className: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50" },
  returning_client: { label: "Returning Client", icon: UserCheck, className: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50" },
  not_applicable: { label: "N/A", icon: Minus, className: "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-50" }
};

export default function CallerTypeBadge({ type }) {
  const c = config[type] || config.not_applicable;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium text-xs px-2 py-0.5", c.className)}>
      <Icon className="w-3 h-3" />{c.label}
    </Badge>
  );
}