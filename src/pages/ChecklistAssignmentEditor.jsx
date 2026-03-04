import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, Trash2, AlertCircle } from 'lucide-react';
import { toast } from "sonner";

export default function ChecklistAssignmentEditor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user, canManage } = useCurrentUser();
  const checklistId = searchParams.get('id');

  const [form, setForm] = useState({
    assigned_to_emails: [],
    assigned_to_names: [],
    assigned_teams: [],
    recurrence_type: 'once',
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: template, isLoading } = useQuery({
    queryKey: ['checklist-template', checklistId],
    queryFn: () => base44.entities.ChecklistTemplate.filter({ id: checklistId }).then(r => r?.[0]),
    enabled: !!checklistId,
    onSuccess: (data) => {
      if (data) {
        setForm({
          assigned_to_emails: data.assigned_to_emails || [],
          assigned_to_names: data.assigned_to_names || [],
          assigned_teams: data.assigned_teams || [],
          recurrence_type: data.recurrence_type || 'once',
        });
      }
    },
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => base44.entities.User.list(),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.ChecklistTemplate.update(checklistId, data),
    onSuccess: () => {
      toast.success('Assignment updated');
      queryClient.invalidateQueries({ queryKey: ['checklist-templates-all'] });
      queryClient.invalidateQueries({ queryKey: ['checklist-templates-published'] });
      navigate(-1);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.ChecklistTemplate.delete(checklistId),
    onSuccess: () => {
      toast.success('Assignment deleted');
      queryClient.invalidateQueries({ queryKey: ['checklist-templates-all'] });
      queryClient.invalidateQueries({ queryKey: ['checklist-templates-published'] });
      navigate(-1);
    },
  });

  if (!canManage) {
    return (
      <div className="max-w-2xl mx-auto mt-6">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">You don't have permission to manage assignments.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto mt-6 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="max-w-2xl mx-auto mt-6">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700">Checklist not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 text-slate-600">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Manage Assignment: {template.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select value={form.recurrence_type} onValueChange={(value) => setForm({ ...form, recurrence_type: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once">One Time Only</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekdays">Weekdays</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annually">Annually</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-900 block mb-2">Assigned Users</label>
            <div className="max-h-48 overflow-y-auto space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
              {allUsers.length === 0 ? (
                <p className="text-sm text-slate-500">No users available</p>
              ) : (
                allUsers.map(u => (
                  <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.assigned_to_emails.includes(u.email)}
                      onChange={e => {
                        if (e.target.checked) {
                          setForm({
                            ...form,
                            assigned_to_emails: [...form.assigned_to_emails, u.email],
                            assigned_to_names: [...form.assigned_to_names, u.full_name]
                          });
                        } else {
                          const idx = form.assigned_to_emails.indexOf(u.email);
                          setForm({
                            ...form,
                            assigned_to_emails: form.assigned_to_emails.filter(e => e !== u.email),
                            assigned_to_names: form.assigned_to_names.filter((_, i) => i !== idx)
                          });
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    <span className="text-sm text-slate-700">{u.full_name || u.email}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-900 block mb-2">Assigned Teams</label>
            <div className="max-h-48 overflow-y-auto space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
              {teams.length === 0 ? (
                <p className="text-sm text-slate-500">No teams available</p>
              ) : (
                teams.map(t => (
                  <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.assigned_teams.includes(t.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setForm({ ...form, assigned_teams: [...form.assigned_teams, t.id] });
                        } else {
                          setForm({ ...form, assigned_teams: form.assigned_teams.filter(id => id !== t.id) });
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    <span className="text-sm text-slate-700">{t.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-between gap-3 pt-4 border-t border-slate-200">
            <Button
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" /> Delete Assignment
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button
                onClick={() => updateMutation.mutate(form)}
                disabled={updateMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 gap-2"
              >
                {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" /> Delete Assignment
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-600">
            Are you sure you want to delete the assignment for "<strong>{template.title}</strong>"? This will remove all current and future assignments.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteMutation.mutate();
                setDeleteDialogOpen(false);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}