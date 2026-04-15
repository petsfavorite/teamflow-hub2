import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import PageHeader from '../components/shared/PageHeader';
import EmptyState from '../components/shared/EmptyState';
import StatusBadge from '../components/shared/StatusBadge';
import ChecklistItemRow from '../components/checklist/ChecklistItemRow';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckSquare, Plus, Trash2, AlertCircle, Loader2, Clock, Search } from 'lucide-react';

import { toast } from "sonner";

export default function Checklists() {
  const { user, loading: userLoading, canManage, isSuperAdmin, isAdmin, isManager } = useCurrentUser();
  const [activeChecklist, setActiveChecklist] = useState(null);
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState({});
  const [canSubmitWithIncomplete, setCanSubmitWithIncomplete] = useState(false);
  const [useDialogOpen, setUseDialogOpen] = useState(false);
  const [templateToUse, setTemplateToUse] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [assignUserSearch, setAssignUserSearch] = useState('');
  const [useForm, setUseForm] = useState({
    assigned_to_emails: [],
    assigned_to_names: [],
    assigned_teams: [],
    due_date: '',
    due_time: '21:00',
    recurrence_type: 'once',
    recurrence_days_of_week: [],
    recurrence_day_of_month: undefined,
    recurrence_interval_months: undefined
  });
  const queryClient = useQueryClient();

  const { data: allTemplates = [], isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['checklist-templates-all'],
    queryFn: () => base44.entities.ChecklistTemplate.list('title', 200),
  });

  const { data: recurringSchedules = [], isLoading: isLoadingRecurring } = useQuery({
    queryKey: ['recurring-checklists'],
    queryFn: () => base44.entities.RecurringChecklist.list('template_title', 200),
    enabled: canManage,
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['checklist-completions'],
    queryFn: () => base44.entities.ChecklistCompletion.list(),
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams-list'],
    queryFn: () => base44.entities.Team.list('name', 200),
  });

  const { data: allUsersRaw = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => {
      const res = await base44.functions.invoke('listUsers', {});
      return res.data?.users || [];
    },
    enabled: canManage,
  });

  // Admins/super_admins see all users; managers see only teammates
  const allUsers = useMemo(() => {
    if (!userLoading && isManager && !isAdmin && !isSuperAdmin) {
      const myTeamEmails = new Set(
        teams
          .filter(t => t.member_emails?.includes(user?.email))
          .flatMap(t => t.member_emails || [])
      );
      return allUsersRaw.filter(u => myTeamEmails.has(u.email));
    }
    return allUsersRaw;
  }, [allUsersRaw, userLoading, isManager, isAdmin, isSuperAdmin, teams, user]);

  const myTeamIds = useMemo(() => {
    return teams
      .filter(team => team.member_emails?.includes(user?.email))
      .map(team => team.id);
  }, [teams, user]);

  // "My Checklists" - checklists assigned to user or their teams (active status)
  const myChecklists = useMemo(() => {
    return allTemplates.filter(t => {
      if (t.status !== 'active') return false;
      const assignedToMe = t.assigned_to_emails?.includes(user?.email);
      const assignedToMyTeam = t.assigned_teams?.some(teamId => teams.some(team => team.id === teamId && team.member_emails?.includes(user?.email)));
      return assignedToMe || assignedToMyTeam;
    });
  }, [allTemplates, user, teams]);

  // Template checklists - pure templates: no assignments and not archived
  const templateChecklists = useMemo(() => {
    return allTemplates.filter(t =>
      t.status !== 'archived' &&
      (!t.assigned_to_emails || t.assigned_to_emails.length === 0) &&
      (!t.assigned_teams || t.assigned_teams.length === 0)
    );
  }, [allTemplates]);

  // Recurring checklists - from the dedicated RecurringChecklist entity (completely separate from My Checklists)
  const recurringChecklists = useMemo(() => {
    return recurringSchedules.filter(r => r.is_active !== false);
  }, [recurringSchedules]);

  const recurrenceLabel = (r) => {
    switch (r.recurrence_type) {
      case 'daily': return 'Repeats daily';
      case 'weekdays': return 'Repeats weekdays';
      case 'specific_days': {
        const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const days = (r.recurrence_days_of_week || []).map(d => dayNames[d]).join(', ');
        return `Repeats on ${days || '—'}`;
      }
      case 'monthly': return `Repeats monthly on day ${r.recurrence_day_of_month || '—'}`;
      case 'every_x_months': return `Repeats every ${r.recurrence_interval_months || '?'} months`;
      case 'annually': return 'Repeats annually';
      default: return r.recurrence_type;
    }
  };

  // Draft templates - only visible to creator
  const draftTemplates = useMemo(() => {
    return allTemplates.filter(t => (t.status === 'draft' || t.status === 'pending_approval') && t.created_by === user?.email);
  }, [allTemplates, user]);

  const isLoading = isLoadingTemplates || isLoadingRecurring;

  const submitMutation = useMutation({
    mutationFn: async (data) => {
      const completion = await base44.entities.ChecklistCompletion.create(data);
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

  // Track whether the dialog was opened from a pure template (Assign) or an existing assigned record (Edit)
  const [isAssigningFromTemplate, setIsAssigningFromTemplate] = useState(false);

  const assignChecklistMutation = useMutation({
    mutationFn: async (data) => {
      if (isAssigningFromTemplate) {
        // 1. Always create a new active ChecklistTemplate instance (appears in "My Checklists")
        //    only if frequency is 'once' or the user wants an immediate instance
        await base44.entities.ChecklistTemplate.create({
          title: templateToUse.title,
          description: templateToUse.description,
          category: templateToUse.category,
          items: templateToUse.items,
          assigned_to_emails: data.assigned_to_emails,
          assigned_to_names: data.assigned_to_names,
          assigned_teams: data.assigned_teams,
          due_date: data.due_date,
          due_time: data.due_time || '21:00',
          recurrence_type: data.recurrence_type,
          recurrence_days_of_week: data.recurrence_days_of_week,
          recurrence_day_of_month: data.recurrence_day_of_month,
          recurrence_interval_months: data.recurrence_interval_months,
          status: 'active',
        });

        // 2. If recurring, also create a RecurringChecklist schedule record (completely separate)
        if (data.recurrence_type && data.recurrence_type !== 'once' && data.recurrence_type !== 'manual') {
          await base44.entities.RecurringChecklist.create({
            template_title: templateToUse.title,
            template_description: templateToUse.description,
            template_category: templateToUse.category,
            template_items: templateToUse.items,
            assigned_to_emails: data.assigned_to_emails,
            assigned_to_names: data.assigned_to_names,
            assigned_teams: data.assigned_teams,
            due_time: data.due_time || '21:00',
            recurrence_type: data.recurrence_type,
            recurrence_days_of_week: data.recurrence_days_of_week,
            recurrence_day_of_month: data.recurrence_day_of_month,
            recurrence_interval_months: data.recurrence_interval_months,
            is_active: true,
          });
        }
      } else {
        // Editing an existing RecurringChecklist schedule — only updates the schedule, never touches active instances
        await base44.entities.RecurringChecklist.update(templateToUse.id, {
          assigned_to_emails: data.assigned_to_emails,
          assigned_to_names: data.assigned_to_names,
          assigned_teams: data.assigned_teams,
          due_time: data.due_time || '21:00',
          recurrence_type: data.recurrence_type,
          recurrence_days_of_week: data.recurrence_days_of_week,
          recurrence_day_of_month: data.recurrence_day_of_month,
          recurrence_interval_months: data.recurrence_interval_months,
          is_active: true,
        });
      }
    },
    onSuccess: () => {
      toast.success(isAssigningFromTemplate ? 'Checklist assigned!' : 'Recurring schedule updated!');
      setUseDialogOpen(false);
      setTemplateToUse(null);
      setUseForm({
        assigned_to_emails: [],
        assigned_to_names: [],
        assigned_teams: [],
        due_date: '',
        due_time: '21:00',
        recurrence_type: 'once'
      });
      queryClient.invalidateQueries({ queryKey: ['checklist-templates-all'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-checklists'] });
    },
  });

  const startChecklist = async (template) => {
    const existingCompletions = await base44.entities.ChecklistCompletion.filter({ 
      checklist_template_id: template.id, 
      status: 'in_progress' 
    });
    
    const existingCompletion = existingCompletions?.[0];
    
    if (existingCompletion && existingCompletion.completed_items?.length > 0) {
      setItems(existingCompletion.completed_items);
      const notesMap = {};
      existingCompletion.completed_items.forEach((item, idx) => {
        if (item.notes) notesMap[idx] = item.notes;
      });
      setNotes(notesMap);
    } else {
      setItems(template.items.map(item => ({ ...item, checked: false })));
      setNotes({});
    }
    
    setActiveChecklist({ ...template, completionId: existingCompletion?.id });
    setCanSubmitWithIncomplete(!template.due_date && !template.due_time);
    autoSubmitFiredRef.current = false;
  };

  // Called from Template Checklists — always creates a new record
  const handleAssignClick = (template) => {
    setTemplateToUse(template);
    setIsAssigningFromTemplate(true);
    setUseForm({
      assigned_to_emails: [],
      assigned_to_names: [],
      assigned_teams: [],
      due_date: '',
      due_time: '21:00',
      recurrence_type: 'once',
      recurrence_days_of_week: [],
      recurrence_day_of_month: undefined,
      recurrence_interval_months: undefined
    });
    setUseDialogOpen(true);
  };

  // Called from Actively Recurring Checklists — updates the RecurringChecklist schedule only
  const handleEditRecurring = (record) => {
    setTemplateToUse(record);
    setIsAssigningFromTemplate(false);
    setUseForm({
      assigned_to_emails: record.assigned_to_emails || [],
      assigned_to_names: record.assigned_to_names || [],
      assigned_teams: record.assigned_teams || [],
      due_date: '',
      due_time: record.due_time || '21:00',
      recurrence_type: record.recurrence_type || 'daily',
      recurrence_days_of_week: record.recurrence_days_of_week || [],
      recurrence_day_of_month: record.recurrence_day_of_month || undefined,
      recurrence_interval_months: record.recurrence_interval_months || undefined
    });
    setUseDialogOpen(true);
  };

  const deleteRecurring = (record) => {
    base44.entities.RecurringChecklist.delete(record.id).then(() => {
      toast.success('Recurring schedule removed — existing assigned checklists are unchanged');
      queryClient.invalidateQueries({ queryKey: ['recurring-checklists'] });
    });
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

  // Auto-submit when all items are checked
  const autoSubmitFiredRef = useRef(false);
  useEffect(() => {
    if (!activeChecklist || items.length === 0) return;
    if (items.every(i => i.checked) && !autoSubmitFiredRef.current && !submitMutation.isPending) {
      autoSubmitFiredRef.current = true;
      submitChecklist();
    }
  }, [items, activeChecklist]);

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
                  canUndo={canManage}
                />
              ))}
            </div>

            <div className="mt-6 space-y-3">
              {submitMutation.isPending && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                  <p className="text-sm text-emerald-700">Submitting checklist...</p>
                </div>
              )}
              {!allChecked && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700">Checklist will auto-submit once all items are checked off.</p>
                </div>
              )}
              {canManage && (
                <div className="flex justify-end">
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
                </div>
              )}
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
      ) : (
        <div className="space-y-8">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search checklists..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* My Checklists - visible to all users */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">My Checklists</h2>
            {myChecklists.filter(t => t.title.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 ? (
              <EmptyState
                icon={CheckSquare}
                title="No checklists assigned"
                description="You don't have any checklists assigned"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {myChecklists.filter(t => t.title.toLowerCase().includes(searchTerm.toLowerCase())).map(template => (
                  <Card
                    key={template.id}
                    className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => startChecklist(template)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                          <CheckSquare className="w-5 h-5 text-emerald-600" />
                        </div>
                        {template.due_date && <StatusBadge status={template.recurrence_type} />}
                      </div>
                      <h3 className="font-semibold text-slate-900 mb-2">{template.title}</h3>
                      {template.due_date && (
                        <div className="text-sm text-emerald-700 font-medium mb-2">
                          Due {template.due_date} at {template.due_time || '21:00'}
                        </div>
                      )}
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
          </div>

          {/* Actively Recurring Checklists - managers and above */}
          {canManage && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Actively Recurring Checklists</h2>
              {recurringChecklists.filter(r => r.template_title.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 ? (
                <p className="text-slate-500 text-sm">No recurring checklists</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recurringChecklists.filter(r => r.template_title.toLowerCase().includes(searchTerm.toLowerCase())).map(schedule => (
                    <Card key={schedule.id} className="border-0 shadow-sm">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                            <CheckSquare className="w-5 h-5 text-purple-600" />
                          </div>
                          {schedule.recurrence_type && <StatusBadge status={schedule.recurrence_type} />}
                        </div>
                        <h3 className="font-semibold text-slate-900 mb-1">{schedule.template_title}</h3>
                        <p className="text-xs font-medium text-purple-600 mb-1">{recurrenceLabel(schedule)}</p>
                        {schedule.due_time && <p className="text-xs text-slate-400 mb-2">Due by {schedule.due_time}</p>}
                        {schedule.template_description && <p className="text-sm text-slate-500 mb-3">{schedule.template_description}</p>}
                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
                          <Clock className="w-3 h-3" />
                          {schedule.template_items?.length || 0} items
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 bg-purple-600 hover:bg-purple-700"
                            onClick={() => handleEditRecurring(schedule)}
                          >
                            Edit
                          </Button>
                          {(isSuperAdmin || isAdmin) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Remove this recurring schedule"
                              onClick={() => deleteRecurring(schedule)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Template Checklists - managers and above */}
          {canManage && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Template Checklists</h2>
              {templateChecklists.filter(t => t.title.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 ? (
                <p className="text-slate-500 text-sm">No template checklists</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templateChecklists.filter(t => t.title.toLowerCase().includes(searchTerm.toLowerCase())).map(template => (
                    <Card key={template.id} className="border-0 shadow-sm">
                      <CardContent className="p-6">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center mb-3">
                          <CheckSquare className="w-5 h-5 text-blue-600" />
                        </div>
                        <h3 className="font-semibold text-slate-900 mb-1">{template.title}</h3>
                        {template.description && <p className="text-sm text-slate-500 mb-3">{template.description}</p>}
                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
                          <Clock className="w-3 h-3" />
                          {template.items?.length || 0} items
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 bg-blue-600 hover:bg-blue-700"
                            onClick={() => handleAssignClick(template)}
                          >
                            Assign
                          </Button>
                          <Link to={createPageUrl('ChecklistEditor') + `?id=${template.id}`}>
                            <Button variant="outline" size="sm">Edit</Button>
                          </Link>
                          {(isSuperAdmin || isAdmin) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => {
                                setTemplateToDelete(template);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* My Draft Templates - managers and above */}
          {canManage && draftTemplates.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">My Draft Templates</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {draftTemplates.map(t => (
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
        </div>
      )}

      {/* Assignment Dialog */}
      <Dialog open={useDialogOpen} onOpenChange={setUseDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isAssigningFromTemplate ? 'Assign' : 'Edit'} "{isAssigningFromTemplate ? templateToUse?.title : templateToUse?.template_title}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Assign Users */}
            <div>
              <label className="text-sm font-medium text-slate-900 block mb-2">Assign to Users</label>
              <div className="relative mb-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input placeholder="Search users..." value={assignUserSearch} onChange={e => setAssignUserSearch(e.target.value)} className="pl-7 h-8 text-sm" />
              </div>
              <div className="flex flex-col gap-1 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200" style={{ maxHeight: '108px' }}>
                {allUsers.filter(u => (u.full_name || u.email).toLowerCase().includes(assignUserSearch.toLowerCase())).map(u => (
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
                  recurrence_days_of_week: useForm.recurrence_days_of_week,
                  recurrence_day_of_month: useForm.recurrence_day_of_month,
                  recurrence_interval_months: useForm.recurrence_interval_months,
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