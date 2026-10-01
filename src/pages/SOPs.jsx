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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { BookOpen, Plus, Search, Tag, Clock, Archive, ArchiveRestore, AlertCircle, Mic, ChevronDown, ChevronRight, FolderArchive, Send, Undo2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from '@/lib/timezone';
import { fetchLiveSops, fetchMyAcks, fetchMyTeamIds, sopsNeedingAck, isReAck, isAckOverdue, pendingState, verificationStatus, searchSops, isLive, manageSop } from '@/lib/sop';

export default function SOPs() {
  const { user, isAdmin, isSuperAdmin, canManage, isManager, can } = useCurrentUser();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [showArchived, setShowArchived] = useState(false);
  const queryClient = useQueryClient();

  // SOPs the user must acknowledge at their CURRENT version (all-staff SOPs included, re-ack after every new version)
  const { data: pendingAck = { sops: [], acks: [] } } = useQuery({
    queryKey: ['sops-pending-ack', user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const [live, acks, myTeamIds] = await Promise.all([
        fetchLiveSops(500),
        fetchMyAcks(user.email),
        fetchMyTeamIds(user.email),
      ]);
      return { sops: sopsNeedingAck(live, acks, user.email, myTeamIds), acks };
    },
  });
  const pendingAckSops = pendingAck.sops;

  const { data: sops = [], isLoading } = useQuery({
    queryKey: ['sops-all', canManage],
    queryFn: async () => {
      if (canManage) {
        const [drafts, pending, published, archived] = await Promise.all([
          base44.entities.SOP.filter({ status: 'draft' }, '-updated_date', 500),
          base44.entities.SOP.filter({ status: 'pending_approval' }, '-updated_date', 500),
          base44.entities.SOP.filter({ status: 'published' }, '-updated_date', 500),
          base44.entities.SOP.filter({ status: 'archived' }, '-updated_date', 500),
        ]);
        return [...drafts, ...pending, ...published, ...archived].sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date));
      }
      return fetchLiveSops(500);
    },
  });

  // SOPs are never deleted: admins archive them (hidden from staff) and can restore them as drafts.
  const archiveMutation = useMutation({
    mutationFn: ({ sop, archive }) => archive ? manageSop('archive', { id: sop.id }) : base44.entities.SOP.update(sop.id, { status: 'draft' }),
    onSuccess: (_, { sop, archive }) => {
      ['sops-all', 'sops-live', 'sops', 'all-sops-dash', 'draft-sops', 'sops-pending-ack', 'sops-pending-ack-dash']
        .forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success(archive ? `"${sop.title}" archived` : `"${sop.title}" restored as a draft`);
    },
    onError: (e) => toast.error('Could not update the SOP: ' + (e?.message || 'unknown error')),
  });

  const publishMutation = useMutation({
    mutationFn: (sop) => manageSop('publish', { id: sop.id }),
    onSuccess: (_, sop) => {
      ['sops-all', 'sops-live', 'sops', 'all-sops-dash', 'draft-sops', 'sops-pending-ack', 'sops-pending-ack-dash']
        .forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success(`"${sop.title}" published`);
    },
    onError: (e) => toast.error('Could not publish the SOP: ' + (e?.message || 'unknown error')),
  });

  const [sendBackSop, setSendBackSop] = useState(null);
  const [sendBackNote, setSendBackNote] = useState('');

  const sendBackMutation = useMutation({
    mutationFn: ({ sop, note }) => base44.functions.invoke('approveContent', {
      type: 'sop', id: sop.id, action: 'send_back', note,
    }),
    onSuccess: () => {
      ['sops-all', 'sops-live', 'sops', 'all-sops-dash', 'draft-sops', 'sops-pending-ack', 'sops-pending-ack-dash', 'draft-sops-sent-back']
        .forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success('SOP sent back with notes');
      setSendBackSop(null);
      setSendBackNote('');
    },
    onError: (e) => toast.error('Could not send back the SOP: ' + (e?.message || 'unknown error')),
  });

  const categories = [...new Set(sops.map(s => s.category).filter(Boolean))];

  // Search covers title, summary, tags, category and the full instructions; results are ranked by relevance.
  const searched = search.trim() ? searchSops(sops, search).map(r => r.sop) : sops;
  // Archived SOPs never appear in the main list; they live in the collapsible Archived folder below it.
  const matchesStatus = (s) => {
    if (s.status === 'archived') return false;
    if (!canManage) return true; // staff only ever receive live SOPs
    return statusFilter === 'active' || s.status === statusFilter || (statusFilter === 'published' && isLive(s));
  };
  const matchesCategory = (s) => categoryFilter === 'all' || s.category === categoryFilter;
  const filtered = searched.filter(s => matchesStatus(s) && matchesCategory(s));
  const archivedSops = canManage ? searched.filter(s => s.status === 'archived' && matchesCategory(s)) : [];

  const badgesFor = (sop) => {
    const out = [];
    const ps = pendingState(sop);
    if (canManage && ps === 'submitted') out.push(['Edit pending review', 'bg-amber-100 text-amber-800']);
    if (canManage && ps === 'changes_requested') out.push(['Changes requested', 'bg-red-100 text-red-700']);
    if (canManage && isLive(sop) && verificationStatus(sop).overdue) out.push(['Verification overdue', 'bg-red-100 text-red-700']);
    return out;
  };

  const renderCard = (sop) => (
             <div key={sop.id} className="relative group">
               <Link to={createPageUrl('SOPDetail') + `?id=${sop.id}`}>
                 <Card className="border-0 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 h-full cursor-pointer">
                   <CardContent className="p-4 md:p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex flex-wrap gap-1.5">
                        {sop.status !== 'published' && <StatusBadge status={sop.status === 'pending_approval' ? 'published' : sop.status} />}
                        {badgesFor(sop).map(([label, cls]) => <span key={label} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>)}
                      </div>
                      {sop.version && <span className="text-xs text-slate-400">v{sop.version}</span>}
                    </div>
                    <h3 className="font-semibold text-slate-900 mb-2 line-clamp-2">{sop.title}</h3>
                    {sop.summary && <p className="text-sm text-slate-500 line-clamp-2 mb-3">{sop.summary}</p>}
                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-400">{sop.category}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-400">{formatDate(sop.updated_date)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
              {can('sop.approve') && sop.status === 'draft' && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Send back"
                  onClick={(e) => {
                    e.preventDefault();
                    setSendBackSop(sop);
                    setSendBackNote('');
                  }}
                  className="absolute top-2 right-20 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity bg-white/90 hover:bg-red-50 text-red-600 hover:text-red-700"
                >
                  <Undo2 className="w-4 h-4" />
                </Button>
              )}
              {can('sop.approve') && sop.status === 'draft' && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Publish"
                  disabled={publishMutation.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    publishMutation.mutate(sop);
                  }}
                  className="absolute top-2 right-11 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity bg-white/90 hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700"
                >
                  <Send className="w-4 h-4" />
                </Button>
              )}
              {can('sop.archive') && (
                <Button
                  variant="ghost"
                  size="icon"
                  title={sop.status === 'archived' ? 'Restore as draft' : 'Archive'}
                  disabled={archiveMutation.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    archiveMutation.mutate({ sop, archive: sop.status !== 'archived' });
                  }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity bg-white/90 hover:bg-slate-100 text-slate-600"
                >
                  {sop.status === 'archived' ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                </Button>
              )}
            </div>
  );

  return (
    <div>
      <PageHeader
        title="Standard Operating Procedures"
        description="Browse and search company SOPs"
        actions={
          can('sop.create') && (
            <Link to={createPageUrl('SOPEditor')}>
              <Button className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                <Plus className="w-4 h-4" /> New SOP
              </Button>
            </Link>
          )
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 md:gap-3 mb-6">
         <div className="relative flex-1">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
           <Input
             placeholder="Search SOPs..."
             value={search}
             onChange={(e) => setSearch(e.target.value)}
             className="pl-10 text-sm"
           />
         </div>
         {canManage && (
           <Select value={statusFilter} onValueChange={setStatusFilter}>
             <SelectTrigger className="w-full sm:w-44 text-sm">
               <SelectValue />
             </SelectTrigger>
             <SelectContent>
               <SelectItem value="active">All active</SelectItem>
               <SelectItem value="published">Published</SelectItem>
               <SelectItem value="draft">Drafts</SelectItem>
             </SelectContent>
           </Select>
         )}
         <Select value={categoryFilter} onValueChange={setCategoryFilter}>
           <SelectTrigger className="w-full sm:w-48 text-sm">
             <SelectValue placeholder="All Categories" />
           </SelectTrigger>
           <SelectContent>
             <SelectItem value="all">All Categories</SelectItem>
             {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
           </SelectContent>
         </Select>
       </div>

      {pendingAckSops.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            <h2 className="font-semibold text-amber-700">Requires Your Acknowledgement ({pendingAckSops.length})</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {pendingAckSops.map(sop => (
              <Link key={sop.id} to={createPageUrl('SOPDetail') + `?id=${sop.id}`}>
                <Card className="border-2 border-amber-400 shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 cursor-pointer bg-amber-50">
                  <CardContent className="p-4 md:p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold bg-amber-400 text-amber-900 px-2 py-0.5 rounded-full">
                        {isReAck(pendingAck.acks, sop) ? `Updated to v${sop.version || 1} — re-acknowledge` : 'Needs Acknowledgement'}
                      </span>
                      {isAckOverdue(sop) && <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Overdue</span>}
                    </div>
                    <h3 className="font-semibold text-slate-900 mb-2 line-clamp-2">{sop.title}</h3>
                    {sop.summary && <p className="text-sm text-slate-500 line-clamp-2 mb-3">{sop.summary}</p>}
                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-amber-200">
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-400">{sop.category}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-400">{formatDate(sop.updated_date)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          <div className="border-t border-slate-200 mt-6 mb-2" />
        </div>
      )}

      {isLoading ? (
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
           {[1, 2, 3].map(i => (
             <Card key={i} className="border-0 shadow-sm animate-pulse">
               <CardContent className="p-4 md:p-6">
                <div className="h-5 bg-slate-200 rounded w-3/4 mb-3" />
                <div className="h-4 bg-slate-100 rounded w-full mb-2" />
                <div className="h-4 bg-slate-100 rounded w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No SOPs found"
          description={search ? "Try adjusting your search terms" : "No SOPs have been published yet"}
        />
      ) : (
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
           {filtered.map(renderCard)}
        </div>
      )}

      {archivedSops.length > 0 && (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowArchived(v => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 mb-3"
          >
            {showArchived ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <FolderArchive className="w-4 h-4" />
            Archived ({archivedSops.length})
          </button>
          {showArchived && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {archivedSops.map(renderCard)}
            </div>
          )}
        </div>
      )}

      {/* Floating mic button for admins/managers → Create New SOP */}
      {can('sop.create') && (
        <Link
          to={createPageUrl('SOPEditor')}
          className="fixed bottom-24 right-4 md:bottom-10 md:right-8 z-50 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-full shadow-lg transition-all hover:scale-105"
          title="Create New SOP"
        >
          <Mic className="w-5 h-5" />
          <span className="text-sm font-semibold hidden sm:inline">New SOP</span>
        </Link>
      )}

      <Dialog open={!!sendBackSop} onOpenChange={(open) => { if (!open) { setSendBackSop(null); setSendBackNote(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send back "{sendBackSop?.title}"</DialogTitle>
            <DialogDescription>
              The draft goes back to the manager who created it with your notes. The SOP stays unpublished until it's revised and approved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Notes for the manager</Label>
            <Textarea
              value={sendBackNote}
              onChange={(e) => setSendBackNote(e.target.value)}
              placeholder="Explain what needs to be changed before this can be published..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSendBackSop(null); setSendBackNote(''); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!sendBackNote.trim() || sendBackMutation.isPending}
              onClick={() => sendBackMutation.mutate({ sop: sendBackSop, note: sendBackNote })}
            >
              {sendBackMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Send Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}