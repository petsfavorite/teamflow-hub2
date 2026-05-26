import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import PageHeader from '../components/shared/PageHeader';
import StatusBadge from '../components/shared/StatusBadge';
import EmptyState from '../components/shared/EmptyState';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckSquare, Eye, Pencil, User, Clock, Loader2, AlertCircle, Download, ClipboardList, XCircle, CheckCircle2, Timer } from 'lucide-react';
import { toast } from "sonner";

const OUTCOME_CONFIG = {
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'bg-slate-100 text-slate-600', icon: XCircle },
  expired:   { label: 'Expired',   color: 'bg-red-100 text-red-600',    icon: Timer },
};

export default function ChecklistHistory() {
  const { user, canManage, isManager } = useCurrentUser();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState([]);
  const [managerNotes, setManagerNotes] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [tab, setTab] = useState('checklists');

  // Optional date filter from URL (e.g. ?date=2026-03-06 from Analytics click)
  const urlParams = new URLSearchParams(window.location.search);
  const dateFilter = urlParams.get('date') || '';

  const { data: completions = [], isLoading: isLoadingCompletions } = useQuery({
    queryKey: ['completions-history'],
    queryFn: () => base44.entities.ChecklistCompletion.list('-created_date', 200),
  });

  const { data: taskHistory = [], isLoading: isLoadingTaskHistory } = useQuery({
    queryKey: ['task-history'],
    queryFn: () => base44.entities.TaskHistory.list('-closed_at', 300),
    enabled: canManage,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams-list'],
    queryFn: () => base44.entities.Team.list('name', 200),
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['checklist-notifications', user?.email],
    queryFn: () => base44.entities.ChecklistNotification.filter({ manager_email: user?.email }, '-created_date', 100),
    enabled: canManage && isManager,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ChecklistCompletion.update(id, data),
    onSuccess: () => {
      toast.success('Checklist updated');
      queryClient.invalidateQueries({ queryKey: ['completions-history'] });
      setEditing(false);
      setSelected(null);
    },
  });

  const openDetail = (completion) => {
    setSelected(completion);
    setEditItems(completion.completed_items || []);
    setManagerNotes(completion.manager_notes || '');
    setEditing(false);
  };

  const saveEdit = () => {
    updateMutation.mutate({
      id: selected.id,
      data: { completed_items: editItems, manager_notes: managerNotes, status: 'edited' }
    });
  };

  if (!canManage) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Only managers and admins can view checklist history</p>
      </div>
    );
  }

  const isLoading = tab === 'checklists' ? isLoadingCompletions : isLoadingTaskHistory;

  const teamName = (tid) => teams.find(t => t.id === tid)?.name || tid;

  return (
    <div>
      <PageHeader 
        title="History" 
        description="View past checklist completions and task outcomes"
        actions={
          notifications.length > 0 && (
            <Button 
              variant="outline"
              onClick={() => setShowNotifications(!showNotifications)}
              className="gap-2"
            >
              <AlertCircle className="w-4 h-4" />
              {notifications.filter(n => !n.read).length} Incomplete Items
            </Button>
          )
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('checklists')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'checklists' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}
        >
          Checklists
        </button>
        <button
          onClick={() => setTab('tasks')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'tasks' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}
        >
          Tasks
        </button>
      </div>

      {/* Incomplete items notifications (checklists tab only) */}
      {tab === 'checklists' && showNotifications && notifications.length > 0 && (
        <div className="mb-6 space-y-3">
          <h3 className="font-semibold text-slate-900">Items Not Checked Off</h3>
          {notifications.map(n => (
            <Card key={n.id} className="border-l-4 border-l-amber-400 border-0 shadow-sm bg-amber-50">
              <CardContent className="p-4">
                <p className="font-medium text-slate-900 mb-2">{n.checklist_title}</p>
                <p className="text-sm text-slate-600 mb-3">Submitted by {n.completed_by_name}</p>
                <div className="space-y-1 text-sm">
                  {n.incomplete_items?.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-slate-700">
                      <span className="text-amber-600">○</span>
                      <span>{item.label}</span>
                      {item.assigned_to_name && <span className="text-xs text-slate-500">({item.assigned_to_name})</span>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === 'checklists' && dateFilter && (
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
            Showing checklists for <strong>{dateFilter}</strong>
          </span>
          <button
            className="text-xs text-slate-400 hover:text-slate-600 underline"
            onClick={() => window.history.replaceState(null, '', window.location.pathname)}
          >
            Clear filter
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Card key={i} className="border-0 shadow-sm animate-pulse"><CardContent className="p-4"><div className="h-12 bg-slate-100 rounded" /></CardContent></Card>)}
        </div>
      ) : tab === 'checklists' ? (
        completions.length === 0 ? (
          <EmptyState icon={CheckSquare} title="No completed checklists" description="Checklist completions will appear here" />
        ) : (
          <div className="space-y-3">
            {completions.filter(c => !dateFilter || c.completion_date === dateFilter).map(c => (
              <Card key={c.id} className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => openDetail(c)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                        <CheckSquare className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{c.checklist_title}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                          <span className="flex items-center gap-1"><User className="w-3 h-3" />{c.completed_by_name || c.completed_by}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(c.created_date).toLocaleString()}</span>
                        </div>
                        {/* Item summary */}
                        {c.completed_items?.length > 0 && (
                          <div className="flex items-center gap-3 mt-1 text-xs">
                            <span className="text-emerald-600">✓ {c.completed_items.filter(i => i.checked).length} done</span>
                            {c.completed_items.filter(i => !i.checked).length > 0 && (
                              <span className="text-red-500">✗ {c.completed_items.filter(i => !i.checked).length} undone</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={c.status} />
                      <Eye className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        /* Tasks History Tab */
        taskHistory.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No task history" description="Completed, cancelled, and expired tasks will appear here" />
        ) : (
          <div className="space-y-3">
            {taskHistory.map(t => {
              const cfg = OUTCOME_CONFIG[t.outcome] || OUTCOME_CONFIG.expired;
              const Icon = cfg.icon;
              return (
                <Card key={t.id} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          t.outcome === 'completed' ? 'bg-emerald-100' : t.outcome === 'cancelled' ? 'bg-slate-100' : 'bg-red-100'
                        }`}>
                          <Icon className={`w-5 h-5 ${t.outcome === 'completed' ? 'text-emerald-600' : t.outcome === 'cancelled' ? 'text-slate-500' : 'text-red-500'}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{t.task_title}</p>
                          {t.task_description && <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{t.task_description}</p>}
                          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
                            {t.closed_by_name && (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />{t.closed_by_name}
                              </span>
                            )}
                            {t.closed_at && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />{new Date(t.closed_at).toLocaleString()}
                              </span>
                            )}
                            {t.due_date && (
                              <span className="text-slate-400">Due: {t.due_date}</span>
                            )}
                          </div>
                          {/* Assigned people */}
                          {(t.assigned_to_names?.length > 0 || t.assigned_teams?.length > 0) && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {t.assigned_to_names?.map((name, i) => (
                                <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{name}</span>
                              ))}
                              {t.assigned_teams?.map(tid => (
                                <span key={tid} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{teamName(tid)}</span>
                              ))}
                            </div>
                          )}
                          {t.completion_notes && (
                            <p className="text-xs text-slate-500 mt-1 italic">"{t.completion_notes}"</p>
                          )}
                        </div>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* Checklist Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.checklist_title}</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-slate-500 mb-4">
            Completed by {selected?.completed_by_name} on {selected?.completion_date}
          </div>
          <div className="space-y-2">
            {(editing ? editItems : selected?.completed_items || []).map((item, i) => (
              <div key={i} className={`p-3 rounded-lg border ${item.checked ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-start gap-3">
                  {editing ? (
                    <Checkbox checked={item.checked} onCheckedChange={() => {
                      setEditItems(prev => prev.map((it, idx) => idx === i ? { ...it, checked: !it.checked } : it));
                    }} />
                  ) : (
                    <Checkbox checked={item.checked} disabled />
                  )}
                  <div className="flex-1">
                    <span className="text-sm font-medium">{item.label}</span>
                    {item.checked && item.checked_by_name && (
                      <p className="text-xs text-slate-500 mt-1">Checked by {item.checked_by_name} at {item.checked_at ? new Date(item.checked_at).toLocaleString() : 'unknown time'}</p>
                    )}
                    {!item.checked && (
                      <p className="text-xs text-red-500 mt-1">Not completed</p>
                    )}
                    {item.notes && <p className="text-xs text-slate-500 mt-1">{item.notes}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {editing && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium">Manager Notes</p>
              <Textarea value={managerNotes} onChange={e => setManagerNotes(e.target.value)} placeholder="Add notes about edits..." rows={3} />
            </div>
          )}
          <DialogFooter>
            {!editing ? (
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="gap-2"
                  onClick={async () => {
                    const response = await base44.functions.invoke('exportChecklistHistoryPDF', {
                      checklist_completion_id: selected.id
                    });
                    const blob = new Blob([response.data], { type: 'application/pdf' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${selected.checklist_title.replace(/[^a-z0-9]/gi, '_')}_${selected.completion_date}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    a.remove();
                    toast.success('PDF exported');
                  }}
                >
                  <Download className="w-4 h-4" /> Export PDF
                </Button>
                <Button onClick={() => setEditing(true)} variant="outline" className="gap-2">
                  <Pencil className="w-4 h-4" /> Edit
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                <Button onClick={saveEdit} disabled={updateMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}