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
import { CheckSquare, Eye, Pencil, User, Clock, Loader2, AlertCircle, Download } from 'lucide-react';
import { toast } from "sonner";

export default function ChecklistHistory() {
  const { user, canManage, isManager } = useCurrentUser();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState([]);
  const [managerNotes, setManagerNotes] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);

  const { data: completions = [], isLoading } = useQuery({
    queryKey: ['completions-history'],
    queryFn: () => base44.entities.ChecklistCompletion.list('-created_date', 200),
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

  return (
    <div>
      <PageHeader 
        title="Checklist History" 
        description="View and manage past checklist completions"
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

      {showNotifications && notifications.length > 0 && (
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

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Card key={i} className="border-0 shadow-sm animate-pulse"><CardContent className="p-4"><div className="h-12 bg-slate-100 rounded" /></CardContent></Card>)}
        </div>
      ) : completions.length === 0 ? (
        <EmptyState icon={CheckSquare} title="No completed checklists" description="Checklist completions will appear here" />
      ) : (
        <div className="space-y-3">
          {completions.map(c => (
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
      )}

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
              <Button onClick={() => setEditing(true)} variant="outline" className="gap-2">
                <Pencil className="w-4 h-4" /> Edit
              </Button>
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