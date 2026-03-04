import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import { BookOpen, CheckSquare, Wrench, MessageSquare, ExternalLink, ArrowRight, Clock, AlertTriangle, ClipboardList } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from '../components/shared/StatusBadge';

function StatCard({ icon: Icon, label, value, color, to }) {
  return (
    <Link to={to}>
      <Card className="hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 cursor-pointer border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">{label}</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
            </div>
            <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center`}>
              <Icon className="w-6 h-6 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const { user, canManage } = useCurrentUser();

  const { data: sops = [] } = useQuery({
    queryKey: ['sops'],
    queryFn: () => base44.entities.SOP.filter({ status: 'published' }),
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['checklists-assigned'],
    queryFn: () => base44.entities.ChecklistTemplate.filter({ status: 'active' }),
  });

  const { data: maintenanceRequests = [] } = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => base44.entities.MaintenanceRequest.list('-created_date', 5),
  });

  const { data: links = [] } = useQuery({
    queryKey: ['links'],
    queryFn: () => base44.entities.ExternalLink.list('order', 50),
  });

  const { data: incidents = [] } = useQuery({
    queryKey: ['incidents-dash'],
    queryFn: () => base44.entities.IncidentReport.filter({ status: 'open' }, '-created_date', 5),
    enabled: canManage,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks-dash'],
    queryFn: () => base44.entities.Task.filter({ assigned_to_email: user?.email }, '-created_date', 10),
    enabled: !!user?.email,
  });

  const myChecklists = checklists.filter(c =>
    !c.assigned_to || c.assigned_to.length === 0 || c.assigned_to.includes(user?.email)
  );

  const openMaintenance = maintenanceRequests.filter(r => r.status === 'open' || r.status === 'in_progress');
  const myPendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Welcome back, {user?.full_name?.split(' ')[0] || 'there'}
        </h1>
        <p className="text-slate-500 mt-1">Here's what's happening today.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={BookOpen} label="Published SOPs" value={sops.length} color="bg-indigo-600" to={createPageUrl('SOPs')} />
        <StatCard icon={CheckSquare} label="My Checklists" value={myChecklists.length} color="bg-emerald-600" to={createPageUrl('Checklists')} />
        <StatCard icon={ClipboardList} label="My Tasks" value={myPendingTasks.length} color="bg-purple-600" to={createPageUrl('Tasks')} />
        <StatCard icon={Wrench} label="Open Maintenance" value={openMaintenance.length} color="bg-amber-600" to={createPageUrl('Maintenance')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Maintenance Requests */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Recent Maintenance</h2>
              <Link to={createPageUrl('Maintenance')} className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {maintenanceRequests.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No requests yet</p>
            ) : (
              <div className="space-y-3">
                {maintenanceRequests.slice(0, 4).map(req => (
                  <div key={req.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{req.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-400">{new Date(req.created_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <StatusBadge status={req.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <h2 className="font-semibold text-slate-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              <Link to={createPageUrl('SOPAssistant')} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-indigo-50 hover:bg-indigo-100 transition-colors">
                <MessageSquare className="w-6 h-6 text-indigo-600" />
                <span className="text-sm font-medium text-indigo-700 text-center">Ask SOP AI</span>
              </Link>
              <Link to={createPageUrl('EmergencySOPs')} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-red-50 hover:bg-red-100 transition-colors">
                <AlertTriangle className="w-6 h-6 text-red-600" />
                <span className="text-sm font-medium text-red-700 text-center">Emergency SOPs</span>
              </Link>
              <Link to={createPageUrl('Maintenance') + '?new=true'} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-amber-50 hover:bg-amber-100 transition-colors">
                <Wrench className="w-6 h-6 text-amber-600" />
                <span className="text-sm font-medium text-amber-700 text-center">New Request</span>
              </Link>
              <Link to={createPageUrl('IncidentReports')} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-purple-50 hover:bg-purple-100 transition-colors">
                <ExternalLink className="w-6 h-6 text-purple-600" />
                <span className="text-sm font-medium text-purple-700 text-center">Report Incident</span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Open Incidents (managers) */}
      {canManage && incidents.length > 0 && (
        <Card className="border-0 shadow-sm border-l-4 border-l-red-400">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <h2 className="font-semibold text-red-900">{incidents.length} Open Incident{incidents.length > 1 ? 's' : ''}</h2>
              </div>
              <Link to={createPageUrl('IncidentReports')} className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="space-y-2">
              {incidents.slice(0, 3).map(inc => (
                <div key={inc.id} className="flex items-center justify-between py-2 border-b border-red-50 last:border-0">
                  <p className="text-sm font-medium text-slate-800">{inc.title}</p>
                  <StatusBadge status={inc.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}