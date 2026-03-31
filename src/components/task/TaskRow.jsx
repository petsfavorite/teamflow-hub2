import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Calendar, Circle, PlayCircle, CheckCircle, Edit2, Loader2, Search } from 'lucide-react';
import { toast } from "sonner";

const priorityColors = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
};

export default function TaskRow({ task, onStatusChange, canEdit, user, teams = [], allowedUsers = [] }) {
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const queryClient = useQueryClient();

  const users = allowedUsers;

  const openEdit = () => {
    setForm({
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
    setEditOpen(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await base44.entities.Task.update(task.id, form);
      toast.success('Task updated');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setEditOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex gap-1.5 flex-shrink-0">
              {task.status === 'pending' && (
                <button onClick={() => onStatusChange(task, 'in_progress')} title="Start task" className="p-1 hover:bg-slate-100 rounded">
                  <Circle className="w-5 h-5 text-slate-400 hover:text-indigo-500" />
                </button>
              )}
              {task.status === 'in_progress' && (
                <button onClick={() => onStatusChange(task, 'completed')} title="Complete task" className="p-1 hover:bg-emerald-50 rounded">
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
                {task.due_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Due {task.due_date}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColors[task.priority]}`}>{task.priority}</span>
              {canEdit && (
                <button onClick={openEdit} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600" title="Edit task">
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-1">
            <div className="space-y-2"><Label>Title</Label><Input value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={form.due_date || ''} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
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
              <Label>Assign to Users</Label>
              <div className="relative mb-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="pl-7 h-8 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200" style={{ maxHeight: '108px' }}>
                {users.filter(u => (u.full_name || u.email).toLowerCase().includes(userSearch.toLowerCase())).map(u => (
                  <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={(form.assigned_to_emails || []).includes(u.email)}
                      onCheckedChange={checked => {
                        const emails = checked
                          ? [...(form.assigned_to_emails || []), u.email]
                          : (form.assigned_to_emails || []).filter(e => e !== u.email);
                        const names = checked
                          ? [...(form.assigned_to_names || []), u.full_name || u.email]
                          : (form.assigned_to_names || []).filter((_, i) => (form.assigned_to_emails || [])[i] !== u.email);
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
                      checked={(form.assigned_teams || []).includes(t.id)}
                      onCheckedChange={checked => setForm({
                        ...form,
                        assigned_teams: checked
                          ? [...(form.assigned_teams || []), t.id]
                          : (form.assigned_teams || []).filter(id => id !== t.id)
                      })}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving || !form.title} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}