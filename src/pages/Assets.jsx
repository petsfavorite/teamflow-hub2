import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
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
import { Boxes, Plus, Wrench, AlertTriangle, ExternalLink, Pencil, Loader2, Paperclip, Trash2 } from 'lucide-react';
import { toast } from "sonner";
import { differenceInDays, parseISO } from 'date-fns';

const emptyForm = {
  name: '', category: 'equipment', location_detail: '', serial_number: '',
  purchase_date: '', last_maintenance_date: '', next_maintenance_date: '',
  maintenance_interval_days: '', manual_url: '', notes: '', status: 'active',
};

export default function Assets() {
  const { canManage, isAdmin, isSuperAdmin, isManager } = useCurrentUser();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [newNote, setNewNote] = useState('');
  const [newNoteAttachment, setNewNoteAttachment] = useState(null);

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['assets'],
    queryFn: () => base44.entities.Asset.list('name', 200),
  });

  const { data: sops = [] } = useQuery({
    queryKey: ['sops-published'],
    queryFn: () => base44.entities.SOP.filter({ status: 'published' }),
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('title', 200),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editingAsset
      ? base44.entities.Asset.update(editingAsset.id, data)
      : base44.entities.Asset.create(data),
    onSuccess: () => {
      toast.success(editingAsset ? 'Asset updated' : 'Asset added');
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      resetForm();
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingAsset(null);
    setForm(emptyForm);
  };

  const startEdit = (asset) => {
    setEditingAsset(asset);
    setForm(asset);
    setShowForm(true);
  };

  const getMaintenanceStatus = (asset) => {
    if (!asset.next_maintenance_date) return null;
    const days = differenceInDays(parseISO(asset.next_maintenance_date), new Date());
    if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: 'text-red-600 bg-red-50' };
    if (days <= 7) return { label: `Due in ${days}d`, color: 'text-amber-600 bg-amber-50' };
    return { label: `Due ${asset.next_maintenance_date}`, color: 'text-emerald-600 bg-emerald-50' };
  };

  const categoryIcons = { equipment: '⚙️', appliance: '🏠', vehicle: '🚗', technology: '💻', furniture: '🪑', other: '📦' };

  return (
    <div>
      <PageHeader
        title="Assets & Equipment"
        description="Track equipment, maintenance schedules, and manuals"
        actions={
          canManage && (
            <Button onClick={() => setShowForm(true)} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              <Plus className="w-4 h-4" /> Add Asset
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1,2,3,4].map(i=><Card key={i} className="border-0 shadow-sm animate-pulse"><CardContent className="p-5"><div className="h-20 bg-slate-100 rounded"/></CardContent></Card>)}</div>
      ) : assets.length === 0 ? (
        <EmptyState icon={Boxes} title="No assets tracked" description="Add equipment and assets to track maintenance schedules" />
      ) : (
        <div className="space-y-4">
          <Input
            placeholder="Search assets by name, location, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assets.filter(asset => 
              asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              asset.location_detail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              asset.category.toLowerCase().includes(searchQuery.toLowerCase())
            ).map(asset => {
              const maintenance = getMaintenanceStatus(asset);
              return (
                <Card key={asset.id} className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => setSelectedAsset(asset)}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-xl flex-shrink-0">
                          {categoryIcons[asset.category] || '📦'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{asset.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{asset.location_detail || asset.category}</p>
                          {maintenance && (
                            <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full font-medium ${maintenance.color}`}>
                              <Wrench className="w-3 h-3 inline mr-1" />{maintenance.label}
                            </span>
                          )}
                          {asset.status !== 'active' && <StatusBadge status={asset.status} className="mt-2" />}
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAsset(asset);
                        }} className="px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded">
                          View
                        </button>
                        {asset.sop_id && (
                          <Link to={createPageUrl('SOPDetail') + `?id=${asset.sop_id}`} className="p-1.5 rounded hover:bg-indigo-50" onClick={e => e.stopPropagation()}>
                            <span className="text-xs text-indigo-600 font-medium px-1">SOP</span>
                          </Link>
                        )}
                        {(isSuperAdmin || isAdmin || isManager) && (
                          <button onClick={(e) => {
                            e.stopPropagation();
                            startEdit(asset);
                          }} className="p-1.5 rounded hover:bg-slate-100">
                            <Pencil className="w-4 h-4 text-slate-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={!!selectedAsset} onOpenChange={() => setSelectedAsset(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selectedAsset?.name}</DialogTitle></DialogHeader>
          {selectedAsset && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 font-medium">Category</p>
                  <p className="text-sm font-medium">{selectedAsset.category}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Location</p>
                  <p className="text-sm font-medium">{selectedAsset.location_detail || '—'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 font-medium">Status</p>
                  <div className="mt-1"><StatusBadge status={selectedAsset.status} /></div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Serial Number</p>
                  <p className="text-sm font-medium">{selectedAsset.serial_number || '—'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 font-medium">Last Maintenance</p>
                  <p className="text-sm font-medium">{selectedAsset.last_maintenance_date || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Next Maintenance Due</p>
                  <p className="text-sm font-medium">{selectedAsset.next_maintenance_date || '—'}</p>
                </div>
              </div>

              {selectedAsset.notes && (
                <div>
                  <p className="text-xs text-slate-500 font-medium">Notes</p>
                  <p className="text-sm mt-1">{selectedAsset.notes}</p>
                </div>
              )}

              {(selectedAsset.manual_url || selectedAsset.sop_id || selectedAsset.task_ids?.length > 0) && (
                <div className="flex flex-col gap-2 pt-2 border-t">
                  <div className="flex gap-2">
                    {selectedAsset.manual_url && (
                      <a href={selectedAsset.manual_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-sm font-medium">
                        <ExternalLink className="w-4 h-4" /> Manual
                      </a>
                    )}
                    {selectedAsset.sop_id && (
                      <Link to={createPageUrl('SOPDetail') + `?id=${selectedAsset.sop_id}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium">
                        <span>View SOP</span>
                      </Link>
                    )}
                  </div>
                  {selectedAsset.task_ids?.length > 0 && (
                    <div className="text-xs text-slate-600">
                      <p className="font-medium mb-1.5">Attached Tasks:</p>
                      <div className="space-y-1">
                        {selectedAsset.task_ids.map(taskId => {
                          const task = allTasks.find(t => t.id === taskId);
                          return task ? (
                            <div key={taskId} className="text-xs bg-slate-50 px-2 py-1 rounded">
                              {task.title}
                            </div>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {(isSuperAdmin || isAdmin || isManager) && (
              <Button onClick={() => {
                setSelectedAsset(null);
                startEdit(selectedAsset);
              }} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                <Pencil className="w-4 h-4" /> Edit Asset
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedAsset(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showForm} onOpenChange={resetForm}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingAsset ? 'Edit Asset' : 'Add Asset'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kennel Washer" /></div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['equipment','appliance','vehicle','technology','furniture','other'].map(c=><SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Location/Area</Label><Input value={form.location_detail} onChange={e => setForm({ ...form, location_detail: e.target.value })} placeholder="e.g. Kennel Room" /></div>
              <div className="space-y-2"><Label>Serial Number</Label><Input value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Last Maintenance</Label><Input type="date" value={form.last_maintenance_date} onChange={e => setForm({ ...form, last_maintenance_date: e.target.value })} /></div>
              <div className="space-y-2"><Label>Next Maintenance Due</Label><Input type="date" value={form.next_maintenance_date} onChange={e => setForm({ ...form, next_maintenance_date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="needs_maintenance">Needs Maintenance</SelectItem>
                    <SelectItem value="out_of_service">Out of Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Linked SOP (optional)</Label>
                <Select value={form.sop_id || ''} onValueChange={v => setForm({ ...form, sop_id: v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>None</SelectItem>
                    {sops.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Manual URL</Label><Input value={form.manual_url} onChange={e => setForm({ ...form, manual_url: e.target.value })} placeholder="https://..." /></div>
            <div className="space-y-2">
              <Label>Attached Tasks</Label>
              <div className="border rounded-lg p-3 space-y-2 bg-slate-50 max-h-40 overflow-y-auto">
                {allTasks.filter(t => !form.task_ids?.includes(t.id)).length === 0 && form.task_ids?.length === 0 ? (
                  <p className="text-xs text-slate-400">No tasks available</p>
                ) : (
                  allTasks.filter(t => !form.task_ids?.includes(t.id)).map(task => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setForm({ ...form, task_ids: [...(form.task_ids || []), task.id] })}
                      className="w-full text-left text-xs px-2 py-1 rounded hover:bg-indigo-100 transition-colors"
                    >
                      {task.title}
                    </button>
                  ))
                )}
              </div>
              {form.task_ids?.length > 0 && (
                <div className="space-y-1">
                  {form.task_ids.map(taskId => {
                    const task = allTasks.find(t => t.id === taskId);
                    return task ? (
                      <div key={taskId} className="flex items-center justify-between text-xs bg-indigo-50 px-2 py-1.5 rounded">
                        <span>{task.title}</span>
                        <button type="button" onClick={() => setForm({ ...form, task_ids: form.task_ids.filter(id => id !== taskId) })} className="text-indigo-600 hover:text-indigo-800">×</button>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
            </div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
            <Button onClick={() => {
              const payload = { ...form };
              if (payload.maintenance_interval_days === '' || payload.maintenance_interval_days === null) {
                delete payload.maintenance_interval_days;
              } else {
                payload.maintenance_interval_days = Number(payload.maintenance_interval_days);
              }
              saveMutation.mutate(payload);
            }} disabled={saveMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {editingAsset ? 'Update' : 'Add'} Asset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}