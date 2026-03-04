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
import { Switch } from "@/components/ui/switch";
import ReactQuill from 'react-quill';
import { ArrowLeft, Save, Loader2, History, Users, User } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export default function SOPEditor() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAdmin, isSuperAdmin, isManager } = useCurrentUser();
  const canManage = isAdmin || isSuperAdmin || isManager;

  const [form, setForm] = useState({
    title: '', category: '', content: '', summary: '', tags: [], status: 'draft',
    version: 1, requires_acknowledgement: false, acknowledgement_due_days: 3,
    acknowledgement_assigned_emails: [], acknowledgement_assigned_teams: [],
  });
  const [tagsInput, setTagsInput] = useState('');
  const [changeSummary, setChangeSummary] = useState('');

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

  const isManagerOnly = isManager && !isAdmin && !isSuperAdmin;

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);

      // Managers submit for approval instead of directly saving
      if (isManagerOnly && id) {
        return base44.entities.SOP.update(id, {
          pending_content: data.content,
          pending_summary: data.summary,
          pending_tags: tags,
          pending_change_summary: changeSummary || 'Manager update',
          pending_submitted_by: user?.email,
          pending_submitted_by_name: user?.full_name,
          status: 'pending_approval',
        });
      }

      const sopData = { ...data, tags, last_updated_by: user?.email, last_updated_by_name: user?.full_name };

      let result;
      if (id) {
        result = await base44.entities.SOP.update(id, sopData);
      } else {
        result = await base44.entities.SOP.create(sopData);
      }

      // Save a version snapshot
      const sopId = id || result.id;
      await base44.entities.SOPVersion.create({
        sop_id: sopId,
        version_number: sopData.version,
        title: sopData.title,
        content: sopData.content,
        summary: sopData.summary,
        tags: sopData.tags,
        category: sopData.category,
        change_summary: changeSummary || (id ? 'Updated' : 'Initial version'),
        created_by_name: user?.full_name,
      });

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sops'] });
      queryClient.invalidateQueries({ queryKey: ['sop-versions'] });
      if (isManagerOnly && id) {
        toast.success('Edit submitted for admin approval');
      } else {
        toast.success(id ? 'SOP updated' : 'SOP created');
      }
      navigate(createPageUrl('SOPs'));
    },
  });

  if (!id && !isAdmin) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Only admins can create new SOPs</p>
        <Link to={createPageUrl('SOPs')}><Button variant="ghost" className="mt-4">Back to SOPs</Button></Link>
      </div>
    );
  }

  if (id && !canManage) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">You don't have permission to edit SOPs</p>
        <Link to={createPageUrl('SOPs')}><Button variant="ghost" className="mt-4">Back to SOPs</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Link to={createPageUrl('SOPs')}>
          <Button variant="ghost" className="gap-2 text-slate-600"><ArrowLeft className="w-4 h-4" /> Back</Button>
        </Link>
        {id && (
          <Link to={createPageUrl('SOPVersions') + `?id=${id}`}>
            <Button variant="outline" className="gap-2"><History className="w-4 h-4" /> Version History</Button>
          </Link>
        )}
      </div>

      <PageHeader title={id ? 'Edit SOP' : 'Create New SOP'} />

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="SOP Title" /></div>
            <div className="space-y-2"><Label>Category</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Safety, Operations" /></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })} disabled={isManagerOnly && !!id}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  {!isManagerOnly && <SelectItem value="published">Published</SelectItem>}
                  {!isManagerOnly && <SelectItem value="archived">Archived</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Version</Label><Input type="number" value={form.version} onChange={e => setForm({ ...form, version: Number(e.target.value) })} /></div>
          </div>

          <div className="space-y-2"><Label>Summary</Label><Textarea value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} placeholder="Brief description for AI search" rows={2} /></div>
          <div className="space-y-2"><Label>Tags (comma separated)</Label><Input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="safety, kennel, opening" /></div>

          {id && (
            <div className="space-y-2">
              <Label>Change Summary <span className="text-slate-400 text-xs">(what changed?)</span></Label>
              <Input value={changeSummary} onChange={e => setChangeSummary(e.target.value)} placeholder="e.g. Updated step 3 with new sanitizer protocol" />
            </div>
          )}

          <div className="flex items-center gap-4 p-4 bg-amber-50 rounded-xl border border-amber-100">
            <Switch
              checked={form.requires_acknowledgement}
              onCheckedChange={v => setForm({ ...form, requires_acknowledgement: v })}
            />
            <div>
              <p className="font-medium text-sm text-amber-900">Require Staff Acknowledgement</p>
              <p className="text-xs text-amber-700">Staff must confirm they've read this SOP when published or updated</p>
            </div>
            {form.requires_acknowledgement && (
              <div className="ml-auto flex items-center gap-2">
                <Label className="text-xs">Days to acknowledge</Label>
                <Input type="number" value={form.acknowledgement_due_days} onChange={e => setForm({ ...form, acknowledgement_due_days: Number(e.target.value) })} className="w-16 h-8 text-sm" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Content</Label>
            <div className="min-h-[300px]">
              <ReactQuill value={form.content} onChange={v => setForm({ ...form, content: v })} className="bg-white rounded-lg" theme="snow" />
            </div>
          </div>

          {isManagerOnly && id && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <strong>Note:</strong> Your edits will be submitted for admin approval before going live.
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <Link to={createPageUrl('SOPs')}><Button variant="outline">Cancel</Button></Link>
            <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isManagerOnly && id ? 'Submit for Approval' : id ? 'Update SOP' : 'Create SOP'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}