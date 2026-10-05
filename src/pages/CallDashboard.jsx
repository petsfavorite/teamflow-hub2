import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Phone, CalendarCheck, UserPlus, AlertTriangle, Loader2, Settings, PhoneMissed, Store, Clock } from "lucide-react";
import moment from "moment-timezone";
import { Button } from "@/components/ui/button";
import CallDashboardSettings from "@/components/calldashboard/CallDashboardSettings";
import DateRangePicker, { getDateRange } from "@/components/calldashboard/DateRangePicker";
import StatCard from "@/components/calldashboard/StatCard";
import CallCard from "@/components/calldashboard/CallCard";
import CallDetailLoader from "@/components/calldashboard/CallDetailLoader";
import StaffLeaderboard from "@/components/calldashboard/StaffLeaderboard";
import CallerTypeChart from "@/components/calldashboard/CallerTypeChart";
import DashboardFilters from "@/components/calldashboard/DashboardFilters";
import useCallHistory from "@/components/calldashboard/useCallHistory";
import { getAppTimezone } from '@/lib/timezone';

export default function CallDashboard() {
  const [selectedCall, setSelectedCall] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [filters, setFilters] = useState({ search: "", callerType: "all", bookingStatus: "all", teamMember: "all", status: "all", missedCall: "all" });
  const [datePreset, setDatePreset] = useState("last7");
  const [customStart, setCustomStart] = useState(null);
  const [customEnd, setCustomEnd] = useState(null);

  const { data: user } = useQuery({ queryKey: ["me"], queryFn: () => base44.auth.me() });
  const isAdmin = user?.role === "admin" || user?.role === "super_admin" || user?.role === "manager";
  const canManageSettings = user?.role === "admin" || user?.role === "super_admin";

  const { start: dateStart, end: dateEnd } = useMemo(
    () => getDateRange(datePreset, customStart, customEnd),
    [datePreset, customStart, customEnd]
  );
  const { data: calls = [], isLoading, isError, refetch } = useCallHistory(dateStart, dateEnd);

  // Pipeline health: when the last import ran and when the newest call arrived.
  const { data: syncInfo } = useQuery({
    queryKey: ["callSyncStatus"],
    queryFn: () => base44.entities.AppSettings.filter({ key: "global" }).then(r => r?.[0] || null),
    refetchInterval: 5 * 60 * 1000,
    retry: 0,
  });
  const syncStatus = useMemo(() => {
    if (!syncInfo) return null;
    const ageMin = (iso) => iso ? (Date.now() - new Date(iso).getTime()) / 60000 : null;
    // Either import path counts: the sheet sync or the direct Zoom pull.
    const newer = (a, b) => (!a ? b : !b ? a : new Date(a) > new Date(b) ? a : b);
    const syncAge = ageMin(newer(syncInfo.last_sync_run_at, syncInfo.last_zoom_pull_at));
    const callAge = ageMin(newer(syncInfo.last_sync_newest_call_date, syncInfo.last_zoom_newest_call_date));
    const ago = (m) => m === null ? "unknown" : m < 60 ? `${Math.round(m)} min ago` : m < 2880 ? `${(m / 60).toFixed(1)} hr ago` : `${Math.round(m / 1440)} days ago`;
    return {
      syncStale: syncAge === null || syncAge > 45,
      callsStale: callAge !== null && callAge > 6 * 60,
      syncText: ago(syncAge),
      callText: ago(callAge),
    };
  }, [syncInfo]);

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

  const validDurationCalls = useMemo(() => calls.filter(c => c.call_duration_seconds != null && c.call_duration_seconds >= 30), [calls]);

  const dateFilteredCalls = useMemo(() => {
    if (!dateStart && !dateEnd) return validDurationCalls;
    return validDurationCalls.filter(call => {
      const d = new Date(call.call_date);
      if (dateStart && d < dateStart) return false;
      if (dateEnd && d > dateEnd) return false;
      return true;
    });
  }, [validDurationCalls, dateStart, dateEnd]);

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
    const missedWhenOpen = filteredCalls.filter(c => {
      if (!c.missed_call || c.clinic_closed) return false;
      const m = moment(c.call_date).tz(getAppTimezone());
      const day = m.day();
      const hour = m.hour();
      const isWeekend = day === 0 || day === 6;
      return isWeekend ? (hour >= 8 && hour < 18) : (hour >= 7 && hour < 19);
    }).length;
    const bookingRate = bookableTotal > 0 ? Math.round((booked / bookableTotal) * 100) : 0;
    const inboundSeconds = inboundCalls.reduce((sum, c) => sum + (c.call_duration_seconds || 0), 0);
    const inboundHours = (inboundSeconds / 3600).toFixed(1);
    return { total, booked, bookable: bookableTotal, missedBookings, potential, bookingRate, missed, missedWhenOpen, inboundTotal: inboundCalls.length, inboundHours };
  }, [filteredCalls]);

  if (isLoading || isError) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Call Dashboard</h1>
      <p className="text-sm text-muted-foreground">90 days of call history available · Seven days shown by default</p>
      <DateRangePicker preset={datePreset} onPresetChange={setDatePreset} customStart={customStart} customEnd={customEnd} onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }} />
      {isLoading ? (
        <div role="status" className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" />Loading calls for the selected dates…</div>
      ) : (
        <div role="alert" className="rounded-xl border border-border bg-card p-6 space-y-3">
          <p>Call history couldn't load. If the read limit was reached, wait a minute before retrying.</p>
          <Button onClick={() => refetch()}>Retry</Button>
        </div>
      )}
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
              <p className="text-xs text-muted-foreground mt-1">90 days of call history available</p>
              {syncStatus && (
                <p className={`text-xs mt-1 ${syncStatus.syncStale ? "text-red-600 font-medium" : "text-slate-400"}`}>
                  Last sync: {syncStatus.syncText} · Newest call: {syncStatus.callText}
                </p>
              )}
            </div>
            {canManageSettings && (
              <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} className="gap-2 flex-shrink-0">
                <Settings className="w-4 h-4" /> Settings
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {syncStatus && (syncStatus.syncStale || syncStatus.callsStale) && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              {syncStatus.syncStale
                ? `The call sync hasn't run successfully in a while (last: ${syncStatus.syncText}). New calls may be missing.`
                : `No new calls have been received since ${syncStatus.callText}. The Zoom phone connection may have stopped.`}
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
          <StatCard label="Total Incoming Calls" value={stats.inboundTotal} icon={Phone} accentColor="bg-blue-500" />
          <StatCard label="Inbound Call Hours" value={stats.inboundHours} subtitle={`Across ${stats.inboundTotal} calls`} icon={Clock} accentColor="bg-cyan-500" />
          <StatCard label="Booking Rate" value={`${stats.bookingRate}%`} subtitle={`${stats.booked} of ${stats.bookable} bookable`} icon={CalendarCheck} accentColor="bg-emerald-500" />
          <StatCard label="Potential Clients" value={stats.potential} subtitle={`${stats.inboundTotal > 0 ? Math.round((stats.potential / stats.inboundTotal) * 100) : 0}% of inbound`} icon={UserPlus} accentColor="bg-amber-500" />
          <StatCard label="Missed Bookings" value={stats.missedBookings} subtitle="Could have booked" icon={AlertTriangle} accentColor="bg-red-500" />
          <StatCard label="Missed Calls" value={stats.missed} subtitle="No one answered" icon={PhoneMissed} accentColor="bg-rose-400" />
          <StatCard label="Missed Calls when Open" value={stats.missedWhenOpen} subtitle="During business hours" icon={Store} accentColor="bg-orange-500" />
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

      {selectedCall && <CallDetailLoader key={selectedCall.id} call={selectedCall} onClose={() => setSelectedCall(null)} onUpdate={refetch} isAdmin={isAdmin} users={users} />}
      {canManageSettings && <CallDashboardSettings open={showSettings} onClose={() => setShowSettings(false)} users={users} />}
    </div>
  );
}