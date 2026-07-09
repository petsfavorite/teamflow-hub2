import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { UserPlus } from "lucide-react";

const COLORS = { potential_client: "#f59e0b", returning_client: "#10b981", not_applicable: "#94a3b8", existing_client: "#3b82f6", Unsure: "#a855f7" };
const LABELS = { potential_client: "Potential", returning_client: "Returning", not_applicable: "N/A", existing_client: "Existing", Unsure: "Unsure" };

export default function CallerTypeChart({ calls }) {
  const answeredCalls = calls.filter(c => !c.missed_call);
  const counts = { potential_client: 0, returning_client: 0, not_applicable: 0 };
  answeredCalls.forEach(c => { const t = c.caller_type || "not_applicable"; counts[t] = (counts[t] || 0) + 1; });
  const data = Object.entries(counts).filter(([, v]) => v > 0).map(([key, value]) => ({ name: LABELS[key], value, key }));
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2"><UserPlus className="w-4 h-4 text-amber-500" />Caller Breakdown</CardTitle></CardHeader>
      <CardContent><p className="text-sm text-slate-400 text-center py-4">No call data yet</p></CardContent>
    </Card>
  );

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2"><UserPlus className="w-4 h-4 text-amber-500" />Caller Breakdown</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="w-28 h-28">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius={28} outerRadius={50} paddingAngle={3} dataKey="value" strokeWidth={0}>
                  {data.map((entry) => <Cell key={entry.key} fill={COLORS[entry.key]} />)}
                </Pie>
                <Tooltip formatter={(value) => [value, "Calls"]} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {data.map(d => (
              <div key={d.key} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[d.key] }} />
                <span className="text-xs text-slate-600">{d.name}</span>
                <span className="text-xs font-semibold text-slate-800">{d.value}</span>
                <span className="text-xs text-slate-400">({Math.round((d.value / total) * 100)}%)</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}