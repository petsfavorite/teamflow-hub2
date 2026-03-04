import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import PageHeader from '../components/shared/PageHeader';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ReactQuill from 'react-quill';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { toast } from "sonner";

export default function SOPEditor() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin, canManage } = useCurrentUser();

  const [form, setForm] = useState({
    title: '', category: '', content: '', summary: '', tags: [], status: 'draft', version: 1
  });
  const [tagsInput, setTagsInput] = useState('');

  const { data: existing } = useQuery({
    queryKey: ['sop-edit', id],
    queryFn: async () => {
      const list = await base44.entities.SOP.filter({ id });
      return list[0];
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (existing) {
      setForm(existing);
      setTagsInput(existing.tags?.join(', ') || '');
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (id) {
        return base44.entities.SOP.update(id, data);
      }
      return base44.entities.SOP.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sops'] });
      toast.success(id ? 'SOP updated' : 'SOP created');
      navigate(createPageUrl('SOPs'));
    },
  });

  const handleSave = () => {
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    saveMutation.mutate({ ...form, tags });
  };

  // Admins can create new SOPs, managers can only edit
  if (!id && !isAdmin) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Only admins can create new SOPs</p>
        <Link to={createPageUrl('SOPs')}>
          <Button variant="ghost" className="mt-4">Back to SOPs</Button>
        </Link>
      </div>
    );
  }

  if (id && !canManage) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">You don't have permission to edit SOPs</p>
        <Link to={createPageUrl('SOPs')}>
          <Button variant="ghost" className="mt-4">Back to SOPs</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Link to={createPageUrl('SOPs')}>
          <Button variant="ghost" className="gap-2 text-slate-600">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        </Link>
      </div>

      <PageHeader title={id ? 'Edit SOP' : 'Create New SOP'} />

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="SOP Title" />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Safety, Operations" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Version</Label>
              <Input type="number" value={form.version} onChange={e => setForm({ ...form, version: Number(e.target.value) })} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Summary</Label>
            <Textarea value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} placeholder="Brief description for search" rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Tags (comma separated)</Label>
            <Input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="safety, kitchen, opening" />
          </div>

          <div className="space-y-2">
            <Label>Content</Label>
            <div className="min-h-[300px]">
              <ReactQuill
                value={form.content}
                onChange={v => setForm({ ...form, content: v })}
                className="bg-white rounded-lg"
                theme="snow"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Link to={createPageUrl('SOPs')}>
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {id ? 'Update SOP' : 'Create SOP'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}