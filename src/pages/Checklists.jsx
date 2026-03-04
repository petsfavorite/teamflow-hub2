import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import PageHeader from '../components/shared/PageHeader';
import EmptyState from '../components/shared/EmptyState';
import StatusBadge from '../components/shared/StatusBadge';
import ChecklistItemRow from '../components/checklist/ChecklistItemRow';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckSquare, Plus, Send, Loader2, Clock, Trash2, Share2, X, AlertCircle, Edit2 } from 'lucide-react';
import { toast } from "sonner";

export default function Checklists() {
  const { user, isSuperAdmin, isAdmin, isManager, canManage } = useCurrentUser();
  const queryClient = useQueryClient();
  const [activeChecklist, setActiveChecklist] = useState(null);
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState({});
  const [canSubmitWithIncomplete, setCanSubmitWithIncomplete] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [templateToAssign, setTemplateToAssign] = useState(null);
  const [assignForm, setAssignForm] = useState({ emails: [], teams: [] });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [templateToEdit, setTemplateToEdit] = useState(null);
  const [editForm, setEditForm] = useState({ recurrence_type: 'once', auto_close_time: '17:00', assigned_to_emails: [], assigned_teams: [] });

  const { data: publishedTemplates = [], isLoading } = useQuery({
    queryKey: ['checklist-templates-published'],
    queryFn: () => base44.entities.ChecklistTemplate.filter({ status: ['published', 'active'] }, '-created_date', 100),
  });

  const { data: allTemplates = [] } = useQuery({
    queryKey: ['checklist-templates-all'],
    queryFn: () => base44.entities.ChecklistTemplate.list('-created_date', 100),
    enabled: canManage,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
    enabled: canManage,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => base44.entities.User.list(),
    enabled: canManage,
  });

  const myTeamIds = new Set(
    canManage 
      ? teams.filter(t => t.member_emails?.includes(user?.email)).map(t => t.id)
      : []
  );

  const myTemplates = publishedTemplates.filter(t => {
    const assignedToMe = t.assigned_to_emails?.includes(user?.email);
    const inMyTeam = t.assigned_teams?.some(teamId => myTeamIds.has(teamId));
    return assignedToMe || inMyTeam;
  });

  const submitMutation = useMutation({
    mutationFn: (data) => base44.entities.ChecklistCompletion.create(data),
    onSuccess: () => {
      toast.success('Checklist submitted!');
      setActiveChecklist(null);
      setItems([]);
      setNotes({});
      queryClient.invalidateQueries({ queryKey: ['completions'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ChecklistTemplate.delete(id),
    onSuccess: () => {
      toast.success('Checklist deleted!');
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['checklist-templates-all'] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: (data) => base44.entities.ChecklistTemplate.update(templateToAssign.id, data),
    onSuccess: () => {
      toast.success('Checklist assigned!');
      setAssignDialogOpen(false);
      setTemplateToAssign(null);
      setAssignForm({ emails: [], teams: [] });
      queryClient.invalidateQueries({ queryKey: ['checklist-templates-all'] });
      queryClient.invalidateQueries({ queryKey: ['checklist-templates-published'] });
    },
  });

  const editTemplateMutation = useMutation({
    mutationFn: (data) => base44.entities.ChecklistTemplate.update(templateToEdit.id, data),
    onSuccess: () => {
      toast.success('Checklist updated!');
      setEditDialogOpen(false);
      setTemplateToEdit(null);
      queryClient.invalidateQueries({ queryKey: ['checklist-templates-all'] });
      queryClient.invalidateQueries({ queryKey: ['checklist-templates-published'] });
    },
  });

  const closeChecklistMutation = useMutation({
    mutationFn: (id) => base44.entities.ChecklistTemplate.update(id, { status: 'closed' }),
    onSuccess: () => {
      toast.success('Checklist closed');
      queryClient.invalidateQueries({ queryKey: ['checklist-templates-published'] });
      queryClient.invalidateQueries({ queryKey: ['checklist-templates-all'] });
    },
  });

  const startChecklist = (template) => {
    setActiveChecklist(template);
    setItems(template.items.map(item => ({ ...item, checked: false })));
    setNotes({});
    setCanSubmitWithIncomplete(!template.auto_close_datetime && !template.auto_close_time);
  };

  const updateItem = (index, updates) => {
    setItems(prev => {
      const updated = prev.map((item, i) => {
        if (i === index) {
          const isChecking = updates.checked !== undefined ? updates.checked : item.checked;
          const wasChecked = item.checked;
          
          return {
            ...item,
            ...updates,
            checked: isChecking,
            checked_at: isChecking && !wasChecked ? new Date().toISOString() : item.checked_at,
            checked_by_email: isChecking && !wasChecked ? user?.email : item.checked_by_email,
            checked_by_name: isChecking && !wasChecked ? user?.full_name : item.checked_by_name,
          };
        }
        return item;
      });
      return updated;
    });
  };

  const updateNotes = (index, value) => {
    setNotes(prev => ({ ...prev, [index]: value }));
  };

  const submitChecklist = async () => {
    const completedItems = items.map((item, i) => ({
      ...item,
      notes: notes[i] || '',
      photo_url: item.photo_url || ''
    }));

    const completion = {
      checklist_template_id: activeChecklist.id,
      checklist_title: activeChecklist.title,
      completed_by: user?.email,
      completed_by_name: user?.full_name,
      completed_items: completedItems,
      completion_date: new Date().toISOString().split('T')[0],
      status: 'completed',
    };

    submitMutation.mutate(completion, {
      onSuccess: async (data) => {
        // Generate notifications for incomplete items
        await base44.functions.invoke('generateChecklistNotifications', {
          checklist_completion_id: data.id
        }).catch(() => {
          // Silently fail if notification generation fails
        });
      }
    });
  };

  if (activeChecklist) {
    const allChecked = items.every(i => i.checked);
    return (
      <div className="max-w-2xl mx-auto">
        <Button variant="ghost" onClick={() => setActiveChecklist(null)} className="mb-4 text-slate-600">
          ← Back to Checklists
        </Button>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-1">{activeChecklist.title}</h2>
            {activeChecklist.description && <p className="text-sm text-slate-500 mb-6">{activeChecklist.description}</p>}

            <div className="space-y-3">
              {items.map((item, i) => (
                <ChecklistItemRow
                  key={i}
                  item={item}
                  index={i}
                  notes={notes}
                  onNotesChange={updateNotes}
                  onItemUpdate={updateItem}
                />
              ))}
            </div>

            <div className="mt-6 space-y-3">
              {!allChecked && !canSubmitWithIncomplete && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700">All items must be checked before submitting this checklist.</p>
                </div>
              )}
              <div className="flex justify-end">
                <Button
                  onClick={submitChecklist}
                  disabled={(canSubmitWithIncomplete ? false : !allChecked) || submitMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                >
                  {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Submit Checklist
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Checklists"
        description="Complete your assigned checklists"
        actions={
          (isSuperAdmin || isAdmin) && (
            <Link to={createPageUrl('ChecklistEditor')}>
              <Button className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                <Plus className="w-4 h-4" /> New Checklist
              </Button>
            </Link>
          )
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <Card key={i} className="border-0 shadow-sm animate-pulse">
              <CardContent className="p-6"><div className="h-20 bg-slate-100 rounded" /></CardContent>
            </Card>
          ))}
        </div>
      ) : myTemplates.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No checklists assigned"
          description="You don't have any active checklists right now"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {myTemplates.map(template => (
            <Card key={template.id} className="border-0 shadow-sm hover:shadow-lg transition-all cursor-pointer" onClick={() => startChecklist(template)}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <CheckSquare className="w-5 h-5 text-emerald-600" />
                  </div>
                  <StatusBadge status={template.frequency} />
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">{template.title}</h3>
                {template.description && <p className="text-sm text-slate-500 mb-3">{template.description}</p>}
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Clock className="w-3 h-3" />
                  {template.items?.length || 0} items
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canManage && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">All Checklist Templates</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allTemplates.map(t => (
              <Card key={t.id} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm text-slate-800">{t.title}</p>
                          <p className="text-xs text-slate-400">{t.items?.length} items · {t.recurrence_type} · Closes at {t.auto_close_time || '17:00'}</p>
                        </div>
                        <div className="flex gap-1">
                           {canManage && (
                             <>
                               <Button
                                 variant="ghost"
                                 size="sm"
                                 className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-1"
                                 onClick={() => {
                                   setTemplateToEdit(t);
                                   setEditForm({
                                     recurrence_type: t.recurrence_type || 'once',
                                     auto_close_time: t.auto_close_time || '17:00',
                                     assigned_to_emails: t.assigned_to_emails || [],
                                     assigned_to_names: t.assigned_to_names || [],
                                     assigned_teams: t.assigned_teams || []
                                   });
                                   setEditDialogOpen(true);
                                 }}
                               >
                                 <Edit2 className="w-4 h-4" /> Open
                               </Button>
                               <Link to={createPageUrl('ChecklistEditor') + `?id=${t.id}`}>
                                 <Button variant="ghost" size="sm">Edit</Button>
                               </Link>
                             </>
                           )}
                          {(canManage) && t.status === 'published' && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                              onClick={() => {
                                closeChecklistMutation.mutate(t.id);
                              }}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                          {(isSuperAdmin || isAdmin) && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => {
                                setTemplateToDelete(t);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                          </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          </div>
          )}

          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Checklist Template</DialogTitle>
          </DialogHeader>
          <p className="text-slate-600">
            Are you sure you want to delete "<strong>{templateToDelete?.title}</strong>"? This action cannot be undone. Checklist history will be preserved.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteMutation.mutate(templateToDelete.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </DialogFooter>
          </DialogContent>
          </Dialog>

          <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign "{templateToAssign?.title}" to Users & Teams</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-900 block mb-2">Users</label>
              <div className="max-h-40 overflow-y-auto space-y-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                {allUsers.map(u => (
                  <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignForm.emails.includes(u.email)}
                      onChange={e => {
                        if (e.target.checked) {
                          setAssignForm({ ...assignForm, emails: [...assignForm.emails, u.email] });
                        } else {
                          setAssignForm({ ...assignForm, emails: assignForm.emails.filter(e => e !== u.email) });
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    <span className="text-sm text-slate-700">{u.full_name || u.email}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-900 block mb-2">Teams</label>
              <div className="max-h-40 overflow-y-auto space-y-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                {teams.map(t => (
                  <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignForm.teams.includes(t.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setAssignForm({ ...assignForm, teams: [...assignForm.teams, t.id] });
                        } else {
                          setAssignForm({ ...assignForm, teams: assignForm.teams.filter(id => id !== t.id) });
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    <span className="text-sm text-slate-700">{t.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              assignMutation.mutate({
                assigned_to_emails: assignForm.emails,
                assigned_to_names: assignForm.emails.map(e => allUsers.find(u => u.email === e)?.full_name || e),
                assigned_teams: assignForm.teams
              });
            }} disabled={assignMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              {assignMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Assign
            </Button>
          </DialogFooter>
          </DialogContent>
          </Dialog>

          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Open "{templateToEdit?.title}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Recurrence</Label>
              <Select value={editForm.recurrence_type} onValueChange={(value) => setEditForm({ ...editForm, recurrence_type: value })}>
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
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Auto-Close Time</Label>
              <Input
                type="time"
                value={editForm.auto_close_time}
                onChange={(e) => setEditForm({ ...editForm, auto_close_time: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-900 block mb-2">Assign to Users</label>
              <div className="max-h-40 overflow-y-auto space-y-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                {allUsers.map(u => (
                  <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.assigned_to_emails.includes(u.email)}
                      onChange={e => {
                        if (e.target.checked) {
                          setEditForm({ 
                            ...editForm, 
                            assigned_to_emails: [...editForm.assigned_to_emails, u.email],
                            assigned_to_names: [...(editForm.assigned_to_names || []), u.full_name]
                          });
                        } else {
                          const idx = editForm.assigned_to_emails.indexOf(u.email);
                          setEditForm({ 
                            ...editForm, 
                            assigned_to_emails: editForm.assigned_to_emails.filter(e => e !== u.email),
                            assigned_to_names: editForm.assigned_to_names.filter((_, i) => i !== idx)
                          });
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    <span className="text-sm text-slate-700">{u.full_name || u.email}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-900 block mb-2">Assign to Teams</label>
              <div className="max-h-40 overflow-y-auto space-y-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                {teams.map(t => (
                  <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.assigned_teams.includes(t.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setEditForm({ ...editForm, assigned_teams: [...editForm.assigned_teams, t.id] });
                        } else {
                          setEditForm({ ...editForm, assigned_teams: editForm.assigned_teams.filter(id => id !== t.id) });
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    <span className="text-sm text-slate-700">{t.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              editTemplateMutation.mutate({
                recurrence_type: editForm.recurrence_type,
                auto_close_time: editForm.auto_close_time,
                assigned_to_emails: editForm.assigned_to_emails,
                assigned_to_names: editForm.assigned_to_names,
                assigned_teams: editForm.assigned_teams
              });
            }} disabled={editTemplateMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              {editTemplateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
          </DialogContent>
          </Dialog>
          </div>
          );
          }