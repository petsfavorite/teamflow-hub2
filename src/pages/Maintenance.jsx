import React, { useState, useEffect } from 'react';
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
import { Checkbox } from "@/components/ui/checkbox";
import { Wrench, Plus, MapPin, Clock, User, Loader2, ChevronDown, Paperclip } from 'lucide-react';
import { toast } from "sonner";

export default function Maintenance() {
  const { user, canManage, isSuperAdmin, isAdmin } = useCurrentUser();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const [showNew, setShowNew] = useState(params.get('new') === 'true');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', location: '', priority: 'medium', asset_id: null });
  const [newNote, setNewNote] = useState('');
  const [newNoteAttachment, setNewNoteAttachment] = useState(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [expandedNotesLog, setExpandedNotesLog] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [completedSearch, setCompletedSearch] = useState('');

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['maintenance-requests'],
    queryFn: async () => {
      const all = await base44.entities.MaintenanceRequest.list('-created_date', 200);
      // Filter out completed requests
      return all.filter(r => r.status !== 'completed');
    },
  });

  const { data: completedRequests = [] } = useQuery({
    queryKey: ['maintenance-requests-completed'],
    queryFn: async () => {
      const all = await base44.entities.MaintenanceRequest.list('-created_date', 200);
      return all.filter(r => r.status === 'completed');
    },
    enabled: canManage,
  });

  const { data: assets = [] } = useQuery({
    queryKey: ['assets'],
    queryFn: () => base44.entities.Asset.list('name', 200),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => base44.entities.User.list(),
    enabled: isSuperAdmin || isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.MaintenanceRequest.create(data),
    onSuccess: () => {
      toast.success('Request submitted');
      queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] });
      setShowNew(false);
      setForm({ title: '', description: '', location: '', priority: 'medium' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.MaintenanceRequest.update(id, data),
    onSuccess: () => {
      toast.success('Request updated');
      queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] });
      setSelected(null);
    },
  });

  const handleSubmit = () => {
    createMutation.mutate({
      ...form,
      requested_by: user?.email,
      requested_by_name: user?.full_name,
    });
  };

  const updateStatus = (id, status) => {
    updateMutation.mutate({ id, data: { status } });
  };

  const myRequests = canManage ? requests : requests.filter(r => r.requested_by === user?.email);

  const filteredCompleted = completedRequests.filter(r => {
    const searchLower = completedSearch.toLowerCase();
    return (
      r.title.toLowerCase().includes(searchLower) ||
      r.description?.toLowerCase().includes(searchLower) ||
      r.asset_name?.toLowerCase().includes(searchLower) ||
      new Date(r.created_date).toLocaleDateString().includes(searchLower)
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

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Card key={i} className="border-0 shadow-sm animate-pulse"><CardContent className="p-4"><div className="h-16 bg-slate-100 rounded" /></CardContent></Card>)}</div>
      ) : myRequests.length === 0 ? (
        <EmptyState icon={Wrench} title="No maintenance requests" description="Submit a request when something needs fixing" />
      ) : (
        <div className="space-y-3">
          {myRequests.map(req => (
            <Card key={req.id} className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => setSelected(req)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <Wrench className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 truncate">{req.title}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                        {req.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{req.location}</span>}
                        {req.asset_name && <span className="flex items-center gap-1">Asset: {req.asset_name}</span>}
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(req.created_date).toLocaleDateString()}</span>
                        <span className="flex items-center gap-1"><User className="w-3 h-3" />{req.requested_by_name || req.requested_by}</span>
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
          ))}
        </div>
      )}

      {/* Completed Requests (managers and above only) */}
      {canManage && completedRequests.length > 0 && (
        <div className="mt-8 border-t pt-6">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-slate-700 transition-colors mb-4"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showCompleted ? 'rotate-180' : ''}`} />
            Completed Requests ({completedRequests.length})
          </button>

          {showCompleted && (
            <div className="space-y-4">
              <Input
                placeholder="Search by title, description, asset, or date..."
                value={completedSearch}
                onChange={(e) => setCompletedSearch(e.target.value)}
                className="border-0 shadow-sm"
              />
              <div className="space-y-3">
                {filteredCompleted.length === 0 ? (
                  <p className="text-sm text-slate-400 py-8 text-center">No completed requests match your search</p>
                ) : (
                  filteredCompleted.map(req => (
                    <Card key={req.id} className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer bg-emerald-50" onClick={() => setSelected(req)}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                              <Wrench className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-slate-900 truncate">{req.title}</p>
                              <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(req.created_date).toLocaleDateString()}</span>
                                {req.asset_name && <span className="flex items-center gap-1">Asset: {req.asset_name}</span>}
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
            <Button onClick={handleSubmit} disabled={createMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
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
              </div>
              {selected?.asset_name && (
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-xs font-medium text-blue-700">Asset: {selected.asset_name}</p>
                </div>
              )}

              {canManage && (
                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-medium text-slate-900">Update Status</p>
                  <div className="flex gap-2 flex-wrap">
                    <Button 
                      variant={selected.status === 'received' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => updateStatus(selected.id, 'received')}
                    >
                      Received
                    </Button>
                    <Button 
                      variant={selected.status === 'working_on' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => updateStatus(selected.id, 'working_on')}
                    >
                      Working On
                    </Button>
                    <Button 
                      variant={selected.status === 'waiting_on' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => updateStatus(selected.id, 'waiting_on')}
                    >
                      Waiting On
                    </Button>
                    <Button 
                      className="bg-emerald-600 hover:bg-emerald-700"
                      size="sm"
                      onClick={() => updateStatus(selected.id, 'completed')}
                    >
                      Complete
                    </Button>
                  </div>
                </div>
              )}

              {canManage && !canManage && false && ( /* users cannot edit after creation */
                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-medium text-slate-900">Add Note</p>
                  <Textarea 
                    placeholder="Add a note" 
                    value={newNote} 
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={2}
                  />
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
                      if (newNote.trim() && user && selected) {
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
                        await base44.entities.MaintenanceRequest.update(selected.id, {
                          notes_log: [...(selected.notes_log || []), noteEntry]
                        });
                        queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] });
                        setNewNote('');
                        setNewNoteAttachment(null);
                        setSelected({ ...selected, notes_log: [...(selected.notes_log || []), noteEntry] });
                        toast.success('Note added');
                      }
                    }}
                    disabled={!newNote.trim() || uploadingAttachment}
                  >
                    {uploadingAttachment && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Add Note
                  </Button>
                </div>
              )}

              {/* Notes Log */}
              {selected.notes_log && selected.notes_log.length > 0 && (
                <div className="border-t pt-4">
                  <button
                    onClick={() => setExpandedNotesLog(!expandedNotesLog)}
                    className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${expandedNotesLog ? 'rotate-180' : ''}`} />
                    Notes Log ({selected.notes_log.length})
                  </button>

                  {expandedNotesLog && (
                    <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                      {selected.notes_log.map((log, idx) => (
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
                </div>
              )}

              {(isSuperAdmin || isAdmin) && selected && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-slate-900 mb-2">Assign To (optional)</p>
                  <Select value={selected.assigned_to || ''} onValueChange={v => {
                    updateMutation.mutate({ 
                      id: selected.id, 
                      data: { assigned_to: v || null }
                    });
                  }}>
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