import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import PageHeader from '../components/shared/PageHeader';
import { Card, CardContent } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { CheckSquare, BookOpen, Wrench, AlertTriangle, Users, Clock } from 'lucide-react';
import { differenceInDays, parseISO, format, subDays } from 'date-fns';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function StatCard({ icon: IconComp, label, value, sub, color }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">{label}</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
          </div>
          <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center`}>
            <IconComp className="w-6 h-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Analytics() {
  const { canManage } = useCurrentUser();

  const { data: sops = [] } = useQuery({ queryKey: ['sops-analytics'], queryFn: () => base44.entities.SOP.list('-updated_date', 500) });
  const { data: completions = [] } = useQuery({ queryKey: ['completions-analytics'], queryFn: () => base44.entities.ChecklistCompletion.list('-created_date', 500) });
  const { data: maintenance = [] } = useQuery({ queryKey: ['maintenance-analytics'], queryFn: () => base44.entities.MaintenanceRequest.list('-created_date', 500) });
  const { data: incidents = [] } = useQuery({ queryKey: ['incidents-analytics'], queryFn: () => base44.entities.IncidentReport.list('-created_date', 200) });
  const { data: tasks = [] } = useQuery({ queryKey: ['tasks-analytics'], queryFn: () => base44.entities.Task.list('-created_date', 200) });
  const { data: acks = [] } = useQuery({ queryKey: ['acks-analytics'], queryFn: () => base44.entities.SOPAcknowledgement.list('-created_date', 500) });
  const { data: allUsers = [] } = useQuery({ queryKey: ['users-analytics'], queryFn: () => base44.entities.User.list('full_name', 200) });

  if (!canManage) {
    return <div className="text-center py-20"><p className="text-slate-500">Access restricted to managers and admins</p></div>;
  }

  // Stats
  const publishedSOPs = sops.filter(s => s.status === 'published');
  const sopRequiringAck = publishedSOPs.filter(s => s.requires_acknowledgement);
  const openMaintenance = maintenance.filter(r => r.status === 'open' || r.status === 'in_progress');
  const openIncidents = incidents.filter(i => i.status === 'open' || i.status === 'under_review');
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');

  // Checklist completions by day (last 14 days)
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = subDays(new Date(), 13 - i);
    const label = format(d, 'MMM d');
    const count = completions.filter(c => c.completion_date === format(d, 'yyyy-MM-dd')).length;
    return { date: label, completions: count };
  });

  // Maintenance by status
  const maintByStatus = [
    { name: 'Open', value: maintenance.filter(r => r.status === 'open').length },
    { name: 'In Progress', value: maintenance.filter(r => r.status === 'in_progress').length },
    { name: 'Waiting', value: maintenance.filter(r => r.status === 'waiting_parts').length },
    { name: 'Completed', value: maintenance.filter(r => r.status === 'completed').length },
  ].filter(d => d.value > 0);

  // Incident types
  const incidentsByType = {};
  incidents.forEach(i => {
    const label = i.incident_type?.replace(/_/g, ' ') || 'other';
    incidentsByType[label] = (incidentsByType[label] || 0) + 1;
  });
  const incidentData = Object.entries(incidentsByType).map(([name, value]) => ({ name, value }));

  // SOP acknowledgement: SOPs with unread staff
  const sopAckSummary = sopRequiringAck.map(sop => {
    const ackedEmails = acks.filter(a => a.sop_id === sop.id && a.version_number === sop.version).map(a => a.user_email);
    const staffUsers = allUsers.filter(u => u.role === 'user');
    const unread = staffUsers.filter(u => !ackedEmails.includes(u.email));
    return { title: sop.title, unread: unread.length, total: staffUsers.length };
  }).filter(s => s.unread > 0).slice(0, 5);

  // Top checklist completers (last 30 days)
  const recent = completions.filter(c => {
    if (!c.completion_date) return false;
    return differenceInDays(new Date(), parseISO(c.completion_date)) <= 30;
  });
  const byUser = {};
  recent.forEach(c => {
    const name = c.completed_by_name || c.completed_by || 'Unknown';
    byUser[name] = (byUser[name] || 0) + 1;
  });
  const topCompleters = Object.entries(byUser).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));

  return (
    <div>
      <PageHeader title="Analytics" description="Overview of operations, compliance, and activity" />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <StatCard icon={BookOpen} label="Published SOPs" value={publishedSOPs.length} color="bg-indigo-600" />
        <StatCard icon={CheckSquare} label="Completions (30d)" value={recent.length} color="bg-emerald-600" />
        <StatCard icon={Wrench} label="Open Maintenance" value={openMaintenance.length} color="bg-amber-600" sub={openMaintenance.length > 0 ? 'needs attention' : 'all clear'} />
        <StatCard icon={AlertTriangle} label="Open Incidents" value={openIncidents.length} color="bg-red-600" />
        <StatCard icon={Clock} label="Pending Tasks" value={pendingTasks.length} color="bg-purple-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Checklist completions chart */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <h2 className="font-semibold text-slate-900 mb-4">Checklist Completions (Last 14 Days)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={last14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="completions" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Maintenance by status */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <h2 className="font-semibold text-slate-900 mb-4">Maintenance Requests by Status</h2>
            {maintByStatus.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">No maintenance data</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={maintByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                    {maintByStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SOP Acknowledgement backlog */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <h2 className="font-semibold text-slate-900 mb-1">SOP Acknowledgement Backlog</h2>
            <p className="text-xs text-slate-400 mb-4">SOPs with unread staff</p>
            {sopAckSummary.length === 0 ? (
              <p className="text-sm text-emerald-600 font-medium py-4">✓ All staff are up to date</p>
            ) : (
              <div className="space-y-3">
                {sopAckSummary.map((s, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-slate-700 truncate pr-2">{s.title}</span>
                      <span className="text-red-600 font-semibold flex-shrink-0">{s.unread} unread</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${((s.total - s.unread) / Math.max(s.total, 1)) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top checklist completers */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <h2 className="font-semibold text-slate-900 mb-1">Top Completers</h2>
            <p className="text-xs text-slate-400 mb-4">Last 30 days</p>
            {topCompleters.length === 0 ? (
              <p className="text-sm text-slate-400 py-4">No completions yet</p>
            ) : (
              <div className="space-y-3">
                {topCompleters.map((u, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">{i + 1}</div>
                      <span className="text-sm font-medium text-slate-800">{u.name}</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-600">{u.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Incident types */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <h2 className="font-semibold text-slate-900 mb-1">Incident Types</h2>
            <p className="text-xs text-slate-400 mb-4">All time</p>
            {incidentData.length === 0 ? (
              <p className="text-sm text-emerald-600 font-medium py-4">✓ No incidents reported</p>
            ) : (
              <div className="space-y-2">
                {incidentData.sort((a, b) => b.value - a.value).map((d, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-slate-700 capitalize">{d.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-slate-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full" style={{ width: `${(d.value / Math.max(...incidentData.map(x => x.value))) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      </div>
                      <span className="text-sm font-bold text-slate-600 w-4 text-right">{d.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}