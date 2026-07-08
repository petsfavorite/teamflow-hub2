import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Phone, CalendarCheck, UserPlus, AlertTriangle, Loader2, Settings, PhoneMissed } from "lucide-react";
import { Button } from "@/components/ui/button";
import CallDashboardSettings from "@/components/calldashboard/CallDashboardSettings";
import DateRangePicker, { getDateRange } from "@/components/calldashboard/DateRangePicker";
import StatCard from "@/components/calldashboard/StatCard";
import CallCard from "@/components/calldashboard/CallCard";
import CallDetailPanel from "@/components/calldashboard/CallDetailPanel";
import StaffLeaderboard from "@/components/calldashboard/StaffLeaderboard";
import CallerTypeChart from "@/components/calldashboard/CallerTypeChart";
import DashboardFilters from "@/components/calldashboard/DashboardFilters";

export default function CallDashboard() {
  const [selectedCall, setSelectedCall] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [filters, setFilters] = useState({ search: "", callerType: "all", bookingStatus: "all", teamMember: "all", status: "all", missedCall: "all" });
  const [datePreset, setDatePreset] = useState("all");
  const [customStart, setCustomStart] = useState(null);
  const [customEnd, setCustomEnd] = useState(null);

  const { data: user } = useQuery({ queryKey: ["me"], queryFn: () => base44.auth.me() });
  const isAdmin = user?.role === "admin" || user?.role === "super_admin" || user?.role === "manager";

  const { data: calls = [], isLoading, refetch } = useQuery({
    queryKey: ["callRecords"],
    queryFn: async () => {
      const pageSize = 500;
      let allCalls = [];
      let skip = 0;
      const seenIds = new Set();
      while (true) {
        const page = await base44.entities.CallRecord.list("-call_date", pageSize, skip);
        for (const call of page) {
          if (!seenIds.has(call.id)) {
            seenIds.add(call.id);
            allCalls.push(call);
          }
        }
        if (page.length < pageSize) break;
        skip += pageSize;
      }
      allCalls.sort((a, b) => new Date(b.call_date) - new Date(a.call_date));
      return allCalls;
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ["allUsers"],
    queryFn: () => base44.entities.User.list(),
  });

  const staffList = useMemo(() => [...new Set(calls.map(c => c.team_member).filter(Boolean))].sort(), [calls]);

  // Map full_name → "First Last" display name
  const nameMap = useMemo(() => {
    const map = {};
    users.forEach(u => {
      if (u.full_name) {
        map[u.full_name] = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.full_name;
      }
    });
    return map;
  }, [users]);

  const { start: dateStart, end: dateEnd } = useMemo(
    () => getDateRange(datePreset, customStart, customEnd),
    [datePreset, customStart, customEnd]
  );

  const dateFilteredCalls = useMemo(() => {
    if (!dateStart && !dateEnd) return calls;
    return calls.filter(call => {
      const d = new Date(call.call_date);
      if (dateStart && d < dateStart) return false;
      if (dateEnd && d > dateEnd) return false;
      return true;
    });
  }, [calls, dateStart, dateEnd]);

  const filteredCalls = useMemo(() => {
    return dateFilteredCalls.filter(call => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const match = [call.caller_name, call.caller_phone, call.team_member, call.caller_intent, call.transcript_summary]
          .filter(Boolean).some(f => f.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (filters.callerType !== "all" && call.caller_type !== filters.callerType) return false;
      if (filters.teamMember !== "all" && call.team_member !== filters.teamMember) return false;
      if (filters.status !== "all" && call.status !== filters.status) return false;
      if (filters.missedCall === "missed" && !call.missed_call) return false;
      if (filters.missedCall === "not_missed" && call.missed_call) return false;
      if (filters.bookingStatus !== "all") {
        const isBooked = call.booking_outcome === "appt_booked" || call.was_booked;
        if (filters.bookingStatus === "booked" && !isBooked) return false;
        if (filters.bookingStatus === "not_booked_could" && (isBooked || call.bookable !== "yes")) return false;
        if (filters.bookingStatus === "not_bookable" && call.bookable !== "no") return false;
      }
      return true;
    });
  }, [dateFilteredCalls, filters]);

  const stats = useMemo(() => {
    const total = filteredCalls.length;
    const booked = filteredCalls.filter(c => c.booking_outcome === "appt_booked" || c.was_booked).length;
    const notBooked = filteredCalls.filter(c => c.booking_outcome === "appt_not_booked").length;
    const bookableTotal = booked + notBooked;
    const missedBookings = notBooked;
    const inboundCalls = filteredCalls.filter(c => c.call_direction === "inbound");
    const potential = inboundCalls.filter(c => c.caller_type === "potential_client").length;
    const missed = filteredCalls.filter(c => c.missed_call).length;
    const bookingRate = bookableTotal > 0 ? Math.round((booked / bookableTotal) * 100) : 0;
    return { total, booked, bookable: bookableTotal, missedBookings, potential, bookingRate, missed, inboundTotal: inboundCalls.length };
  }, [filteredCalls]);

  if (isLoading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Call Dashboard</h1>
              <p className="text-sm text-slate-500 mt-1">{filteredCalls.length} total calls · {stats.booked} booked · {stats.missedBookings} missed opportunities</p>
            </div>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} className="gap-2 flex-shrink-0">
                <Settings className="w-4 h-4" /> Settings
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 items-stretch">
          <StatCard label="Total Incoming Calls" value={stats.inboundTotal} icon={Phone} accentColor="bg-blue-500" />
          <StatCard label="Booking Rate" value={`${stats.bookingRate}%`} subtitle={`${stats.booked} of ${stats.bookable} bookable`} icon={CalendarCheck} accentColor="bg-emerald-500" />
          <StatCard label="Potential Clients" value={stats.potential} subtitle={`${stats.inboundTotal > 0 ? Math.round((stats.potential / stats.inboundTotal) * 100) : 0}% of inbound`} icon={UserPlus} accentColor="bg-amber-500" />
          <StatCard label="Missed Bookings" value={stats.missedBookings} subtitle="Could have booked" icon={AlertTriangle} accentColor="bg-red-500" />
          <StatCard label="Missed Calls" value={stats.missed} subtitle="No one answered" icon={PhoneMissed} accentColor="bg-rose-400" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          <CallerTypeChart calls={filteredCalls.filter(c => c.call_direction === "inbound")} />
          <StaffLeaderboard calls={filteredCalls} users={users} nameMap={nameMap} />
        </div>

        <div className="space-y-3">
          <DateRangePicker preset={datePreset} onPresetChange={setDatePreset} customStart={customStart} customEnd={customEnd} onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }} />
          <DashboardFilters filters={filters} onChange={setFilters} staffList={staffList} nameMap={nameMap} />
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">{filteredCalls.length} Call{filteredCalls.length !== 1 ? "s" : ""}</h2>
          {filteredCalls.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
              <Phone className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No calls match your filters</p>
            </div>
          ) : (
            <div className="space-y-2">{filteredCalls.map(call => <CallCard key={call.id} call={call} onClick={setSelectedCall} nameMap={nameMap} />)}</div>
          )}
        </div>
      </div>

      <CallDetailPanel call={selectedCall} open={!!selectedCall} onClose={() => setSelectedCall(null)} onUpdate={refetch} isAdmin={isAdmin} users={users} />
      {isAdmin && <CallDashboardSettings open={showSettings} onClose={() => setShowSettings(false)} />}
    </div>
  );
}