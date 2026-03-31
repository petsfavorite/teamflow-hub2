import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
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
import { Wrench, Plus, MapPin, Clock, User, Loader2, ChevronDown, Paperclip, Archive } from 'lucide-react';
import { toast } from "sonner";

export default function Maintenance() {
  const { user, canManage, isSuperAdmin, isAdmin, isManager } = useCurrentUser();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const [showNew, setShowNew] = useState(params.get('new') === 'true');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', location: '', priority: 'medium', asset_id: null });
  const [newNote, setNewNote] = useState('');
  const [newNoteAttachment, setNewNoteAttachment] = useState(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [expandedNotesLog, setExpandedNotesLog] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState('');

  // Can assign tickets: managers and above
  const canAssign = canManage;

  // Can user edit this ticket?
  const canEdit = (req) => {
    if (!req) return false;
    if (!req.assigned_to) return true;
    return req.assigned_to === user?.email || canManage;
  };

  const { data: allRequests = [], isLoading } = useQuery({
    queryKey: ['maintenance-requests'],
    queryFn: () => base44.entities.MaintenanceRequest.list('-created_date', 500),
  });

  const { data: assets = [] } = useQuery({
    queryKey: ['assets'],
    queryFn: () => base44.entities.Asset.list('name', 200),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => base44.entities.User.list(),
    enabled: canAssign,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.MaintenanceRequest.create(data),
    onSuccess: () => {
      toast.success('Request submitted');
      queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] });
      setShowNew(false);
      setForm({ title: '', description: '', location: '', priority: 'medium', asset_id: null });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.MaintenanceRequest.update(id, data),
    onSuccess: (_, vars) => {
      toast.success('Request updated');
      queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] });
      if (vars.closeAfter) setSelected(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.MaintenanceRequest.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] });
    },
  });

  const handleSubmit = () => {
    const selectedAsset = assets.find(a => a.id === form.asset_id);
    createMutation.mutate({
      ...form,
      asset_name: selectedAsset?.name || null,
      requested_by: user?.email,
      requested_by_name: user?.full_name,
    });
  };

  const handleStatusUpdate = async (id, status) => {
    updateMutation.mutate({ id, data: { status }, closeAfter: status === 'completed' });

    // If completing and asset-linked, prune to keep only 30 most recent completed per asset
    if (status === 'completed') {
      const req = allRequests.find(r => r.id === id);
      if (req?.asset_id) {
        const assetCompleted = allRequests
          .filter(r => r.asset_id === req.asset_id && r.status === 'completed' && r.id !== id)
          .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        const toDelete = assetCompleted.slice(29);
        for (const old of toDelete) {
          deleteMutation.mutate(old.id);
        }
      }
    }
  };

  const activeRequests = allRequests.filter(r => r.status !== 'completed');
  const archivedRequests = allRequests.filter(r => r.status === 'completed');

  const visibleActive = canManage
    ? activeRequests
    : activeRequests.filter(r => r.requested_by === user?.email || r.assigned_to === user?.email);

  const myAssignedTasks = !canManage
    ? activeRequests.filter(r => r.assigned_to === user?.email)
    : [];

  const filteredArchive = archivedRequests.filter(r => {
    const q = archiveSearch.toLowerCase();
    return (
      r.title?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q) ||
      r.asset_name?.toLowerCase().includes(q) ||
      new Date(r.created_date).toLocaleDateString().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Maintenance Requests"
        description="Submit and track maintenance requests"
        actions={
          <Button onClick={() => setShowNew(true)} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
            <Plus className="w-4 h-4" /> New Request
          </Button>
        }
      />

      {/* My Assigned Tasks — for non-manager users */}
      {myAssignedTasks.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <User className="w-4 h-4 text-purple-600" /> My Assigned Tasks
          </h2>
          <div className="space-y-3">
            {myAssignedTasks.map(req => (
              <RequestCard key={req.id} req={req} onClick={() => setSelected(req)} highlight />
            ))}
          </div>
          <div className="border-t my-6" />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Card key={i} className="border-0 shadow-sm animate-pulse"><CardContent className="p-4"><div className="h-16 bg-slate-100 rounded" /></CardContent></Card>)}</div>
      ) : visibleActive.length === 0 ? (
        <EmptyState icon={Wrench} title="No maintenance requests" description="Submit a request when something needs fixing" />
      ) : (
        <div className="space-y-3">
          {visibleActive.map(req => (
            <RequestCard key={req.id} req={req} onClick={() => setSelected(req)} />
          ))}
        </div>
      )}

      {/* Archive — managers and above only */}
      {canManage && archivedRequests.length > 0 && (
        <div className="mt-8 border-t pt-6">
          <button
            onClick={() => setShowArchive(!showArchive)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-slate-700 transition-colors mb-4"
          >
            <Archive className="w-4 h-4 text-slate-500" />
            <ChevronDown className={`w-4 h-4 transition-transform ${showArchive ? 'rotate-180' : ''}`} />
            Archive — Completed ({archivedRequests.length})
          </button>
          {showArchive && (
            <div className="space-y-4">
              <Input
                placeholder="Search by title, description, asset, or date..."
                value={archiveSearch}
                onChange={(e) => setArchiveSearch(e.target.value)}
                className="border-0 shadow-sm"
              />
              <div className="space-y-3">
                {filteredArchive.length === 0 ? (
                  <p className="text-sm text-slate-400 py-8 text-center">No archived requests match your search</p>
                ) : (
                  filteredArchive.map(req => (
                    <RequestCard key={req.id} req={req} onClick={() => setSelected(req)} archived />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Request Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Maintenance Request</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Brief description" /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Detailed description" rows={3} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Location</Label><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Where is the issue?" /></div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Linked Asset (optional)</Label>
              <Select value={form.asset_id || ''} onValueChange={v => setForm({ ...form, asset_id: v || null })}>
                <SelectTrigger><SelectValue placeholder="Select an asset" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>None</SelectItem>
                  {assets.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.title || createMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => { setSelected(null); setNewNote(''); setNewNoteAttachment(null); setExpandedNotesLog(false); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selected?.title}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">{selected?.description}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-400">Submitted:</span> <span className="font-medium">{new Date(selected?.created_date).toLocaleDateString()}</span></div>
                <div><span className="text-slate-400">Priority:</span> <StatusBadge status={selected?.priority} /></div>
                <div><span className="text-slate-400">Status:</span> <StatusBadge status={selected?.status} /></div>
                {selected?.location && <div><span className="text-slate-400">Location:</span> <span className="font-medium">{selected?.location}</span></div>}
                {selected?.assigned_to && <div className="col-span-2"><span className="text-slate-400">Assigned to:</span> <span className="font-medium text-purple-700">{selected.assigned_to}</span></div>}
              </div>
              {selected?.asset_name && (
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-xs font-medium text-blue-700">Asset: {selected.asset_name}</p>
                </div>
              )}

              {canEdit(selected) && selected.status !== 'completed' && (
                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-medium text-slate-900">Update Status</p>
                  <div className="flex gap-2 flex-wrap">
                    {['received', 'working_on', 'waiting_on'].map(s => (
                      <Button
                        key={s}
                        variant={selected.status === s ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => { handleStatusUpdate(selected.id, s); setSelected({ ...selected, status: s }); }}
                      >
                        {s === 'received' ? 'Received' : s === 'working_on' ? 'Working On' : 'Waiting On'}
                      </Button>
                    ))}
                    {canManage && (
                      <Button className="bg-emerald-600 hover:bg-emerald-700" size="sm" onClick={() => handleStatusUpdate(selected.id, 'completed')}>
                        Complete
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {canEdit(selected) && (
                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-medium text-slate-900">Add Note</p>
                  <Textarea placeholder="Add a note" value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={2} />
                  <div className="space-y-2">
                    <Label className="text-xs">Attachment (optional)</Label>
                    <input type="file" className="text-xs text-slate-600" onChange={(e) => setNewNoteAttachment(e.target.files?.[0] || null)} disabled={uploadingAttachment} />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!newNote.trim() || !user || !selected) return;
                      let attachmentUrl = null;
                      if (newNoteAttachment) {
                        setUploadingAttachment(true);
                        const { file_url } = await base44.integrations.Core.UploadFile({ file: newNoteAttachment });
                        attachmentUrl = file_url;
                        setUploadingAttachment(false);
                      }
                      const noteEntry = {
                        note: newNote,
                        date: new Date().toISOString(),
                        added_by: user.email,
                        added_by_name: user.full_name || user.email,
                        ...(attachmentUrl && { attachment_url: attachmentUrl })
                      };
                      await base44.entities.MaintenanceRequest.update(selected.id, {
                        notes_log: [...(selected.notes_log || []), noteEntry]
                      });
                      queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] });
                      setNewNote('');
                      setNewNoteAttachment(null);
                      setSelected({ ...selected, notes_log: [...(selected.notes_log || []), noteEntry] });
                      toast.success('Note added');
                    }}
                    disabled={!newNote.trim() || uploadingAttachment}
                  >
                    {uploadingAttachment && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Add Note
                  </Button>
                </div>
              )}

              {selected.notes_log?.length > 0 && (
                <div className="border-t pt-4">
                  <button onClick={() => setExpandedNotesLog(!expandedNotesLog)} className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors">
                    <ChevronDown className={`w-4 h-4 transition-transform ${expandedNotesLog ? 'rotate-180' : ''}`} />
                    Notes Log ({selected.notes_log.length})
                  </button>
                  {expandedNotesLog && (
                    <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                      {selected.notes_log.map((log, idx) => (
                        <div key={idx} className="text-xs bg-slate-50 rounded p-2">
                          <p className="text-slate-700">{log.note}</p>
                          <div className="text-xs text-slate-400 mt-1">{log.added_by_name} • {log.date ? new Date(log.date).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</div>
                          {log.attachment_url && (
                            <a href={log.attachment_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline flex items-center gap-1 mt-1.5">
                              <Paperclip className="w-3 h-3" /> View Attachment
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {canAssign && selected.status !== 'completed' && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-slate-900 mb-2">Assign To (optional)</p>
                  <Select
                    value={selected.assigned_to || ''}
                    onValueChange={v => {
                      const val = v || null;
                      updateMutation.mutate({ id: selected.id, data: { assigned_to: val } });
                      setSelected({ ...selected, assigned_to: val });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>Unassigned</SelectItem>
                      {allUsers.map(u => (
                        <SelectItem key={u.id} value={u.email}>{u.full_name || u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RequestCard({ req, onClick, highlight, archived }) {
  return (
    <Card
      className={`border-0 shadow-sm hover:shadow-md transition-all cursor-pointer ${archived ? 'bg-emerald-50' : highlight ? 'bg-purple-50' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${archived ? 'bg-emerald-100' : highlight ? 'bg-purple-100' : 'bg-amber-100'}`}>
              <Wrench className={`w-5 h-5 ${archived ? 'text-emerald-600' : highlight ? 'text-purple-600' : 'text-amber-600'}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900 truncate">{req.title}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                {req.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{req.location}</span>}
                {req.asset_name && <span>Asset: {req.asset_name}</span>}
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(req.created_date).toLocaleDateString()}</span>
                <span className="flex items-center gap-1"><User className="w-3 h-3" />{req.requested_by_name || req.requested_by}</span>
                {req.assigned_to && <span className="text-purple-500">→ {req.assigned_to}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={req.priority} />
            <StatusBadge status={req.status} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}