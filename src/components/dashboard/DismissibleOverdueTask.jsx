import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, X, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function DismissibleOverdueTask({ task, user }) {
  const [isOpen, setIsOpen] = useState(false);
  const [newDueDate, setNewDueDate] = useState(task.due_date || '');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const queryClient = useQueryClient();

  const handleUpdateDueDate = async () => {
    if (!newDueDate || newDueDate === task.due_date) {
      setIsOpen(false);
      return;
    }

    setIsUpdating(true);
    try {
      await base44.entities.Task.update(task.id, { due_date: newDueDate });
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to update due date:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 hover:bg-red-100 transition-colors group">
      <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
      <Link to={createPageUrl('Tasks')} className="flex-1 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-900 truncate">⚠️ Task overdue: {task.title}</p>
          <p className="text-xs text-red-700">Assigned to: {task.assigned_to_names?.[0] || 'Unknown'} • Was due {task.due_date}</p>
        </div>
      </Link>

      {canEditDueDate && (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-100 flex-shrink-0"
              onClick={(e) => e.preventDefault()}
            >
              <Calendar className="w-4 h-4" />
            </Button>
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

      <button
        onClick={(e) => {
          e.preventDefault();
          onDismiss(task.id);
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-700 flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}