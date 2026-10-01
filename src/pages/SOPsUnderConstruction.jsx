import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PageHeader from '../components/shared/PageHeader';
import StatusBadge from '../components/shared/StatusBadge';
import EmptyState from '../components/shared/EmptyState';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import { BookOpen, Plus, Search, Tag, Clock, Archive } from 'lucide-react';
import { formatDate } from '@/lib/timezone';
import { fetchLiveSops, pendingState, searchSops, manageSop } from '@/lib/sop';

export default function SOPsUnderConstruction() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const { isAdmin, isSuperAdmin } = useCurrentUser();
  const queryClient = useQueryClient();

  const { data: draftSops = [], isLoading } = useQuery({
    queryKey: ['draft-sops'],
    queryFn: async () => {
      const drafts = await base44.entities.SOP.filter({ status: 'draft' }, '-updated_date', 200);
      return drafts;
    },
  });

  // Live SOPs with an edit waiting for review, or sent back to the manager for changes
  const { data: liveSops = [] } = useQuery({
    queryKey: ['sops-live'],
    queryFn: () => fetchLiveSops(500),
  });
  const pendingEdits = liveSops.filter(s => pendingState(s));

  // SOPs are never deleted: admins archive them instead (managers and above can still see them on the SOPs page).
  const archiveMutation = useMutation({
    mutationFn: (sop) => manageSop('archive', { id: sop.id }),
    onSuccess: (_, sop) => {
      ['draft-sops', 'sops-all', 'sops-live', 'all-sops-dash'].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success(`"${sop.title}" archived`);
    },
    onError: (e) => toast.error('Could not archive the SOP: ' + (e?.message || 'unknown error')),
  });

  const categories = [...new Set(draftSops.map(s => s.category).filter(Boolean))];

  const matchIds = new Set(search ? searchSops(draftSops, search).map(r => r.sop.id) : []);
  const filtered = draftSops.filter(s => {
    const matchSearch = !search || matchIds.has(s.id);
    const matchCategory = categoryFilter === 'all' || s.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  return (
    <div>
      <PageHeader
        title="SOPs Under Construction"
        description="Manage draft SOPs and pending approvals"
        actions={
          <Link to={createPageUrl('SOPEditor')}>
            <Button className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              <Plus className="w-4 h-4" /> New SOP
            </Button>
          </Link>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search draft SOPs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {pendingEdits.length > 0 && (
        <div className="mb-8">
          <h2 className="font-semibold text-amber-700 mb-3">Edits awaiting review ({pendingEdits.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingEdits.map(sop => {
              const returned = pendingState(sop) === 'changes_requested';
              return (
                <Link key={sop.id} to={createPageUrl('SOPDetail') + `?id=${sop.id}`}>
                  <Card className={`shadow-sm hover:shadow-lg transition-all cursor-pointer border-l-4 ${returned ? 'border-l-red-500' : 'border-l-amber-400'} border-0`}>
                    <CardContent className="p-4">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${returned ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                        {returned ? 'Changes requested' : 'Waiting for admin approval'}
                      </span>
                      <h3 className="font-semibold text-slate-900 mt-2 line-clamp-2">{sop.title}</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {sop.pending_submitted_by_name ? `By ${sop.pending_submitted_by_name}` : ''}{sop.pending_submitted_at ? ` · ${formatDate(sop.pending_submitted_at)}` : ''} · live v{sop.version || 1}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="border-0 shadow-sm animate-pulse">
              <CardContent className="p-6">
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
          title="No draft SOPs"
          description="All SOPs are either published or archived"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(sop => (
            <div key={sop.id} className="relative group">
              <Link to={createPageUrl('SOPDetail') + `?id=${sop.id}`}>
                <Card className="border-0 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 h-full cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <StatusBadge status={sop.status} />
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
              {(isAdmin || isSuperAdmin) && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Archive"
                  disabled={archiveMutation.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    archiveMutation.mutate(sop);
                  }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity bg-white/90 hover:bg-slate-100 text-slate-600"
                >
                  <Archive className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}