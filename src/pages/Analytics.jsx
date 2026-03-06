import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import PageHeader from '../components/shared/PageHeader';
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { Wrench, AlertTriangle } from 'lucide-react';
import { subDays, format } from 'date-fns';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';

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

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-md px-4 py-3 text-sm">
        <p className="font-semibold text-slate-800 mb-1">{label}</p>
        <p className="text-emerald-700 font-bold">{d.pct}% completed</p>
        <p className="text-slate-500">{d.done} / {d.total} tasks</p>
        <p className="text-slate-400 text-xs mt-1">Click to view checklists</p>
      </div>
    );
  }
  return null;
};

export default function Analytics() {
  const { canManage } = useCurrentUser();
  const navigate = useNavigate();

  const { data: completions = [] } = useQuery({
    queryKey: ['completions-analytics'],
    queryFn: () => base44.entities.ChecklistCompletion.list('-created_date', 1000),
  });
  const { data: maintenance = [] } = useQuery({
    queryKey: ['maintenance-analytics'],
    queryFn: () => base44.entities.MaintenanceRequest.list('-created_date', 500),
  });
  const { data: incidents = [] } = useQuery({
    queryKey: ['incidents-analytics'],
    queryFn: () => base44.entities.IncidentReport.list('-created_date', 200),
  });

  if (!canManage) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Access restricted to managers and admins</p>
      </div>
    );
  }

  const openMaintenance = maintenance.filter(r => r.status === 'open' || r.status === 'in_progress' || r.status === 'working_on' || r.status === 'waiting_on');
  const openIncidents = incidents.filter(i => i.status === 'open' || i.status === 'under_review');

  // Daily task completion % — last 30 days
  // Each ChecklistCompletion has completed_items: [{ checked, ... }]
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = subDays(new Date(), 29 - i);
    const dateStr = format(d, 'yyyy-MM-dd');
    const label = format(d, 'MMM d');

    const dayCompletions = completions.filter(c => c.completion_date === dateStr);

    let total = 0;
    let done = 0;
    dayCompletions.forEach(c => {
      const items = c.completed_items || [];
      total += items.length;
      done += items.filter(it => it.checked).length;
    });

    const pct = total === 0 ? null : Math.round((done / total) * 100);

    return { label, dateStr, total, done, pct, displayPct: pct ?? 0 };
  });

  const handleBarClick = (data) => {
    if (!data || !data.activePayload) return;
    const dateStr = data.activePayload[0]?.payload?.dateStr;
    if (dateStr) {
      navigate(createPageUrl(`ChecklistHistory?date=${dateStr}`));
    }
  };

  const getBarColor = (pct) => {
    if (pct === null) return '#e2e8f0';
    if (pct >= 90) return '#10b981';
    if (pct >= 70) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div>
      <PageHeader title="Analytics" description="Daily task completion and operations overview" />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 mb-8 max-w-sm">
        <StatCard icon={Wrench} label="Open Maintenance" value={openMaintenance.length} color="bg-amber-600" sub={openMaintenance.length > 0 ? 'Needs attention' : 'All clear'} />
        <StatCard icon={AlertTriangle} label="Open Incidents" value={openIncidents.length} color="bg-red-600" />
      </div>

      {/* Daily task completion chart */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <h2 className="font-semibold text-slate-900 mb-1">Daily Checklist Task Completion</h2>
          <p className="text-xs text-slate-400 mb-6">% of checklist tasks completed each day — click a bar to view that day's checklists</p>

          {/* Legend */}
          <div className="flex items-center gap-4 mb-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> ≥90%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" /> 70–89%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-400 inline-block" /> &lt;70%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-200 inline-block" /> No data</span>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={last30} onClick={handleBarClick} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                interval={4}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={v => `${v}%`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="displayPct" radius={[4, 4, 0, 0]}>
                {last30.map((entry, i) => (
                  <Cell key={i} fill={getBarColor(entry.pct)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}