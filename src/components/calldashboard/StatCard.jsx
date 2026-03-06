import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function StatCard({ label, value, subtitle, icon: Icon, accentColor = "bg-blue-500" }) {
  return (
    <Card className="relative overflow-hidden border-0 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col">
      <div className="p-5 flex-1">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
            <p className="text-3xl font-bold text-slate-900 tracking-tight">{value}</p>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          {Icon && (
            <div className={cn("p-2.5 rounded-xl", accentColor, "bg-opacity-10")}>
              <Icon className={cn("w-5 h-5", accentColor.replace("bg-", "text-"))} />
            </div>
          )}
        </div>
      </div>
      <div className={cn("h-1 w-full", accentColor, "opacity-60")} />
    </Card>
  );
}