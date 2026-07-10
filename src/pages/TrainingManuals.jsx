import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import PageHeader from '../components/shared/PageHeader';
import EmptyState from '../components/shared/EmptyState';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BookMarked, Plus, Trash2, FileText, Loader2, Upload, ExternalLink } from 'lucide-react';
import { toast } from "sonner";

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TrainingManuals() {
  const { user, isAdmin, isSuperAdmin } = useCurrentUser();
  const canManage = isAdmin || isSuperAdmin;
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: '', file_url: '', file_name: '', file_size: 0 });

  const { data: manuals = [], isLoading } = useQuery({
    queryKey: ['training-manuals'],
    queryFn: () => base44.entities.TrainingManual.list('-created_date', 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.TrainingManual.create(data),
    onSuccess: () => {
      toast.success('Training manual uploaded');
      queryClient.invalidateQueries({ queryKey: ['training-manuals'] });
      resetForm();
    },
    onError: () => toast.error('Failed to save manual'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TrainingManual.delete(id),
    onSuccess: () => {
      toast.success('Manual removed');
      queryClient.invalidateQueries({ queryKey: ['training-manuals'] });
    },
    onError: () => toast.error('Failed to remove manual'),
  });

  const resetForm = () => {
    setShowForm(false);
    setForm({ title: '', description: '', category: '', file_url: '', file_name: '', file_size: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      toast.error('Please select a PDF file');
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      setForm(f => ({
        ...f,
        file_url: res.file_url,
        file_name: file.name,
        file_size: file.size,
        title: f.title || file.name.replace(/\.pdf$/i, ''),
      }));
    } catch {
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!form.file_url) { toast.error('Please attach a PDF'); return; }
    createMutation.mutate({
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category.trim(),
      file_url: form.file_url,
      file_name: form.file_name,
      file_size: form.file_size,
      uploaded_by: user?.email,
      uploaded_by_name: user?.full_name || '',
    });
  };

  const categories = [...new Set(manuals.map(m => m.category).filter(Boolean))];
  const grouped = categories.length > 0
    ? categories.map(cat => ({ category: cat, items: manuals.filter(m => m.category === cat) }))
    : [{ category: null, items: manuals }];

  return (
    <div>
      <PageHeader
        title="Training Manuals"
        description="Reference documents and training materials"
        actions={
          canManage && (
            <Button onClick={() => setShowForm(true)} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              <Plus className="w-4 h-4" /> Upload Manual
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Card key={i} className="border-0 shadow-sm animate-pulse"><CardContent className="p-6"><div className="h-20 bg-slate-100 rounded" /></CardContent></Card>)}
        </div>
      ) : manuals.length === 0 ? (
        <EmptyState icon={BookMarked} title="No training manuals yet" description={canManage ? 'Upload PDF documents for your team to reference.' : 'Training materials will appear here once they are added.'} />
      ) : (
        <div className="space-y-8">
          {grouped.map(group => (
            <div key={group.category || 'all'}>
              {group.category && <h2 className="text-lg font-semibold text-slate-800 mb-4">{group.category}</h2>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.items.map(manual => (
                  <Card key={manual.id} className="border-0 shadow-sm hover:shadow-lg transition-all group">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-3">
                        <a href={manual.file_url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-6 h-6 text-rose-500" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center gap-1.5">
                              <span className="truncate">{manual.title}</span>
                              <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-400 flex-shrink-0" />
                            </h3>
                            {manual.description && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{manual.description}</p>}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-400">
                              {manual.file_name && <span className="truncate max-w-[12rem]">{manual.file_name}</span>}
                              {manual.file_size > 0 && <span>{formatBytes(manual.file_size)}</span>}
                              {manual.uploaded_by_name && <span>by {manual.uploaded_by_name}</span>}
                            </div>
                          </div>
                        </a>
                        {canManage && (
                          <button
                            onClick={() => deleteMutation.mutate(manual.id)}
                            className="p-1.5 rounded hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                            title="Delete manual"
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload Training Manual</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>PDF File</Label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="gap-2"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploading ? 'Uploading...' : 'Choose PDF'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {form.file_name && <span className="text-sm text-slate-600 truncate">{form.file_name}</span>}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Manual title" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description of what this manual covers" rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Onboarding, Safety, Operations" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || uploading || !form.file_url}
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Upload Manual
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}