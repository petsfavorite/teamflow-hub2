import React, { useState } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ClipboardList, Plus, Calendar, User, CheckCircle, Loader2, Circle, PlayCircle } from 'lucide-react';
import { toast } from "sonner";

const priorityColors = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

const emptyForm = { title: '', description: '', assigned_to_email: '', assigned_to_name: '', due_date: '', priority: 'medium' };

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

  const myTasks = tasks.filter(t => t.assigned_to_email === user?.email && t.status !== 'completed' && t.status !== 'cancelled');
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
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{task.assigned_to_name || task.assigned_to_email || 'Unassigned'}</span>
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
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Task</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Task Title</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="What needs to be done?" /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Assign To</Label>
                <Select value={form.assigned_to_email} onValueChange={v => {
                  const u = users.find(u => u.email === v);
                  setForm({ ...form, assigned_to_email: v, assigned_to_name: u?.full_name || '' });
                }}>
                  <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
                  <SelectContent>
                    {users.map(u => <SelectItem key={u.id} value={u.email}>{u.full_name || u.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate({ ...form, created_by_name: user?.full_name })} disabled={createMutation.isPending || !form.title} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}