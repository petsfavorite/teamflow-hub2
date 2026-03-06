import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import { BookOpen, CheckSquare, Wrench, MessageSquare, ExternalLink, ArrowRight, Clock, AlertTriangle, ClipboardList, Bell, ShieldAlert, CalendarCheck } from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
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
  const { user, canManage, isAdmin, isSuperAdmin } = useCurrentUser();
  const canApprove = isAdmin || isSuperAdmin;

  const { data: sops = [] } = useQuery({
    queryKey: ['sops'],
    queryFn: () => base44.entities.SOP.filter({ status: 'published' }),
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['checklists-assigned'],
    queryFn: () => base44.entities.ChecklistTemplate.filter({ status: ['published', 'active'] }),
  });

  const { data: maintenanceRequests = [] } = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => base44.entities.MaintenanceRequest.list('-created_date', 200),
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

  const { data: pendingSOPs = [] } = useQuery({
    queryKey: ['pending-sops-dash'],
    queryFn: () => base44.entities.SOP.filter({ status: 'pending_approval' }, '-updated_date', 20),
    enabled: isAdmin || isSuperAdmin,
  });

  const { data: allSOPs = [] } = useQuery({
    queryKey: ['sops-verification'],
    queryFn: () => base44.entities.SOP.filter({ status: 'published' }, '-updated_date', 200),
    enabled: canManage,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks-dash'],
    queryFn: () => base44.entities.Task.filter({ assigned_to_email: user?.email }, '-created_date', 10),
    enabled: !!user?.email,
  });

  const verificationDueSops = allSOPs.filter(sop => {
    if (!sop.verification_due_date) return false;
    const daysLeft = differenceInDays(parseISO(sop.verification_due_date), new Date());
    return daysLeft <= 7;
  }).sort((a, b) => {
    const dA = differenceInDays(parseISO(a.verification_due_date), new Date());
    const dB = differenceInDays(parseISO(b.verification_due_date), new Date());
    return dA - dB;
  });

  const myChecklists = checklists.filter(c =>
    !c.assigned_to || c.assigned_to.length === 0 || c.assigned_to.includes(user?.email)
  );

  const openMaintenance = maintenanceRequests.filter(r => r.status !== 'completed');
  const myPendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Welcome back, {user?.full_name?.split(' ')[0] || 'there'}
        </h1>
        <p className="text-slate-500 mt-1">Here's what's happening today.</p>
      </div>

      {/* Notifications tile for managers/admins */}
      {canManage && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-5 h-5 text-indigo-600" />
              <h2 className="font-semibold text-slate-900">Notifications</h2>
              {(pendingSOPs.length + verificationDueSops.length) > 0 && (
                <span className="ml-auto bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {pendingSOPs.length + verificationDueSops.length}
                </span>
              )}
            </div>
            {pendingSOPs.length === 0 && verificationDueSops.length === 0 ? (
              <p className="text-sm text-slate-400 py-2 text-center">No pending notifications</p>
            ) : (
              <div className="space-y-2">
                {canApprove && pendingSOPs.map(sop => (
                  <Link key={sop.id} to={createPageUrl('SOPDetail') + `?id=${sop.id}`}>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors">
                      <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-amber-900 truncate">Pending Edit: {sop.title}</p>
                        {sop.pending_submitted_by_name && (
                          <p className="text-xs text-amber-700">Submitted by {sop.pending_submitted_by_name}</p>
                        )}
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    </div>
                  </Link>
                ))}
                {verificationDueSops.map(sop => {
                  const daysLeft = differenceInDays(parseISO(sop.verification_due_date), new Date());
                  const overdue = daysLeft < 0;
                  return (
                    <Link key={sop.id} to={createPageUrl('SOPDetail') + `?id=${sop.id}`}>
                      <div className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${overdue ? 'bg-red-50 hover:bg-red-100' : 'bg-orange-50 hover:bg-orange-100'}`}>
                        <CalendarCheck className={`w-4 h-4 flex-shrink-0 ${overdue ? 'text-red-600' : 'text-orange-600'}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${overdue ? 'text-red-900' : 'text-orange-900'}`}>
                            {overdue ? 'Verification Overdue' : 'Verification Due Soon'}: {sop.title}
                          </p>
                          <p className={`text-xs ${overdue ? 'text-red-700' : 'text-orange-700'}`}>
                            {overdue ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} overdue` : daysLeft === 0 ? 'Due today' : `Due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}
                          </p>
                        </div>
                        <ArrowRight className={`w-3.5 h-3.5 flex-shrink-0 ${overdue ? 'text-red-600' : 'text-orange-600'}`} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ClipboardList} label="My Tasks" value={myPendingTasks.length} color="bg-purple-600" to={createPageUrl('Tasks')} />
        <StatCard icon={CheckSquare} label="My Checklists" value={myChecklists.length} color="bg-emerald-600" to={createPageUrl('Checklists')} />
        <StatCard icon={BookOpen} label="SOP Library" value={sops.length} color="bg-indigo-600" to={createPageUrl('SOPs')} />
        <StatCard icon={Wrench} label="Open Maintenance" value={openMaintenance.length} color="bg-amber-600" to={createPageUrl('Maintenance')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Maintenance Requests */}
...
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