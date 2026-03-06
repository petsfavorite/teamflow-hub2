import React, { useState, useMemo } from 'react';
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
  const [useDialogOpen, setUseDialogOpen] = useState(false);
  const [templateToUse, setTemplateToUse] = useState(null);
  const [useForm, setUseForm] = useState({
    assigned_to_emails: [],
    assigned_teams: [],
    due_date: '',
    due_time: '21:00',
    recurrence_type: 'once'
  });

  // Only show published templates
  const { data: publishedTemplates = [], isLoading } = useQuery({
    queryKey: ['checklist-templates-published'],
    queryFn: async () => {
      const templates = await base44.entities.ChecklistTemplate.list('-created_date', 100);
      return templates.filter(t => (t.status === 'published' || t.status === 'active') && t.status !== 'closed');
    },
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

  // For regular users: show only checklists visible today and assigned to them
  const myTemplates = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return publishedTemplates.filter(t => {
      if (!canManage) {
        // Regular users: only show if due_date is today and assigned to them
        const assignedToMe = t.assigned_to_emails?.includes(user?.email);
        const inMyTeam = t.assigned_teams?.some(teamId => teams.some(team => team.id === teamId && team.member_emails?.includes(user?.email)));
        return (assignedToMe || inMyTeam) && t.due_date === today && t.is_visible !== false;
      }
      return true; // Managers/admins see all published templates
    });
  }, [publishedTemplates, user, teams, canManage]);

  const submitMutation = useMutation({
    mutationFn: async (data) => {
      const completion = await base44.entities.ChecklistCompletion.create(data);
      // Close the template after submission
      const template = allTemplates.find(t => t.id === data.checklist_template_id);
      if (template && template.status === 'published') {
        await base44.entities.ChecklistTemplate.update(template.id, { status: 'closed' });
      }
      return completion;
    },
    onSuccess: () => {
      toast.success('Checklist submitted!');
      setActiveChecklist(null);
      setItems([]);
      setNotes({});
      queryClient.invalidateQueries({ queryKey: ['completions'] });
      queryClient.invalidateQueries({ queryKey: ['checklist-templates-published'] });
      queryClient.invalidateQueries({ queryKey: ['checklist-templates-all'] });
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

  const assignChecklistMutation = useMutation({
    mutationFn: (data) => base44.entities.ChecklistTemplate.update(templateToUse.id, data),
    onSuccess: () => {
      toast.success('Checklist assigned!');
      setUseDialogOpen(false);
      setTemplateToUse(null);
      setUseForm({
        assigned_to_emails: [],
        assigned_teams: [],
        due_date: '',
        due_time: '21:00',
        recurrence_type: 'once'
      });
      queryClient.invalidateQueries({ queryKey: ['checklist-templates-all'] });
      queryClient.invalidateQueries({ queryKey: ['checklist-templates-published'] });
    },
  });

  const startChecklist = async (template) => {
    // Load existing in-progress completion if it exists
    const existingCompletions = await base44.entities.ChecklistCompletion.filter({ 
      checklist_template_id: template.id, 
      status: 'in_progress' 
    });
    
    const existingCompletion = existingCompletions?.[0];
    
    if (existingCompletion && existingCompletion.completed_items?.length > 0) {
      // Load from existing progress
      setItems(existingCompletion.completed_items);
      const notesMap = {};
      existingCompletion.completed_items.forEach((item, idx) => {
        if (item.notes) notesMap[idx] = item.notes;
      });
      setNotes(notesMap);
    } else {
      // Start fresh
      setItems(template.items.map(item => ({ ...item, checked: false })));
      setNotes({});
    }
    
    setActiveChecklist({ ...template, completionId: existingCompletion?.id });
    setCanSubmitWithIncomplete(!template.due_date && !template.due_time);
  };

  const updateItem = async (index, updates) => {
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
      saveChecklistProgress(updated);
      return updated;
    });
  };

  const updateNotes = async (index, value) => {
    setNotes(prev => {
      const updated = { ...prev, [index]: value };
      const itemsWithNotes = items.map((item, i) => ({
        ...item,
        notes: updated[i] || ''
      }));
      saveChecklistProgress(itemsWithNotes);
      return updated;
    });
  };

  const saveChecklistProgress = async (currentItems) => {
    if (!activeChecklist) return;
    
    try {
      if (activeChecklist.completionId) {
        await base44.entities.ChecklistCompletion.update(activeChecklist.completionId, {
          completed_items: currentItems,
          status: 'in_progress'
        });
      } else {
        const completion = await base44.entities.ChecklistCompletion.create({
          checklist_template_id: activeChecklist.id,
          checklist_title: activeChecklist.title,
          completed_by: user?.email,
          completed_by_name: user?.full_name,
          completed_items: currentItems,
          completion_date: new Date().toISOString().split('T')[0],
          status: 'in_progress'
        });
        setActiveChecklist(prev => ({ ...prev, completionId: completion.id }));
      }
    } catch (error) {
      console.error('Error saving checklist progress:', error);
    }
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
        await base44.functions.invoke('finalizeChecklistAssignment', {
          checklist_template_id: activeChecklist.id,
          checklist_completion_id: data.id
        }).catch(() => {});
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
              <div className="flex gap-2 justify-end">
                {canManage && (
                   <Button
                     onClick={async () => {
                       const completion = await base44.entities.ChecklistCompletion.create({
                         checklist_template_id: activeChecklist.id,
                         checklist_title: activeChecklist.title,
                         completed_by: user.email,
                         completed_by_name: user.full_name,
                         completed_items: items,
                         completion_date: new Date().toISOString().split('T')[0],
                         status: 'edited'
                       });
                       await base44.functions.invoke('finalizeChecklistAssignment', {
                         checklist_template_id: activeChecklist.id,
                         checklist_completion_id: completion.id
                       }).catch(() => {});
                       toast.success('Checklist stopped and moved to history');
                       setActiveChecklist(null);
                       setItems([]);
                       setNotes({});
                       queryClient.invalidateQueries({ queryKey: ['checklist-templates-published'] });
                       queryClient.invalidateQueries({ queryKey: ['checklist-completions'] });
                       queryClient.invalidateQueries({ queryKey: ['checklist-templates-all'] });
                     }}
                     variant="outline"
                     className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                   >
                     Stop
                   </Button>
                )}
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
        description={canManage ? "Manage and assign checklists" : "Complete your assigned checklists"}
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
          title={canManage ? "No checklists to assign" : "No checklists assigned"}
          description={canManage ? "Create a checklist and use the 'Use' button to assign it" : "You don't have any checklists assigned for today"}
        />
      ) : (
        <div>
          {canManage && <h2 className="text-lg font-semibold text-slate-900 mb-4">Assign Checklists</h2>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myTemplates.map(template => (
              <Card key={template.id} className="border-0 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <CheckSquare className="w-5 h-5 text-emerald-600" />
                    </div>
                    {canManage && template.due_date && (
                      <StatusBadge status={template.recurrence_type} />
                    )}
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-1">{template.title}</h3>
                  {template.description && <p className="text-sm text-slate-500 mb-3">{template.description}</p>}
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
                    <Clock className="w-3 h-3" />
                    {template.items?.length || 0} items
                  </div>

                  {canManage ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-blue-600 hover:bg-blue-700"
                        onClick={() => {
                          setTemplateToUse(template);
                          setUseForm({
                            assigned_to_emails: template.assigned_to_emails || [],
                            assigned_teams: template.assigned_teams || [],
                            due_date: template.due_date || '',
                            due_time: template.due_time || '21:00',
                            recurrence_type: template.recurrence_type || 'once'
                          });
                          setUseDialogOpen(true);
                        }}
                      >
                        Use
                      </Button>
                      <Link to={createPageUrl('ChecklistEditor') + `?id=${template.id}`}>
                        <Button variant="outline" size="sm">Edit</Button>
                      </Link>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => startChecklist(template)}
                    >
                      Start
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {canManage && allTemplates.length > publishedTemplates.length && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Draft Templates</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allTemplates.filter(t => t.status === 'draft' || t.status === 'pending_approval').map(t => (
              <Card key={t.id} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm text-slate-800">{t.title}</p>
                      <p className="text-xs text-slate-400">{t.items?.length} items · {t.status}</p>
                    </div>
                    <div className="flex gap-1">
                      <Link to={createPageUrl('ChecklistEditor') + `?id=${t.id}`}>
                        <Button variant="ghost" size="sm" className="text-slate-600 hover:text-slate-700 hover:bg-slate-50">Edit</Button>
                      </Link>
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

      {/* Use Dialog */}
      <Dialog open={useDialogOpen} onOpenChange={setUseDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Use "{templateToUse?.title}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Assign Users */}
            <div>
              <label className="text-sm font-medium text-slate-900 block mb-2">Assign to Users</label>
              <div className="max-h-32 overflow-y-auto space-y-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                {allUsers.map(u => (
                  <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useForm.assigned_to_emails.includes(u.email)}
                      onChange={e => {
                        if (e.target.checked) {
                          setUseForm({
                            ...useForm,
                            assigned_to_emails: [...useForm.assigned_to_emails, u.email],
                            assigned_to_names: [...(useForm.assigned_to_names || []), u.full_name]
                          });
                        } else {
                          const idx = useForm.assigned_to_emails.indexOf(u.email);
                          setUseForm({
                            ...useForm,
                            assigned_to_emails: useForm.assigned_to_emails.filter(e => e !== u.email),
                            assigned_to_names: (useForm.assigned_to_names || []).filter((_, i) => i !== idx)
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

            {/* Assign Teams */}
            <div>
              <label className="text-sm font-medium text-slate-900 block mb-2">Assign to Teams</label>
              <div className="max-h-32 overflow-y-auto space-y-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                {teams.map(t => (
                  <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useForm.assigned_teams.includes(t.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setUseForm({ ...useForm, assigned_teams: [...useForm.assigned_teams, t.id] });
                        } else {
                          setUseForm({ ...useForm, assigned_teams: useForm.assigned_teams.filter(id => id !== t.id) });
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    <span className="text-sm text-slate-700">{t.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <Label>Due Date (optional)</Label>
              <Input
                type="date"
                value={useForm.due_date}
                onChange={(e) => setUseForm({ ...useForm, due_date: e.target.value })}
              />
            </div>

            {/* Due Time */}
            <div className="space-y-2">
              <Label>Due Time (defaults to 9:00 PM if not set)</Label>
              <Input
                type="time"
                value={useForm.due_time}
                onChange={(e) => setUseForm({ ...useForm, due_time: e.target.value })}
              />
            </div>

            {/* Recurrence */}
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={useForm.recurrence_type} onValueChange={(value) => setUseForm({ ...useForm, recurrence_type: value })}>
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUseDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => {
                assignChecklistMutation.mutate({
                  assigned_to_emails: useForm.assigned_to_emails,
                  assigned_to_names: useForm.assigned_to_names || [],
                  assigned_teams: useForm.assigned_teams,
                  due_date: useForm.due_date || undefined,
                  due_time: useForm.due_time || '21:00',
                  recurrence_type: useForm.recurrence_type,
                  status: 'active'
                });
              }}
              disabled={assignChecklistMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
            >
              {assignChecklistMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Checklist Template</DialogTitle>
          </DialogHeader>
          <p className="text-slate-600">
            Are you sure you want to delete "<strong>{templateToDelete?.title}</strong>"? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
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
    </div>
  );
}