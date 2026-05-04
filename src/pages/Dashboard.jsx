import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from '../components/shared/StatusBadge';
import DismissibleOverdueTask from '../components/dashboard/DismissibleOverdueTask';
import BonuslyRecognitions from '../components/dashboard/BonuslyRecognitions';
import {
  LayoutDashboard, BookOpen, CheckSquare, ClipboardList, Wrench,
  AlertTriangle, MessageSquare, ArrowRight, Bell, ShieldAlert, CalendarCheck, Clock, Award, FileCheck
} from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';

function StatCard({ icon: Icon, label, value, color, to }) {
  const content = (
    <Card className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer h-full">
      <CardContent className="p-3 sm:p-4 flex items-center gap-3 h-full">
        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-4 sm:w-5 h-4 sm:h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg sm:text-2xl font-bold text-slate-900">{value}</p>
          <p className="text-xs sm:text-sm text-slate-500 truncate">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

export default function Dashboard() {
  const { user, canManage, isSuperAdmin, isAdmin, isManager } = useCurrentUser();
  const canApprove = isSuperAdmin || isAdmin;
  const queryClient = useQueryClient();

  const { data: sops = [] } = useQuery({
    queryKey: ['sops-dash'],
    queryFn: () => base44.entities.SOP.filter({ status: 'published' }),
    enabled: !!user?.email,
  });

  const { data: allSOPs = [] } = useQuery({
    queryKey: ['all-sops-dash'],
    queryFn: () => base44.entities.SOP.list(),
    enabled: !!user?.email && canManage,
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['checklists-dash'],
    queryFn: () => base44.entities.ChecklistTemplate.list(),
    enabled: !!user?.email,
  });

  const { data: pendingChecklistEdits = [] } = useQuery({
    queryKey: ['pending-checklist-edits-dash'],
    queryFn: () => base44.entities.ChecklistTemplate.filter({ status: 'pending_approval' }),
    enabled: !!user?.email && canApprove,
  });

  const { data: maintenanceRequests = [] } = useQuery({
    queryKey: ['maintenance-dash'],
    queryFn: () => base44.entities.MaintenanceRequest.list('-created_date', 20),
    enabled: !!user?.email,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks-dash'],
    queryFn: () => base44.entities.Task.list('-due_date', 200),
    enabled: !!user?.email,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams-dash'],
    queryFn: () => base44.entities.Team.list(),
    enabled: !!user?.email,
  });



  const { data: allIncidents = [] } = useQuery({
    queryKey: ['incidents-dash'],
    queryFn: () => base44.entities.IncidentReport.list('-created_date', 50),
    enabled: !!user?.email && canManage,
  });

  const { data: recentAwards = [] } = useQuery({
    queryKey: ['bonusly-awards'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getBonuslyAwards', {});
      return res.data?.recognitions || [];
    },
    enabled: !!user?.email,
  });

  // SOPs requiring acknowledgement that this user hasn't acknowledged yet
  const { data: pendingAckSops = [] } = useQuery({
    queryKey: ['sops-pending-ack-dash', user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const allPublished = await base44.entities.SOP.filter({ status: 'published' }, '-updated_date', 200);
      const requiresAck = allPublished.filter(sop =>
        sop.requires_acknowledgement &&
        sop.acknowledgement_assigned_emails?.includes(user.email)
      );
      if (requiresAck.length === 0) return [];
      const acks = await base44.entities.SOPAcknowledgement.filter({ user_email: user.email });
      const ackedSopIds = new Set(acks.map(a => a.sop_id));
      return requiresAck.filter(sop => !ackedSopIds.has(sop.id));
    },
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

  // For managers: only show pending SOPs assigned to them or their teams
  // For admins/super admins: show all pending SOPs
  const pendingSOPs = allSOPs.filter(s => {
    if (s.status !== 'pending_approval') return false;
    if (canApprove) return true; // Admins/Super Admins see all
    // Managers see only those assigned to them or their teams
    const assignedToMe = s.acknowledgement_assigned_emails?.includes(user?.email);
    const assignedToMyTeam = s.acknowledgement_assigned_teams?.some(tid => myTeamIds.includes(tid));
    return assignedToMe || assignedToMyTeam;
  });

  const incidents = allIncidents.filter(inc => {
    if (inc.status === 'resolved') return false;
    if (inc.is_private && !canApprove) return false;
    return true;
  });

  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  const myTeamIds = teams.filter(t => t.member_emails?.includes(user?.email)).map(t => t.id);

  // For regular users: tasks/checklists due in ~1 hour (yellow)
  const urgentTasks = tasks.filter(t => {
    if (t.status === 'completed' || t.status === 'cancelled') return false;
    if (!t.due_date) return false;
    if (t.due_date < today) return false; // Skip overdue
    const assignedToMe = t.assigned_to_emails?.includes(user?.email);
    const assignedToMyTeam = t.assigned_teams?.some(tid => myTeamIds.includes(tid));
    if (!assignedToMe && !assignedToMyTeam) return false;
    const dueDateTime = parseISO(t.due_date + 'T23:59:59');
    return dueDateTime <= oneHourFromNow && dueDateTime > now;
  });

  // For regular users: overdue incomplete tasks (red) - only removed when completed
  const overdueIncompleteTeasks = tasks.filter(t => {
    if (t.status === 'completed' || t.status === 'cancelled') return false;
    if (!t.due_date || t.due_date >= today) return false; // Only overdue
    const assignedToMe = t.assigned_to_emails?.includes(user?.email);
    const assignedToMyTeam = t.assigned_teams?.some(tid => myTeamIds.includes(tid));
    return assignedToMe || assignedToMyTeam;
  });

  // For managers/admins: overdue incomplete tasks assigned to others in their teams (dismissible)
  const managersSeenOverdueTasks = canManage ? tasks.filter(t => {
    if (t.status === 'completed' || t.status === 'cancelled') return false;
    if (!t.due_date || t.due_date >= today) return false; // Only overdue
    
    // Check if dismissed in the last 24 hours
    const dismissalForUser = t.dismissed_notifications?.find(d => d.user_email === user?.email);
    if (dismissalForUser) {
      const dismissedAt = new Date(dismissalForUser.dismissed_at);
      const hoursSinceDismissal = (now.getTime() - dismissedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceDismissal < 24) return false; // Still within 24-hour window
    }
    
    // Don't show own tasks (regular users see overdue own tasks above)
    const assignedToMe = t.assigned_to_emails?.includes(user?.email);
    if (assignedToMe && t.assigned_to_emails.length === 1) return false;
    // Show if assigned to team members (not self)
    const assignedToMyTeam = t.assigned_teams?.some(tid => myTeamIds.includes(tid));
    return assignedToMyTeam && !assignedToMe;
  }) : [];

  // For regular users: checklists due in ~1 hour (yellow)
  const urgentChecklists = checklists.filter(c => {
    if (!c.due_date) return false;
    if (c.due_date < today) return false;
    const assignedToMe = c.assigned_to_emails?.includes(user?.email);
    const assignedToMyTeam = c.assigned_teams?.some(tid => myTeamIds.includes(tid));
    if (!assignedToMe && !assignedToMyTeam) return false;
    const dueTime = c.due_time || '21:00';
    const dueDateTime = parseISO(c.due_date + 'T' + dueTime);
    return dueDateTime <= oneHourFromNow && dueDateTime > now;
  });

  // For regular users: new tasks/checklists assigned to acknowledge
  const newTasksToAck = tasks.filter(t => {
    if (t.status === 'completed' || t.status === 'cancelled') return false;
    const createdDateObj = parseISO(t.created_date || '');
    const isNew = (now.getTime() - createdDateObj.getTime()) / (1000 * 60) <= 1440; // Created in last 24 hours
    const assignedToMe = t.assigned_to_emails?.includes(user?.email);
    const assignedToMyTeam = t.assigned_teams?.some(tid => myTeamIds.includes(tid));
    return (assignedToMe || assignedToMyTeam) && isNew;
  });

  const newChecklistsToAck = checklists.filter(c => {
    const createdDateObj = parseISO(c.created_date || '');
    const isNew = (now.getTime() - createdDateObj.getTime()) / (1000 * 60) <= 1440;
    const assignedToMe = c.assigned_to_emails?.includes(user?.email);
    const assignedToMyTeam = c.assigned_teams?.some(tid => myTeamIds.includes(tid));
    return (assignedToMe || assignedToMyTeam) && isNew;
  });

  // "My Tasks" - all pending tasks assigned to user or their teams with due date today
  const myPendingTasks = tasks.filter(t => {
    if (t.status === 'completed' || t.status === 'cancelled') return false;
    if (t.due_date !== today) return false;
    const assignedToMe = t.assigned_to_emails?.includes(user?.email);
    const assignedToMyTeam = t.assigned_teams?.some(tid => myTeamIds.includes(tid));
    return assignedToMe || assignedToMyTeam;
  });

  // "My Tasks Due Soon" - pending tasks assigned to user or their teams with due date within next 7 days (today through +7 days)
  const myTasksDueSoon = tasks.filter(t => {
    if (t.status === 'completed' || t.status === 'cancelled') return false;
    if (!t.due_date) return false;
    const assignedToMe = t.assigned_to_emails?.includes(user?.email);
    const assignedToMyTeam = t.assigned_teams?.some(tid => myTeamIds.includes(tid));
    if (!assignedToMe && !assignedToMyTeam) return false;
    const daysUntilDue = differenceInDays(parseISO(t.due_date), new Date());
    return daysUntilDue >= 0 && daysUntilDue <= 7;
  });

  // "My Checklists" shows all published or active checklists assigned to user (any role) or their teams
  const myChecklists = checklists.filter(c => {
    if (c.status !== 'published' && c.status !== 'active') return false;
    const assignedToMe = c.assigned_to_emails?.includes(user?.email);
    const assignedToMyTeam = c.assigned_teams?.some(tid => myTeamIds.includes(tid));
    return assignedToMe || assignedToMyTeam;
  });

  // "My Checklists Due Soon" - published checklists assigned to user with due date within next 7 days (today through +7 days)
  const myChecklistsDueSoon = myChecklists.filter(c => {
    if (!c.due_date) return false;
    const daysUntilDue = differenceInDays(parseISO(c.due_date), new Date());
    return daysUntilDue >= 0 && daysUntilDue <= 7;
  });

  const openMaintenance = maintenanceRequests.filter(r => {
    if (r.status === 'completed') return false;
    if (canManage) return true; // Managers see all
    // Regular users see only maintenance they requested
    return r.requested_by === user?.email;
  });

  return (
    <div className="space-y-6 md:space-y-8">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
          Welcome back, {user?.full_name?.split(' ')[0] || 'there'}
        </h1>
        <p className="text-sm md:text-base text-slate-500 mt-1">Here's what's happening today.</p>
      </div>

      {/* Notifications tile for regular users */}
      {!canManage && (overdueIncompleteTeasks.length > 0 || urgentTasks.length > 0 || urgentChecklists.length > 0 || newTasksToAck.length > 0 || newChecklistsToAck.length > 0 || pendingAckSops.length > 0) && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-5 h-5 text-slate-600" />
              <h2 className="font-semibold text-slate-900">Notifications</h2>
            </div>
            <div className="space-y-2">
              {/* Red: Overdue incomplete tasks */}
              {overdueIncompleteTeasks.map(task => (
                <Link key={task.id} to={createPageUrl('Tasks')}>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 hover:bg-red-100 transition-colors">
                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-red-900 truncate">⚠️ Task overdue: {task.title}</p>
                      <p className="text-xs text-red-700">Was due {task.due_date}</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                  </div>
                </Link>
              ))}
              {/* Yellow: Urgent (1 hour left) */}
              {urgentTasks.map(task => (
                <Link key={task.id} to={createPageUrl('Tasks')}>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 hover:bg-yellow-100 transition-colors">
                    <Clock className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-yellow-900 truncate">⏰ Task due soon: {task.title}</p>
                      <p className="text-xs text-yellow-700">Due {task.due_date}</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-yellow-600 flex-shrink-0" />
                  </div>
                </Link>
              ))}
              {urgentChecklists.map(checklist => (
                <Link key={checklist.id} to={createPageUrl('Checklists')}>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 hover:bg-yellow-100 transition-colors">
                    <Clock className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-yellow-900 truncate">⏰ Checklist due soon: {checklist.title}</p>
                      <p className="text-xs text-yellow-700">Due {checklist.due_date}</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-yellow-600 flex-shrink-0" />
                  </div>
                </Link>
              ))}
              {/* Amber: SOPs requiring acknowledgement */}
              {pendingAckSops.map(sop => (
                <Link key={sop.id} to={createPageUrl('SOPDetail') + `?id=${sop.id}`}>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors border border-amber-200">
                    <FileCheck className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-amber-900 truncate">📋 Read & acknowledge: {sop.title}</p>
                      <p className="text-xs text-amber-700">Tap to read the SOP, then click "I've Read This"</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                  </div>
                </Link>
              ))}
              {/* White: New items to acknowledge */}
              {newTasksToAck.map(task => (
                <Link key={task.id} to={createPageUrl('Tasks')}>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-200">
                    <ClipboardList className="w-4 h-4 text-slate-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">New task assigned: {task.title}</p>
                      <p className="text-xs text-slate-500">Tap to acknowledge</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                  </div>
                </Link>
              ))}
              {newChecklistsToAck.map(checklist => (
                <Link key={checklist.id} to={createPageUrl('Checklists')}>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-200">
                    <CheckSquare className="w-4 h-4 text-slate-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">New checklist assigned: {checklist.title}</p>
                      <p className="text-xs text-slate-500">Tap to acknowledge</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notifications tile for managers/admins */}
      {canManage && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-5 h-5 text-indigo-600" />
              <h2 className="font-semibold text-slate-900">Notifications</h2>
              {(pendingAckSops.length + pendingSOPs.length + verificationDueSops.length + incidents.length + openMaintenance.length + managersSeenOverdueTasks.length + (canApprove ? pendingChecklistEdits.length : 0)) > 0 && (
                <span className="ml-auto bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {pendingAckSops.length + pendingSOPs.length + verificationDueSops.length + incidents.length + openMaintenance.length + managersSeenOverdueTasks.length + (canApprove ? pendingChecklistEdits.length : 0)}
                </span>
              )}
            </div>
            {pendingAckSops.length === 0 && pendingSOPs.length === 0 && verificationDueSops.length === 0 && incidents.length === 0 && openMaintenance.length === 0 && managersSeenOverdueTasks.length === 0 && pendingChecklistEdits.length === 0 ? (
              <p className="text-sm text-slate-400 py-2 text-center">No pending notifications</p>
            ) : (
              <div className="space-y-2">
                {/* Amber: SOPs requiring acknowledgement (managers must read too) */}
                {pendingAckSops.map(sop => (
                  <Link key={sop.id} to={createPageUrl('SOPDetail') + `?id=${sop.id}`}>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors border border-amber-200">
                      <FileCheck className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-amber-900 truncate">📋 Read & acknowledge: {sop.title}</p>
                        <p className="text-xs text-amber-700">Tap to read the SOP, then click "I've Read This"</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    </div>
                  </Link>
                ))}
                {/* Team members' overdue tasks - dismissible for managers */}
                {managersSeenOverdueTasks.map(task => (
                  <DismissibleOverdueTask
                    key={task.id}
                    task={task}
                    user={user}
                  />
                ))}
                {incidents.map(inc => (
                  <Link key={inc.id} to={createPageUrl('IncidentReports')}>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 hover:bg-red-100 transition-colors">
                      <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-red-900 truncate">
                          {inc.is_private ? '🔒 ' : ''}{inc.status === 'under_review' ? 'Under Review' : 'New Incident'}: {inc.title}
                        </p>
                        <p className="text-xs text-red-700">Reported by {inc.reported_by_name} • {inc.incident_date}</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                    </div>
                  </Link>
                ))}
                {openMaintenance.map(req => (
                  <Link key={req.id} to={createPageUrl('Maintenance')}>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors">
                      <Wrench className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-amber-900 truncate">Maintenance: {req.title}</p>
                        <p className="text-xs text-amber-700">Status: {req.status}</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    </div>
                  </Link>
                ))}
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
                {canApprove && pendingChecklistEdits.map(checklist => (
                  <Link key={checklist.id} to={createPageUrl('ChecklistEditor') + `?id=${checklist.id}`}>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors">
                      <CheckSquare className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-indigo-900 truncate">Pending Checklist Edit: {checklist.title}</p>
                        {checklist.pending_submitted_by_name && (
                          <p className="text-xs text-indigo-700">Submitted by {checklist.pending_submitted_by_name}{checklist.pending_change_summary ? ` · ${checklist.pending_change_summary}` : ''}</p>
                        )}
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
         <div className="h-20 sm:h-24">
            <StatCard icon={ClipboardList} label="Tasks Due Soon" value={myTasksDueSoon.length} color="bg-purple-600" to={createPageUrl('Tasks')} />
          </div>
          <div className="h-20 sm:h-24">
            <StatCard icon={CheckSquare} label="Checklists Due Soon" value={myChecklistsDueSoon.length} color="bg-emerald-600" to={createPageUrl('Checklists')} />
          </div>
          </div>

         <BonuslyRecognitions />

         <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Active Maintenance Requests */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Active Maintenance</h2>
              <Link to={createPageUrl('Maintenance')} className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {openMaintenance.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No active requests</p>
            ) : (
              <div className="space-y-3">
                {openMaintenance.slice(0, 4).map(req => (
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

        {/* Open Incidents */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Open Incidents</h2>
              <Link to={createPageUrl('IncidentReports')} className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {incidents.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No open incidents</p>
            ) : (
              <div className="space-y-3">
                {incidents.slice(0, 4).map(inc => (
                  <div key={inc.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{inc.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-400">{inc.incident_date}</span>
                      </div>
                    </div>
                    <StatusBadge status={inc.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 md:p-6">
          <h2 className="font-semibold text-sm md:text-base text-slate-900 mb-4">Quick Actions</h2>
         <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <Link to={createPageUrl('SOPs')} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-indigo-50 hover:bg-indigo-100 transition-colors">
              <BookOpen className="w-6 h-6 text-indigo-600" />
              <span className="text-sm font-medium text-indigo-700 text-center">SOP Library</span>
            </Link>
            <Link to={createPageUrl('SOPAssistant')} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors">
              <MessageSquare className="w-6 h-6 text-blue-600" />
              <span className="text-sm font-medium text-blue-700 text-center">Ask SOP AI</span>
            </Link>
            <Link to={createPageUrl('Maintenance') + '?new=true'} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-amber-50 hover:bg-amber-100 transition-colors">
              <Wrench className="w-6 h-6 text-amber-600" />
              <span className="text-sm font-medium text-amber-700 text-center">New Request</span>
            </Link>
            <Link to={createPageUrl('IncidentReports')} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-purple-50 hover:bg-purple-100 transition-colors">
              <AlertTriangle className="w-6 h-6 text-purple-600" />
              <span className="text-sm font-medium text-purple-700 text-center">Report Incident</span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}