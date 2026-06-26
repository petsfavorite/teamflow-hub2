import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function DashboardFilters({ filters, onChange, staffList, nameMap = {} }) {
  const update = (key, value) => onChange({ ...filters, [key]: value });
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input placeholder="Search calls..." value={filters.search} onChange={(e) => update("search", e.target.value)} className="pl-9 border-slate-200" />
      </div>
      <Select value={filters.callerType} onValueChange={(v) => update("callerType", v)}>
        <SelectTrigger className="w-[160px] border-slate-200"><SelectValue placeholder="Caller Type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="potential_client">Potential Client</SelectItem>
          <SelectItem value="returning_client">Returning Client</SelectItem>
          <SelectItem value="not_applicable">N/A</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.bookingStatus} onValueChange={(v) => update("bookingStatus", v)}>
        <SelectTrigger className="w-[160px] border-slate-200"><SelectValue placeholder="Booking" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Bookings</SelectItem>
          <SelectItem value="booked">Booked</SelectItem>
          <SelectItem value="not_booked_could">Not Booked (Could Have)</SelectItem>
          <SelectItem value="not_bookable">Not Bookable</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.teamMember} onValueChange={(v) => update("teamMember", v)}>
        <SelectTrigger className="w-[160px] border-slate-200"><SelectValue placeholder="Team Member" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Team</SelectItem>
          {staffList.map(name => <SelectItem key={name} value={name}>{nameMap[name] || name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.status} onValueChange={(v) => update("status", v)}>
        <SelectTrigger className="w-[160px] border-slate-200"><SelectValue placeholder="Review Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Reviews</SelectItem>
          <SelectItem value="pending_review">Needs Review</SelectItem>
          <SelectItem value="reviewed">Reviewed</SelectItem>
          <SelectItem value="flagged">Flagged</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.missedCall} onValueChange={(v) => update("missedCall", v)}>
        <SelectTrigger className="w-[160px] border-slate-200"><SelectValue placeholder="Missed Calls" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Calls</SelectItem>
          <SelectItem value="missed">Missed Only</SelectItem>
          <SelectItem value="not_missed">Not Missed</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}