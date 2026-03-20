import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Users, Calendar, Circle, PlayCircle, CheckCircle, Edit2 } from 'lucide-react';
import { toast } from "sonner";

const priorityColors = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
};

export default function TaskRow({ task, onStatusChange, canEditDueDate, user, teams }) {
  const [isOpen, setIsOpen] = useState(false);
  const [newDueDate, setNewDueDate] = useState(task.due_date || '');
  const [isUpdating, setIsUpdating] = useState(false);
  const queryClient = useQueryClient();

  const handleUpdateDueDate = async () => {
    if (!newDueDate || newDueDate === task.due_date) {
      setIsOpen(false);
      return;
    }

    setIsUpdating(true);
    try {
      await base44.entities.Task.update(task.id, { due_date: newDueDate });
      toast.success('Due date updated');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to update due date:', error);
      toast.error('Failed to update due date');
    } finally {
      setIsUpdating(false);
    }
  };

  // Determine if can edit this task's due date
  const assignedToMe = task.assigned_to_emails?.includes(user?.email);
  const canEdit = canEditDueDate && !(task.assigned_to_emails?.length === 1 && assignedToMe);

  return (
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
                 <div className="flex items-center gap-1">
                   <Calendar className="w-3 h-3" />
                   <span>Due {task.due_date}</span>
                   {canEdit && (
                     <Dialog open={isOpen} onOpenChange={setIsOpen}>
                       <DialogTrigger asChild>
                         <button className="ml-1 p-0.5 hover:bg-slate-200 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                           <Edit2 className="w-3 h-3 text-slate-500 hover:text-slate-700" />
                         </button>
                       </DialogTrigger>
                       <DialogContent>
                         <DialogHeader>
                           <DialogTitle>Update Due Date</DialogTitle>
                         </DialogHeader>
                         <div className="space-y-4">
                           <div>
                             <Label htmlFor="due-date">New Due Date</Label>
                             <Input
                               id="due-date"
                               type="date"
                               value={newDueDate}
                               onChange={(e) => setNewDueDate(e.target.value)}
                               min={new Date().toISOString().split('T')[0]}
                             />
                           </div>
                           <div className="flex gap-2 justify-end">
                             <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                             <Button onClick={handleUpdateDueDate} disabled={isUpdating}>
                               {isUpdating ? 'Updating...' : 'Update'}
                             </Button>
                           </div>
                         </div>
                       </DialogContent>
                     </Dialog>
                   )}
                 </div>
               )}
             </div>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${priorityColors[task.priority]}`}>{task.priority}</span>
        </div>
      </CardContent>
    </Card>
  );
}