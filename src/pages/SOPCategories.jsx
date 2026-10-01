import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FolderTree, Plus, Trash2, Pencil, Check, X, Loader2 } from 'lucide-react';
import { useCurrentUser } from '@/components/hooks/useCurrentUser';
import { toast } from 'sonner';

export default function SOPCategories() {
  const queryClient = useQueryClient();
  const { isManager, isAdmin, isSuperAdmin } = useCurrentUser();
  const canManage = isManager || isAdmin || isSuperAdmin;
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['sop-categories'],
    queryFn: () => base44.entities.SOPCategory.list('order', 200),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['sop-categories'] });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.SOPCategory.create(data),
    onSuccess: () => { invalidate(); toast.success('Category created'); setNewName(''); setNewDesc(''); },
    onError: (e) => toast.error('Could not create: ' + (e?.message || 'error')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SOPCategory.update(id, data),
    onSuccess: () => { invalidate(); toast.success('Category updated'); setEditingId(null); },
    onError: (e) => toast.error('Could not update: ' + (e?.message || 'error')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.SOPCategory.delete(id),
    onSuccess: () => { invalidate(); toast.success('Category deleted'); },
    onError: (e) => toast.error('Could not delete: ' + (e?.message || 'error')),
  });

  const startEdit = (cat) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditDesc(cat.description || '');
  };

  const saveEdit = () => {
    if (!editName.trim()) return;
    updateMutation.mutate({ id: editingId, data: { name: editName.trim(), description: editDesc.trim() } });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FolderTree className="w-6 h-6 text-indigo-600" /> SOP Categories
        </h1>
        <p className="text-sm text-slate-500 mt-1">Manage the category list used in the SOP editor dropdown.</p>
      </div>

      {canManage && (
        <Card className="border-0 shadow-sm mb-6">
          <CardHeader className="pb-2"><CardTitle className="text-base text-slate-700">Add Category</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Name *</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Safety, Operations, Grooming" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <Button
              onClick={() => createMutation.mutate({ name: newName.trim(), description: newDesc.trim(), order: categories.length })}
              disabled={createMutation.isPending || !newName.trim()}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Category
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base text-slate-700">All Categories ({categories.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>}
          {!isLoading && categories.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">No categories yet. {canManage && 'Add one above to get started.'}</p>
          )}
          {categories.map(cat => (
            <div key={cat.id} className="border border-slate-200 rounded-lg p-3">
              {editingId === cat.id ? (
                <div className="space-y-2">
                  <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8" />
                  <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description" className="h-8" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending || !editName.trim()} className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                      {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="gap-1">
                      <X className="w-3.5 h-3.5" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm text-slate-800">{cat.name}</p>
                    {cat.description && <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>}
                  </div>
                  {canManage && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(cat)} className="h-7 w-7 p-0">
                        <Pencil className="w-3.5 h-3.5 text-slate-500" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(cat.id)} disabled={deleteMutation.isPending} className="h-7 w-7 p-0">
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}