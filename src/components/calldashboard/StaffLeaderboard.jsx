import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

// Build a lookup: stored full_name → "First Last" display name
function buildNormalizer(users) {
  const map = {};
  users.forEach(u => {
    if (!u.full_name) return;
    const display = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.full_name;
    map[u.full_name.toLowerCase()] = display;
  });
  return (name) => {
    if (!name) return null;
    const lower = name.toLowerCase();
    if (map[lower]) return map[lower];
    // Fuzzy fallback
    for (const [key, display] of Object.entries(map)) {
      const keyWords = key.split(/\s+/).filter(w => w.length > 2);
      if (keyWords.length >= 2 && keyWords.every(w => lower.includes(w))) return display;
    }
    return name;
  };
}

export default function StaffLeaderboard({ calls, users = [], nameMap = {} }) {
  const normalize = buildNormalizer(users);
  const staffStats = {};

  calls.forEach(call => {
    const raw = call.team_member;
    if (!raw) return;
    const key = normalize(raw);
    if (!staffStats[key]) staffStats[key] = { total: 0, answered: 0, booked: 0, possibleBooked: 0 };
    staffStats[key].total += 1;
    if (call.call_direction === "inbound" && (call.booking_outcome || call.transcript_summary)) {
      staffStats[key].answered += 1;
    }
    if (call.booking_outcome === "appt_booked" || call.booking_outcome === "appt_not_booked") {
      staffStats[key].possibleBooked += 1;
    }
    if (call.booking_outcome === "appt_booked" || call.was_booked) {
      staffStats[key].booked += 1;
    }
  });

  const sorted = Object.entries(staffStats)
    .map(([name, stats]) => ({ name, ...stats, bookingRate: stats.possibleBooked > 0 ? Math.round((stats.booked / stats.possibleBooked) * 100) : null }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  if (sorted.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Users className="w-4 h-4 text-blue-500" />Team Performance</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-slate-400 text-center py-4">No call data yet</p></CardContent>
      </Card>
    );
  }

  const maxAnswered = Math.max(...sorted.map(s => s.answered), 1);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Users className="w-4 h-4 text-blue-500" />Team Performance</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {sorted.map((staff, i) => (
          <div key={staff.name} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold", i === 0 ? "bg-blue-100 text-blue-700" : i === 1 ? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-400")}>{i + 1}</div>
                <span className="text-sm font-medium text-slate-800">{staff.name}</span>
              </div>
              <span className="text-xs text-slate-500">{staff.answered} inbound answered</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${(staff.answered / maxAnswered) * 100}%` }} />
            </div>
            {staff.possibleBooked > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Appts Booked</span>
                  <span className={cn("text-xs font-semibold", staff.bookingRate >= 70 ? "text-emerald-600" : staff.bookingRate >= 40 ? "text-amber-600" : "text-red-500")}>{staff.bookingRate}% ({staff.booked}/{staff.possibleBooked})</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${(staff.booked / staff.possibleBooked) * 100}%` }} />
                </div>
              </>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}