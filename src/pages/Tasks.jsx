import React, { useState } from 'react';
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import PageHeader from '../components/shared/PageHeader';
import StatusBadge from '../components/shared/StatusBadge';
import EmptyState from '../components/shared/EmptyState';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ClipboardList, Plus, Calendar, Users, CheckCircle, Loader2, Circle, PlayCircle } from 'lucide-react';
import { toast } from "sonner";

const priorityColors = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
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
  custom_frequency_type: 'days',
  custom_frequency_value: 1,
  custom_frequency_days: [],
  custom_frequency_day_of_month: 1
};

export default function Tasks() {
  const { user, canManage } = useCurrentUser();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [tab, setTab] = useState('mine');

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-created_date', 200),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => base44.entities.User.list('full_name', 200),
    enabled: canManage,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
    enabled: canManage,
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

  const myTeamIds = new Set(
    teams.filter(t => t.member_emails?.includes(user?.email)).map(t => t.id)
  );

  const myTasks = tasks.filter(t => {
    const assignedToMe = t.assigned_to_emails?.includes(user?.email);
    const inMyTeam = t.assigned_teams?.some(teamId => myTeamIds.has(teamId));
    return (assignedToMe || inMyTeam) && t.status !== 'completed' && t.status !== 'cancelled';
  });
  const allTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  const displayTasks = tab === 'mine' ? myTasks : tab === 'all' ? allTasks : completedTasks;

  const setStatus = (task, status) => {
    updateMutation.mutate({ id: task.id, data: { status } });
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

      <div className="flex gap-2 mb-6">
        {['mine', 'all', 'completed'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}
          >
            {t === 'mine' ? 'My Tasks' : t === 'all' ? 'All Active' : 'Completed'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i=><Card key={i} className="border-0 shadow-sm animate-pulse"><CardContent className="p-4"><div className="h-14 bg-slate-100 rounded"/></CardContent></Card>)}</div>
      ) : displayTasks.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No tasks" description={tab === 'mine' ? "No tasks assigned to you" : "No tasks in this view"} />
      ) : (
        <div className="space-y-3">
          {displayTasks.map(task => (
            <Card key={task.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex gap-1.5 flex-shrink-0">
                    {task.status === 'pending' && (
                      <button onClick={() => setStatus(task, 'in_progress')} title="Start task" className="p-1 hover:bg-slate-100 rounded">
                        <Circle className="w-5 h-5 text-slate-400 hover:text-indigo-500" />
                      </button>
                    )}
                    {task.status === 'in_progress' && (
                      <button onClick={() => setStatus(task, 'completed')} title="Complete task" className="p-1 hover:bg-emerald-50 rounded">
                        <PlayCircle className="w-5 h-5 text-indigo-500 hover:text-emerald-600" />
                      </button>
                    )}
                    {task.status === 'completed' && (
                      <CheckCircle className="w-5 h-5 text-emerald-500 m-1" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-900'}`}>{task.title}</p>
                    {task.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{task.description}</p>}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400 flex-wrap">
                       {(task.assigned_to_names?.length || task.assigned_teams?.length) > 0 && (
                         <span className="flex items-center gap-1">
                           <Users className="w-3 h-3" />
                           {[...(task.assigned_to_names || []), ...(task.assigned_teams || [])].join(', ') || 'Unassigned'}
                         </span>
                       )}
                       {task.due_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Due {task.due_date}</span>}
                     </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${priorityColors[task.priority]}`}>{task.priority}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
          <div className="space-y-4">
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
                  <SelectItem value="weekdays">Weekdays</SelectItem>
                  <SelectItem value="specific_days">Specific Days</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="every_x_months">Every X Months</SelectItem>
                  <SelectItem value="annually">Annually</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.recurrence_type === 'custom' && (
              <div className="space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="space-y-2">
                  <Label>Repeat every</Label>
                  <div className="flex gap-2 items-end">
                    <Input type="number" min="1" value={form.custom_frequency_value} onChange={e => setForm({ ...form, custom_frequency_value: parseInt(e.target.value) || 1 })} className="w-20" />
                    <Select value={form.custom_frequency_type} onValueChange={v => setForm({ ...form, custom_frequency_type: v })}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="days">Day(s)</SelectItem>
                        <SelectItem value="weeks">Week(s)</SelectItem>
                        <SelectItem value="months">Month(s)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {form.custom_frequency_type === 'weeks' && (
                  <div className="space-y-2">
                    <Label>On these days</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, idx) => (
                        <label key={idx} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={form.custom_frequency_days?.includes(idx)}
                            onCheckedChange={checked => {
                              setForm(prev => ({
                                ...prev,
                                custom_frequency_days: checked
                                  ? [...(prev.custom_frequency_days || []), idx]
                                  : (prev.custom_frequency_days || []).filter(d => d !== idx)
                              }));
                            }}
                          />
                          {day}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {form.custom_frequency_type === 'months' && (
                  <div className="space-y-2">
                    <Label>On day of month</Label>
                    <Input type="number" min="1" max="31" value={form.custom_frequency_day_of_month} onChange={e => setForm({ ...form, custom_frequency_day_of_month: parseInt(e.target.value) || 1 })} />
                  </div>
                )}
              </div>
            )}

            {form.recurrence_type === 'specific_days' && (
              <div className="space-y-2">
                <Label>Days of Week</Label>
                <div className="grid grid-cols-2 gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, idx) => (
                    <label key={idx} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.recurrence_days_of_week?.includes(idx)}
                        onCheckedChange={checked => {
                          setForm(prev => ({
                            ...prev,
                            recurrence_days_of_week: checked
                              ? [...(prev.recurrence_days_of_week || []), idx]
                              : (prev.recurrence_days_of_week || []).filter(d => d !== idx)
                          }));
                        }}
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {(form.recurrence_type === 'monthly' || form.recurrence_type === 'every_x_months') && (
              <div className="space-y-2">
                <Label>Day of Month</Label>
                <Input type="number" min="1" max="31" value={form.recurrence_day_of_month} onChange={e => setForm({ ...form, recurrence_day_of_month: parseInt(e.target.value) || 1 })} />
              </div>
            )}

            {form.recurrence_type === 'every_x_months' && (
              <div className="space-y-2">
                <Label>Every X Months</Label>
                <Input type="number" min="1" value={form.recurrence_interval_months} onChange={e => setForm({ ...form, recurrence_interval_months: parseInt(e.target.value) || 1 })} />
              </div>
            )}

            <div className="space-y-2">
              <Label>Assign to Users</Label>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200">
                {users.map(u => (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
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
                {teams.map(t => (
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
    </div>
  );
}