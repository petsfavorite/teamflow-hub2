import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import PageHeader from '../components/shared/PageHeader';
import StatusBadge from '../components/shared/StatusBadge';
import EmptyState from '../components/shared/EmptyState';
import TaskRow from '../components/task/TaskRow';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ClipboardList, Plus, Calendar, Users, CheckCircle, Loader2, Circle, PlayCircle, RefreshCw, Search } from 'lucide-react';
import RecurringTaskCard from '../components/task/RecurringTaskCard';
import { toast } from "sonner";

const priorityColors = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
};

const emptyForm = { 
  title: '', 
  description: '', 
  assigned_to_emails: [], 
  assigned_to_names: [], 
  assigned_teams: [], 
  due_date: '', 
  priority: 'medium', 
  recurrence_type: 'once',
  recurrence_days_of_week: [],
  recurrence_day_of_month: 1,
  recurrence_interval_months: 1,
};

export default function Tasks() {
  const { user, loading: userLoading, canManage, isSuperAdmin, isAdmin, isManager } = useCurrentUser();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [tab, setTab] = useState('mine');
  const [editTask, setEditTask] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [newUserSearch, setNewUserSearch] = useState('');
  const [editUserSearch, setEditUserSearch] = useState('');

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-created_date', 200),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => {
      const res = await base44.functions.invoke('listUsers', {});
      return res.data?.users || [];
    },
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
  });

  const { data: assets = [] } = useQuery({
    queryKey: ['assets'],
    queryFn: () => base44.entities.Asset.list('name', 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Task.create(data),
    onSuccess: () => {
      toast.success('Task created');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setShowNew(false);
      setForm(emptyForm);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      toast.success('Task updated');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const myTeamIds = useMemo(() => new Set(
    teams.filter(t => t.member_emails?.includes(user?.email)).map(t => t.id)
  ), [teams, user?.email]);

  // Users on teams managed by this manager
  const managedTeamMemberEmails = useMemo(() => new Set(
    teams
      .filter(t => t.member_emails?.includes(user?.email))
      .flatMap(t => t.member_emails || [])
  ), [teams, user?.email]);

  // For assignment: admins/super_admins see all; managers see only their teams + teammates
  // While user is still loading, default to showing all so the dialog isn't empty
  const assignableTeams = (!userLoading && isManager && !isAdmin && !isSuperAdmin)
    ? teams.filter(t => myTeamIds.has(t.id))
    : teams;

  const assignableUsers = (!userLoading && isManager && !isAdmin && !isSuperAdmin)
    ? (managedTeamMemberEmails.size > 0 ? users.filter(u => managedTeamMemberEmails.has(u.email)) : users)
    : users;

  const myTasks = useMemo(() => tasks.filter(t => {
    const assignedToMe = t.assigned_to_emails?.includes(user?.email);
    const inMyTeam = t.assigned_teams?.some(teamId => myTeamIds.has(teamId));
    return (assignedToMe || inMyTeam) && t.status !== 'completed' && t.status !== 'cancelled';
  }), [tasks, user?.email, myTeamIds]);
  const allTasks = useMemo(() => tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled'), [tasks]);
  const completedTasks = useMemo(() => tasks.filter(t => t.status === 'completed'), [tasks]);

  // All tasks with a recurrence type other than 'once'
  const allRecurringTasks = tasks.filter(t => t.recurrence_type && t.recurrence_type !== 'once');
  // Managers see only tasks assigned to their teams or members of their teams
  const recurringTasks = (isAdmin || isSuperAdmin)
    ? allRecurringTasks
    : allRecurringTasks.filter(t =>
        t.assigned_teams?.some(tid => myTeamIds.has(tid)) ||
        t.assigned_to_emails?.some(email => managedTeamMemberEmails.has(email))
      );

  const displayTasks = tab === 'mine' ? myTasks : tab === 'all' ? allTasks : completedTasks;

  const setStatus = async (task, status) => {
    updateMutation.mutate({ id: task.id, data: { status } });
    // Write to TaskHistory when closing a task
    if (status === 'completed' || status === 'cancelled') {
      base44.entities.TaskHistory.create({
        task_id: task.id,
        task_title: task.title,
        task_description: task.description || null,
        priority: task.priority || 'medium',
        due_date: task.due_date || null,
        assigned_to_emails: task.assigned_to_emails || [],
        assigned_to_names: task.assigned_to_names || [],
        assigned_teams: task.assigned_teams || [],
        outcome: status,
        closed_by: user?.email || 'unknown',
        closed_by_name: user?.full_name || user?.email || 'Unknown',
        closed_at: new Date().toISOString(),
        completion_notes: task.completion_notes || null,
      }).catch(() => {});
    }
  };

  const openEditTask = (task) => {
    setEditForm({
      title: task.title || '',
      description: task.description || '',
      assigned_to_emails: task.assigned_to_emails || [],
      assigned_to_names: task.assigned_to_names || [],
      assigned_teams: task.assigned_teams || [],
      due_date: task.due_date || '',
      priority: task.priority || 'medium',
      recurrence_type: task.recurrence_type || 'once',
      recurrence_days_of_week: task.recurrence_days_of_week || [],
      recurrence_day_of_month: task.recurrence_day_of_month || 1,
      recurrence_interval_months: task.recurrence_interval_months || 1,
    });
    setEditTask(task);
  };

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="One-off assignments for the team"
        actions={
          canManage && (
            <Button onClick={() => setShowNew(true)} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              <Plus className="w-4 h-4" /> Assign Task
            </Button>
          )
        }
      />

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 -mx-6 px-6 md:mx-0 md:px-0">
         {['mine', 'all', 'completed', ...(canManage ? ['recurring'] : [])].map(t => (
           <button
             key={t}
             onClick={() => setTab(t)}
             className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${tab === t ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}
           >
             {t === 'mine' ? 'My Tasks' : t === 'all' ? 'All Active' : t === 'completed' ? 'Completed' : 'Recurring'}
           </button>
         ))}
       </div>

      {tab === 'recurring' ? (
        isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i=><Card key={i} className="border-0 shadow-sm animate-pulse"><CardContent className="p-4"><div className="h-16 bg-slate-100 rounded"/></CardContent></Card>)}</div>
        ) : recurringTasks.length === 0 ? (
          <EmptyState icon={RefreshCw} title="No recurring tasks" description="No recurring tasks found" />
        ) : (
          <div className="space-y-3">
            {recurringTasks.map(task => (
              <RecurringTaskCard key={task.id} task={task} onEdit={openEditTask} assetName={task.asset_id ? assets.find(a => a.id === task.asset_id)?.name : null} />
            ))}
          </div>
        )
      ) : isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i=><Card key={i} className="border-0 shadow-sm animate-pulse"><CardContent className="p-4"><div className="h-14 bg-slate-100 rounded"/></CardContent></Card>)}</div>
      ) : displayTasks.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No tasks" description={tab === 'mine' ? "No tasks assigned to you" : "No tasks in this view"} />
      ) : (
        <div className="space-y-3">
          {displayTasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              onStatusChange={setStatus}
              canEdit={canManage}
              user={user}
              teams={assignableTeams}
              allowedUsers={assignableUsers}
              assetName={task.asset_id ? assets.find(a => a.id === task.asset_id)?.name : null}
            />
          ))}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
         <DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1">
            <div className="space-y-2"><Label>Task Title</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="What needs to be done?" /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>

            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Recurrence</Label>
              <Select value={form.recurrence_type} onValueChange={v => setForm({ ...form, recurrence_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Once</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekdays">Weekdays (Mon–Fri)</SelectItem>
                  <SelectItem value="specific_days">Specific Days of Week</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="every_x_months">Every X Months</SelectItem>
                  <SelectItem value="annually">Annually</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.recurrence_type === 'specific_days' && (
              <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <Label>On these days</Label>
                <div className="grid grid-cols-2 gap-2">
                  {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day, idx) => (
                    <label key={idx} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.recurrence_days_of_week?.includes(idx)}
                        onCheckedChange={checked => setForm(prev => ({
                          ...prev,
                          recurrence_days_of_week: checked
                            ? [...(prev.recurrence_days_of_week || []), idx]
                            : (prev.recurrence_days_of_week || []).filter(d => d !== idx)
                        }))}
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {form.recurrence_type === 'monthly' && (
              <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <Label>Day of month</Label>
                <Input type="number" min="1" max="31" value={form.recurrence_day_of_month} onChange={e => setForm({ ...form, recurrence_day_of_month: parseInt(e.target.value) || 1 })} />
              </div>
            )}

            {form.recurrence_type === 'every_x_months' && (
              <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <Label>Every how many months</Label>
                <Input type="number" min="1" value={form.recurrence_interval_months} onChange={e => setForm({ ...form, recurrence_interval_months: parseInt(e.target.value) || 1 })} />
                <Label>On day of month</Label>
                <Input type="number" min="1" max="31" value={form.recurrence_day_of_month} onChange={e => setForm({ ...form, recurrence_day_of_month: parseInt(e.target.value) || 1 })} />
              </div>
            )}

            <div className="space-y-2">
              <Label>Assign to Users</Label>
              <div className="relative mb-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input placeholder="Search users..." value={newUserSearch} onChange={e => setNewUserSearch(e.target.value)} className="pl-7 h-8 text-sm" />
              </div>
              <div className="flex flex-col gap-1 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200" style={{ maxHeight: '108px' }}>
                {assignableUsers.filter(u => (u.full_name || u.email).toLowerCase().includes(newUserSearch.toLowerCase())).map(u => (
                  <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={form.assigned_to_emails.includes(u.email)}
                      onCheckedChange={checked => {
                        const emails = checked
                          ? [...form.assigned_to_emails, u.email]
                          : form.assigned_to_emails.filter(e => e !== u.email);
                        const names = checked
                          ? [...form.assigned_to_names, u.full_name || u.email]
                          : form.assigned_to_names.filter((_, i) => form.assigned_to_emails[i] !== u.email);
                        setForm({ ...form, assigned_to_emails: emails, assigned_to_names: names });
                      }}
                    />
                    {u.full_name || u.email}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assign to Teams</Label>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200">
                {assignableTeams.map(t => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.assigned_teams.includes(t.id)}
                      onCheckedChange={checked => {
                        setForm({
                          ...form,
                          assigned_teams: checked
                            ? [...form.assigned_teams, t.id]
                            : form.assigned_teams.filter(id => id !== t.id)
                        });
                      }}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate({ ...form, created_by_name: user?.full_name })} disabled={createMutation.isPending || !form.title || (form.assigned_to_emails.length === 0 && form.assigned_teams.length === 0)} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Recurring Task Dialog */}
       <Dialog open={!!editTask} onOpenChange={(open) => { if (!open) setEditTask(null); }}>
         <DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Edit Recurring Task</DialogTitle></DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-1">
            <div className="space-y-2"><Label>Task Title</Label><Input value={editForm.title || ''} onChange={e => setEditForm({ ...editForm, title: e.target.value })} /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={editForm.description || ''} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={2} /></div>
            <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={editForm.due_date || ''} onChange={e => setEditForm({ ...editForm, due_date: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={editForm.priority} onValueChange={v => setEditForm({ ...editForm, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Recurrence</Label>
              <Select value={editForm.recurrence_type} onValueChange={v => setEditForm({ ...editForm, recurrence_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Once (stops recurring)</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekdays">Weekdays (Mon–Fri)</SelectItem>
                  <SelectItem value="specific_days">Specific Days of Week</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="every_x_months">Every X Months</SelectItem>
                  <SelectItem value="annually">Annually</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editForm.recurrence_type === 'specific_days' && (
              <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <Label>On these days</Label>
                <div className="grid grid-cols-2 gap-2">
                  {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day, idx) => (
                    <label key={idx} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={editForm.recurrence_days_of_week?.includes(idx)}
                        onCheckedChange={checked => setEditForm(prev => ({
                          ...prev,
                          recurrence_days_of_week: checked
                            ? [...(prev.recurrence_days_of_week || []), idx]
                            : (prev.recurrence_days_of_week || []).filter(d => d !== idx)
                        }))}
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {editForm.recurrence_type === 'monthly' && (
              <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <Label>Day of month</Label>
                <Input type="number" min="1" max="31" value={editForm.recurrence_day_of_month} onChange={e => setEditForm({ ...editForm, recurrence_day_of_month: parseInt(e.target.value) || 1 })} />
              </div>
            )}
            {editForm.recurrence_type === 'every_x_months' && (
              <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <Label>Every how many months</Label>
                <Input type="number" min="1" value={editForm.recurrence_interval_months} onChange={e => setEditForm({ ...editForm, recurrence_interval_months: parseInt(e.target.value) || 1 })} />
                <Label>On day of month</Label>
                <Input type="number" min="1" max="31" value={editForm.recurrence_day_of_month} onChange={e => setEditForm({ ...editForm, recurrence_day_of_month: parseInt(e.target.value) || 1 })} />
              </div>
            )}
            <div className="space-y-2">
              <Label>Assign to Users</Label>
              <div className="relative mb-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input placeholder="Search users..." value={editUserSearch} onChange={e => setEditUserSearch(e.target.value)} className="pl-7 h-8 text-sm" />
              </div>
              <div className="flex flex-col gap-1 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200" style={{ maxHeight: '108px' }}>
                {assignableUsers.filter(u => (u.full_name || u.email).toLowerCase().includes(editUserSearch.toLowerCase())).map(u => (
                  <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={(editForm.assigned_to_emails || []).includes(u.email)}
                      onCheckedChange={checked => {
                        const emails = checked ? [...(editForm.assigned_to_emails || []), u.email] : (editForm.assigned_to_emails || []).filter(e => e !== u.email);
                        const names = checked ? [...(editForm.assigned_to_names || []), u.full_name || u.email] : (editForm.assigned_to_names || []).filter((_, i) => (editForm.assigned_to_emails || [])[i] !== u.email);
                        setEditForm({ ...editForm, assigned_to_emails: emails, assigned_to_names: names });
                      }}
                    />
                    {u.full_name || u.email}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assign to Teams</Label>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200">
                {assignableTeams.map(t => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={(editForm.assigned_teams || []).includes(t.id)}
                      onCheckedChange={checked => setEditForm({ ...editForm, assigned_teams: checked ? [...(editForm.assigned_teams || []), t.id] : (editForm.assigned_teams || []).filter(id => id !== t.id) })}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTask(null)}>Cancel</Button>
            <Button
              onClick={() => updateMutation.mutate({ id: editTask.id, data: editForm }, { onSuccess: () => setEditTask(null) })}
              disabled={updateMutation.isPending || !editForm.title}
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}