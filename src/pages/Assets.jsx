import React, { useState, useEffect } from 'react';
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
import { Checkbox } from "@/components/ui/checkbox";
import { Boxes, Plus, Wrench, AlertTriangle, ExternalLink, Pencil, Loader2, Paperclip, Trash2, ChevronDown, QrCode } from 'lucide-react';
import AssetQRCode from '../components/asset/AssetQRCode';
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
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [user, setUser] = useState(null);
  const [sopSearch, setSopSearch] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [expandedNotesLog, setExpandedNotesLog] = useState(false);
  const [creatingTaskForAsset, setCreatingTaskForAsset] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({ title: '', description: '', assigned_to_emails: [], assigned_to_names: [], assigned_teams: [] });

  useEffect(() => {
    base44.auth.me().then(u => setUser(u)).catch(() => setUser(null));
  }, []);

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

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
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

  const createTaskMutation = useMutation({
    mutationFn: (data) => base44.entities.Task.create(data),
    onSuccess: () => {
      toast.success('Task created and linked to asset');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      setCreatingTaskForAsset(false);
      setNewTaskForm({ title: '', description: '', assigned_to_emails: [], assigned_to_names: [], assigned_teams: [] });
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
                        {asset.sop_ids?.length > 0 && (
                        <span className="text-xs text-indigo-600 font-medium px-1 bg-indigo-50 rounded">
                          {asset.sop_ids.length} SOP{asset.sop_ids.length !== 1 ? 's' : ''}
                        </span>
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

              {(selectedAsset.manual_url || selectedAsset.sop_ids?.length > 0 || selectedAsset.task_ids?.length > 0) && (
                <div className="flex flex-col gap-3 pt-3 border-t">
                  {selectedAsset.manual_url && (
                    <a href={selectedAsset.manual_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-sm font-medium w-fit">
                      <ExternalLink className="w-4 h-4" /> Manual
                    </a>
                  )}
                  {selectedAsset.sop_ids?.length > 0 && (
                    <div className="text-xs text-slate-600">
                      <p className="font-medium mb-1.5">Linked SOPs:</p>
                      <div className="space-y-1">
                        {selectedAsset.sop_ids.map(sopId => {
                          const sop = sops.find(s => s.id === sopId);
                          return sop ? (
                            <Link key={sopId} to={createPageUrl('SOPDetail') + `?id=${sopId}`} className="block text-xs bg-slate-50 px-2 py-1 rounded hover:bg-indigo-50 text-indigo-600">
                              {sop.title}
                            </Link>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                  {selectedAsset.task_ids?.length > 0 && (
                    <div className="text-xs text-slate-600">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="font-medium">Attached Tasks:</p>
                        <button onClick={() => setCreatingTaskForAsset(true)} className="text-indigo-600 hover:text-indigo-700 font-semibold">+</button>
                      </div>
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
                  {!selectedAsset.task_ids?.length && (
                    <button onClick={() => setCreatingTaskForAsset(true)} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-3 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 w-fit">
                      <Plus className="w-3 h-3 inline mr-1" /> Create Task
                    </button>
                  )}
                </div>
              )}

              <div className="pt-4 border-t space-y-4">
                {/* Add Note Section */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-900">Add to Notes Log</p>
                  <Textarea 
                    placeholder="Add a note (max 200 characters)" 
                    value={newNote} 
                    onChange={(e) => setNewNote(e.target.value.substring(0, 200))}
                    rows={2}
                    maxLength={200}
                  />
                  <div className="text-xs text-slate-400">{newNote.length}/200</div>
                  <div className="space-y-2">
                    <Label className="text-xs">Attachment (optional)</Label>
                    <Input 
                      type="file" 
                      onChange={(e) => setNewNoteAttachment(e.target.files?.[0] || null)}
                      disabled={uploadingAttachment}
                    />
                    {newNoteAttachment && <p className="text-xs text-slate-500">Selected: {newNoteAttachment.name}</p>}
                  </div>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={async () => {
                      if (newNote.trim() && user) {
                        let attachmentUrl = null;
                        if (newNoteAttachment) {
                          setUploadingAttachment(true);
                          try {
                            const { file_url } = await base44.integrations.Core.UploadFile({ file: newNoteAttachment });
                            attachmentUrl = file_url;
                          } catch (err) {
                            toast.error('Failed to upload attachment');
                            setUploadingAttachment(false);
                            return;
                          }
                          setUploadingAttachment(false);
                        }
                        const noteEntry = { 
                          note: newNote, 
                          date: new Date().toISOString().split('T')[0],
                          added_by: user.email,
                          added_by_name: user.full_name || user.email,
                          ...(attachmentUrl && { attachment_url: attachmentUrl })
                        };
                        await base44.entities.Asset.update(selectedAsset.id, {
                          notes_log: [...(selectedAsset.notes_log || []), noteEntry]
                        });
                        queryClient.invalidateQueries({ queryKey: ['assets'] });
                        setNewNote('');
                        setNewNoteAttachment(null);
                        toast.success('Note added');
                      }
                    }}
                    disabled={!newNote.trim() || uploadingAttachment}
                  >
                    {uploadingAttachment && <Loader2 className="w-4 h-4 animate-spin" />} Add Note
                  </Button>
                </div>

                {/* Add Task Section */}
                <div className="space-y-2 border-t pt-4">
                  <p className="text-sm font-medium text-slate-900">Attach Tasks</p>
                  <Input
                    placeholder="Search tasks..."
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    className="text-xs"
                  />
                  <div className="border rounded-lg p-2 bg-slate-50 max-h-40 overflow-y-auto space-y-1">
                    {allTasks
                      .filter(t => 
                        !selectedAsset.task_ids?.includes(t.id) &&
                        t.title.toLowerCase().includes(taskSearch.toLowerCase())
                      )
                      .map(task => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={async () => {
                            const updated = {
                              task_ids: [...(selectedAsset.task_ids || []), task.id]
                            };
                            await base44.entities.Asset.update(selectedAsset.id, updated);
                            queryClient.invalidateQueries({ queryKey: ['assets'] });
                            setTaskSearch('');
                            toast.success('Task attached');
                          }}
                          className="w-full text-left text-xs px-2 py-1 rounded hover:bg-indigo-100 transition-colors"
                        >
                          {task.title}
                        </button>
                      ))}
                  </div>
                </div>

                {/* Notes Log Display */}
                <div className="border-t pt-4">
                  <button
                    onClick={() => setExpandedNotesLog(!expandedNotesLog)}
                    className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${expandedNotesLog ? 'rotate-180' : ''}`} />
                    Notes Log ({selectedAsset?.notes_log?.length || 0})
                  </button>

                  {expandedNotesLog && selectedAsset.notes_log?.length > 0 && (
                    <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                      {selectedAsset.notes_log.map((log, idx) => (
                        <div key={idx} className="text-xs bg-slate-50 rounded p-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-slate-700">{log.note}</p>
                              <div className="text-xs text-slate-400 mt-1">
                                {log.added_by_name} • {log.date}
                              </div>
                              {log.attachment_url && (
                                <a href={log.attachment_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline flex items-center gap-1 mt-1.5">
                                  <Paperclip className="w-3 h-3" /> View Attachment
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {expandedNotesLog && !selectedAsset.notes_log?.length && (
                    <p className="text-sm text-slate-500 mt-2">No notes yet</p>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <AssetQRCode asset={selectedAsset} />
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

          <Dialog open={creatingTaskForAsset} onOpenChange={setCreatingTaskForAsset}>
          <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Task for {selectedAsset?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Task Title</Label><Input value={newTaskForm.title} onChange={e => setNewTaskForm({ ...newTaskForm, title: e.target.value })} placeholder="What needs to be done?" /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={newTaskForm.description} onChange={e => setNewTaskForm({ ...newTaskForm, description: e.target.value })} rows={2} /></div>
            <div className="space-y-2">
              <Label>Assign to Users</Label>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200">
                {users.map(u => (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={(newTaskForm.assigned_to_emails || []).includes(u.email)}
                      onCheckedChange={checked => {
                        const emails = checked
                          ? [...(newTaskForm.assigned_to_emails || []), u.email]
                          : (newTaskForm.assigned_to_emails || []).filter(e => e !== u.email);
                        const names = checked
                          ? [...(newTaskForm.assigned_to_names || []), u.full_name || u.email]
                          : (newTaskForm.assigned_to_names || []).filter((_, i) => (newTaskForm.assigned_to_emails || [])[i] !== u.email);
                        setNewTaskForm({ ...newTaskForm, assigned_to_emails: emails, assigned_to_names: names });
                      }}
                    />
                    {u.full_name || u.email}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assign to Teams</Label>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200">
                {teams.map(t => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={newTaskForm.assigned_to_teams.includes(t.id)}
                      onCheckedChange={checked => {
                        setNewTaskForm({
                          ...newTaskForm,
                          assigned_to_teams: checked
                            ? [...newTaskForm.assigned_to_teams, t.id]
                            : newTaskForm.assigned_to_teams.filter(id => id !== t.id)
                        });
                      }}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingTaskForAsset(false)}>Cancel</Button>
            <Button onClick={() => {
              if (newTaskForm.title && selectedAsset && (newTaskForm.assigned_to_emails.length > 0 || newTaskForm.assigned_to_teams.length > 0)) {
                createTaskMutation.mutate({
                  ...newTaskForm,
                  created_by_name: user?.full_name,
                  asset_id: selectedAsset.id
                });
              } else {
                toast.error('Please fill in title and assign to at least one user or team');
              }
            }} disabled={createTaskMutation.isPending || !newTaskForm.title || (newTaskForm.assigned_to_emails.length === 0 && newTaskForm.assigned_to_teams.length === 0)} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              {createTaskMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Create Task
            </Button>
          </DialogFooter>
          </DialogContent>
          </Dialog>

      <Dialog open={showForm} onOpenChange={resetForm}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{editingAsset ? 'Edit Asset' : 'Add Asset'}</DialogTitle></DialogHeader>
      {!editingAsset && <p className="text-xs text-slate-500 -mt-2">Only managers and admins can create new assets</p>}
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
              <div className="space-y-2">
                <Label>Linked SOPs (optional)</Label>
                <Input
                  placeholder="Search SOPs..."
                  value={sopSearch}
                  onChange={(e) => setSopSearch(e.target.value)}
                  className="text-xs"
                />
                <div className="border rounded-lg p-2 bg-slate-50 max-h-40 overflow-y-auto space-y-1">
                  {sops
                    .filter(sop => sop.title.toLowerCase().includes(sopSearch.toLowerCase()))
                    .map(sop => (
                    <label key={sop.id} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-slate-100 rounded text-sm">
                      <input
                        type="checkbox"
                        checked={(form.sop_ids || []).includes(sop.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setForm({ ...form, sop_ids: [...(form.sop_ids || []), sop.id] });
                          } else {
                            setForm({ ...form, sop_ids: (form.sop_ids || []).filter(id => id !== sop.id) });
                          }
                        }}
                        className="w-4 h-4"
                      />
                      {sop.title}
                    </label>
                  ))}
                  {sops.filter(sop => sop.title.toLowerCase().includes(sopSearch.toLowerCase())).length === 0 && <p className="text-xs text-slate-400">No SOPs found</p>}
                </div>
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