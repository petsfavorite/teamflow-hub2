import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import PageHeader from '../components/shared/PageHeader';
import EmptyState from '../components/shared/EmptyState';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ExternalLink, Plus, Globe, Trash2, Pencil, Loader2, FileText, Upload } from 'lucide-react';
import { toast } from "sonner";
import { useRef } from 'react';

export default function ExternalLinks() {
  const { isAdmin, isSuperAdmin } = useCurrentUser();
  const canEdit = isAdmin || isSuperAdmin;
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [form, setForm] = useState({ title: '', url: '', description: '', icon: '🔗', category: '' });

  // PDF Library state
  const [showPDFForm, setShowPDFForm] = useState(false);
  const [editingPDF, setEditingPDF] = useState(null);
  const [pdfForm, setPdfForm] = useState({ title: '', description: '', category: '', file_url: '' });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const { data: links = [], isLoading } = useQuery({
    queryKey: ['external-links'],
    queryFn: () => base44.entities.ExternalLink.list('order', 100),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editingLink
      ? base44.entities.ExternalLink.update(editingLink.id, data)
      : base44.entities.ExternalLink.create(data),
    onSuccess: () => {
      toast.success(editingLink ? 'Link updated' : 'Link added');
      queryClient.invalidateQueries({ queryKey: ['external-links'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ExternalLink.delete(id),
    onSuccess: () => {
      toast.success('Link removed');
      queryClient.invalidateQueries({ queryKey: ['external-links'] });
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingLink(null);
    setForm({ title: '', url: '', description: '', icon: '🔗', category: '' });
  };

  const startEdit = (link) => {
    setEditingLink(link);
    setForm(link);
    setShowForm(true);
  };

  const categories = [...new Set(links.map(l => l.category).filter(Boolean))];
  const grouped = categories.length > 0
    ? categories.map(cat => ({ category: cat, links: links.filter(l => l.category === cat) }))
    : [{ category: null, links }];

  // PDF queries & mutations
  const { data: pdfs = [], isLoading: pdfsLoading } = useQuery({
    queryKey: ['pdf-documents'],
    queryFn: () => base44.entities.PDFDocument.list('order', 100),
  });

  const savePDFMutation = useMutation({
    mutationFn: (data) => editingPDF
      ? base44.entities.PDFDocument.update(editingPDF.id, data)
      : base44.entities.PDFDocument.create(data),
    onSuccess: () => {
      toast.success(editingPDF ? 'PDF updated' : 'PDF added');
      queryClient.invalidateQueries({ queryKey: ['pdf-documents'] });
      resetPDFForm();
    },
  });

  const deletePDFMutation = useMutation({
    mutationFn: (id) => base44.entities.PDFDocument.delete(id),
    onSuccess: () => {
      toast.success('PDF removed');
      queryClient.invalidateQueries({ queryKey: ['pdf-documents'] });
    },
  });

  const resetPDFForm = () => {
    setShowPDFForm(false);
    setEditingPDF(null);
    setPdfForm({ title: '', description: '', category: '', file_url: '' });
  };

  const startEditPDF = (pdf) => {
    setEditingPDF(pdf);
    setPdfForm(pdf);
    setShowPDFForm(true);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setPdfForm(f => ({ ...f, file_url }));
    setUploading(false);
    toast.success('File uploaded');
  };

  const pdfCategories = [...new Set(pdfs.map(p => p.category).filter(Boolean))];
  const groupedPDFs = pdfCategories.length > 0
    ? pdfCategories.map(cat => ({ category: cat, pdfs: pdfs.filter(p => p.category === cat) }))
    : [{ category: null, pdfs }];

  return (
    <div>
      <PageHeader
        title="App Links"
        description="Quick access to business applications"
        actions={
          canEdit && (
            <Button onClick={() => setShowForm(true)} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              <Plus className="w-4 h-4" /> Add Link
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Card key={i} className="border-0 shadow-sm animate-pulse"><CardContent className="p-6"><div className="h-16 bg-slate-100 rounded" /></CardContent></Card>)}
        </div>
      ) : links.length === 0 ? (
        <EmptyState icon={Globe} title="No app links yet" description="Add links to business applications for quick access" />
      ) : (
        <div className="space-y-8">
          {grouped.map(group => (
            <div key={group.category || 'all'}>
              {group.category && <h2 className="text-lg font-semibold text-slate-800 mb-4">{group.category}</h2>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.links.map(link => (
                  <Card key={link.id} className="border-0 shadow-sm hover:shadow-lg transition-all group">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-2xl flex-shrink-0">
                            {link.icon || '🔗'}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center gap-1.5">
                              {link.title}
                              <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-400" />
                            </h3>
                            {link.description && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{link.description}</p>}
                          </div>
                        </a>
                        {canEdit && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                            <button onClick={() => startEdit(link)} className="p-1.5 rounded hover:bg-slate-100"><Pencil className="w-3.5 h-3.5 text-slate-400" /></button>
                            <button onClick={() => deleteMutation.mutate(link.id)} className="p-1.5 rounded hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                          </div>
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

      {/* PDF Library Section */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><FileText className="w-5 h-5 text-amber-500" /> PDF Library</h2>
            <p className="text-sm text-slate-500 mt-0.5">Documents and reference materials</p>
          </div>
          {canEdit && (
            <Button onClick={() => setShowPDFForm(true)} className="bg-amber-500 hover:bg-amber-600 gap-2">
              <Plus className="w-4 h-4" /> Add PDF
            </Button>
          )}
        </div>

        {pdfsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => <Card key={i} className="border-0 shadow-sm animate-pulse"><CardContent className="p-5"><div className="h-14 bg-slate-100 rounded" /></CardContent></Card>)}
          </div>
        ) : pdfs.length === 0 ? (
          <EmptyState icon={FileText} title="No PDFs yet" description="Upload documents for quick reference" />
        ) : (
          <div className="space-y-6">
            {groupedPDFs.map(group => (
              <div key={group.category || 'all'}>
                {group.category && <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">{group.category}</h3>}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.pdfs.map(pdf => (
                    <Card key={pdf.id} className="border-0 shadow-sm hover:shadow-lg transition-all group">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                          <a href={pdf.file_url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                              <FileText className="w-5 h-5 text-amber-500" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-semibold text-slate-900 group-hover:text-amber-600 transition-colors flex items-center gap-1.5">
                                {pdf.title}
                                <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-amber-400" />
                              </h3>
                              {pdf.description && <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{pdf.description}</p>}
                            </div>
                          </a>
                          {canEdit && (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                              <button onClick={() => startEditPDF(pdf)} className="p-1.5 rounded hover:bg-slate-100"><Pencil className="w-3.5 h-3.5 text-slate-400" /></button>
                              <button onClick={() => deletePDFMutation.mutate(pdf.id)} className="p-1.5 rounded hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                            </div>
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
      </div>

      {/* PDF Upload Dialog */}
      <Dialog open={showPDFForm} onOpenChange={resetPDFForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingPDF ? 'Edit PDF' : 'Add PDF'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={pdfForm.title} onChange={e => setPdfForm({ ...pdfForm, title: e.target.value })} placeholder="Document name" />
            </div>
            <div className="space-y-2">
              <Label>PDF File</Label>
              <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
              {pdfForm.file_url ? (
                <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <FileText className="w-4 h-4 text-amber-600" />
                  <span className="text-sm text-amber-700 flex-1 truncate">File uploaded</span>
                  <button onClick={() => fileInputRef.current.click()} className="text-xs text-amber-600 underline">Replace</button>
                </div>
              ) : (
                <Button type="button" variant="outline" onClick={() => fileInputRef.current.click()} disabled={uploading} className="w-full gap-2">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploading ? 'Uploading...' : 'Upload PDF'}
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={pdfForm.description} onChange={e => setPdfForm({ ...pdfForm, description: e.target.value })} placeholder="Brief description" />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={pdfForm.category} onChange={e => setPdfForm({ ...pdfForm, category: e.target.value })} placeholder="e.g. HR, Safety, Training" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetPDFForm}>Cancel</Button>
            <Button onClick={() => savePDFMutation.mutate(pdfForm)} disabled={savePDFMutation.isPending || !pdfForm.file_url || !pdfForm.title} className="bg-amber-500 hover:bg-amber-600 gap-2">
              {savePDFMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {editingPDF ? 'Update' : 'Add'} PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showForm} onOpenChange={resetForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingLink ? 'Edit Link' : 'Add App Link'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Icon</Label>
                <Input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} placeholder="🔗" className="text-center text-xl" />
              </div>
              <div className="col-span-3 space-y-2">
                <Label>Title</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="App name" />
              </div>
            </div>
            <div className="space-y-2"><Label>URL</Label><Input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://..." /></div>
            <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description" /></div>
            <div className="space-y-2"><Label>Category</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Communication, Accounting" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {editingLink ? 'Update' : 'Add'} Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}