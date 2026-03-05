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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { BookOpen, Plus, Search, Tag, Clock, Trash2 } from 'lucide-react';

export default function SOPs() {
  const { isAdmin, isSuperAdmin, canManage, isManager } = useCurrentUser();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const queryClient = useQueryClient();

  const { data: sops = [], isLoading } = useQuery({
    queryKey: ['sops-all'],
    queryFn: () => canManage
      ? base44.entities.SOP.list('-updated_date', 200)
      : base44.entities.SOP.filter({ status: 'published' }, '-updated_date', 200),
  });

  const deleteMutation = useMutation({
    mutationFn: (sopId) => base44.entities.SOP.delete(sopId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sops-all'] });
      setDeleteConfirm(null);
    },
  });

  const categories = [...new Set(sops.map(s => s.category).filter(Boolean))];

  const filtered = sops.filter(s => {
    const matchSearch = !search || s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.summary?.toLowerCase().includes(search.toLowerCase()) ||
      s.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()));
    const matchCategory = categoryFilter === 'all' || s.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  return (
    <div>
      <PageHeader
        title="Standard Operating Procedures"
        description="Browse and search company SOPs"
        actions={
          (isAdmin || isSuperAdmin || isManager) && (
            <Link to={createPageUrl('SOPEditor')}>
              <Button className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                <Plus className="w-4 h-4" /> New SOP
              </Button>
            </Link>
          )
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search SOPs..."
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
          title="No SOPs found"
          description={search ? "Try adjusting your search terms" : "No SOPs have been published yet"}
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
                        <span className="text-xs text-slate-400">{new Date(sop.updated_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
              {(isAdmin || isSuperAdmin) && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.preventDefault();
                    setDeleteConfirm(sop);
                  }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 hover:bg-red-100 text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SOP?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteConfirm.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}