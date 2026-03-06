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

  const myTemplates = publishedTemplates;

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
    setCanSubmitWithIncomplete(!template.auto_close_datetime && !template.auto_close_time);
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
      // Auto-save to in-progress completion
      saveChecklistProgress(updated);
      return updated;
    });
  };

  const updateNotes = async (index, value) => {
    setNotes(prev => {
      const updated = { ...prev, [index]: value };
      // Auto-save with updated notes
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
      // Find or create in-progress completion record
      if (activeChecklist.completionId) {
        // Update existing record
        await base44.entities.ChecklistCompletion.update(activeChecklist.completionId, {
          completed_items: currentItems,
          status: 'in_progress'
        });
      } else {
        // Create new in-progress record
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
        // Finalize checklist assignment: remove from assigned list and create notifications
        await base44.functions.invoke('finalizeChecklistAssignment', {
          checklist_template_id: activeChecklist.id,
          checklist_completion_id: data.id
        }).catch(() => {
          // Silently fail if finalization fails
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
              <div className="flex gap-2 justify-end">
                {canManage && (
                   <Button
                     onClick={async () => {
                       // Create completion record when stopping
                       const completion = await base44.entities.ChecklistCompletion.create({
                         checklist_template_id: activeChecklist.id,
                         checklist_title: activeChecklist.title,
                         completed_by: user.email,
                         completed_by_name: user.full_name,
                         completed_items: items,
                         completion_date: new Date().toISOString().split('T')[0],
                         status: 'edited'
                       });
                       // Finalize the assignment
                       await base44.functions.invoke('finalizeChecklistAssignment', {
                         checklist_template_id: activeChecklist.id,
                         checklist_completion_id: completion.id
                       }).catch(() => {
                         // Silently fail if finalization fails
                       });
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
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myTemplates.map(template => (
              <Card key={template.id} className="border-0 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3 cursor-pointer" onClick={() => startChecklist(template)}>
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <CheckSquare className="w-5 h-5 text-emerald-600" />
                    </div>
                    <StatusBadge status={template.frequency} />
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-1 cursor-pointer" onClick={() => startChecklist(template)}>{template.title}</h3>
                  {template.description && <p className="text-sm text-slate-500 mb-3 cursor-pointer" onClick={() => startChecklist(template)}>{template.description}</p>}
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-4 cursor-pointer" onClick={() => startChecklist(template)}>
                    <Clock className="w-3 h-3" />
                    {template.items?.length || 0} items
                  </div>

                </CardContent>
              </Card>
            ))}
          </div>
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
                     <p className="text-xs text-slate-400">{t.items?.length} items</p>
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


          </div>
          );
          }