import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getUserDisplayName } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import ReactQuill from 'react-quill';
import { ArrowLeft, Save, Loader2, History, Users, User, Video, AlertTriangle, UserCheck, CheckCircle2, CalendarCheck, X, Plus, Tag, Archive, Link2, ShieldAlert, RotateCcw, CornerUpLeft, FileText } from 'lucide-react';
import SOPAIImporter from '../components/sop/SOPAIImporter';
import SOPDocumentUpload from '../components/sop/SOPDocumentUpload';
import SOPPublishDialog from '../components/sop/SOPPublishDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { formatDate, addDaysStr, daysFromToday } from '@/lib/timezone';
import {
  SOP_CONTENT_FIELDS, SOP_MATERIAL_FIELDS, VERIFICATION_INTERVAL_DAYS, pick, fieldsDiffer, sopBody,
  isLive, pendingState, getPendingFields, publishStamp, recordVersion, fetchLiveSops, manageSop, CLEARED_PENDING,
} from '@/lib/sop';

const MAX_VERIFICATION_DAYS = VERIFICATION_INTERVAL_DAYS;

const DEFAULT_FORM = {
  title: '', category: '', purpose: '', when_it_applies: '', required_tools: '',
  instructions: '', video_url: '', document_url: '', warnings: '', responsible_role: '',
  applicable_teams: [], summary: '', tags: [], status: 'draft', version: 1,
  requires_acknowledgement: false, acknowledgement_due_days: 5,
  acknowledgement_assigned_emails: [], acknowledgement_assigned_teams: [],
  related_sop_ids: [], verification_due_date: '',
  content: '',
};

export default function SOPEditor() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: userLoading, isAdmin, isSuperAdmin, isManager, can } = useCurrentUser();
  const canManage = isAdmin || isSuperAdmin || isManager;

  const [form, setForm] = useState(DEFAULT_FORM);
  const [tagsInput, setTagsInput] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnNote, setReturnNote] = useState('');
  const [relatedSearch, setRelatedSearch] = useState('');
  const [savedDraft, setSavedDraft] = useState(null);
  const [initialForm, setInitialForm] = useState(null);
  const initRef = useRef(false);
  const draftKey = `sop-draft:${id || 'new'}`;

  // SOPs are never deleted; archiving hides them from staff while managers and above can still see them.
  const archiveMutation = useMutation({
    mutationFn: () => manageSop('archive', { id }),
    onSuccess: () => {
      ['sops-all', 'sops', 'sops-live', 'all-sops-dash', 'draft-sops', 'sops-pending-ack', 'sops-pending-ack-dash']
        .forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      toast.success('SOP archived');
      navigate(createPageUrl('SOPs'));
    },
    onError: (e) => toast.error('Could not archive the SOP: ' + (e?.message || 'unknown error')),
  });

  // Publish: admin publishes a draft SOP directly. 90-day verification cycle starts automatically.
  const publishMutation = useMutation({
    mutationFn: async (ackSettings) => {
      const now = new Date().toISOString();
      // If an admin publishes a draft they didn't create, the original author must acknowledge it.
      let effectiveAck = { ...ackSettings };
      if (id && existing?.created_by_id && existing.created_by_id !== user?.id) {
        const creator = allUsers.find(u => u.id === existing.created_by_id);
        if (creator?.email) {
          const emails = new Set([...(ackSettings.acknowledgement_assigned_emails || []), creator.email]);
          effectiveAck = { ...ackSettings, requires_acknowledgement: true, acknowledgement_assigned_emails: [...emails] };
        }
      }
      const fields = { ...pick({ ...form, ...effectiveAck }, SOP_CONTENT_FIELDS), tags: currentTags };
      const who = { email: user?.email, name: getUserDisplayName(user) };
      const sopData = {
        ...fields,
        content: fields.instructions,
        status: 'published',
        last_updated_by: user?.email,
        last_updated_by_name: getUserDisplayName(user),
        ...CLEARED_PENDING,
        ...publishStamp(who),
      };
      sopData.version = existing?.version || 1;
      const result = id ? await base44.entities.SOP.update(id, sopData) : await base44.entities.SOP.create(sopData);
      const sopId = id || result.id;
      await recordVersion(sopId, sopData.version, sopData, changeSummary || 'Published', getUserDisplayName(user));
      return { version: sopData.version, requires_acknowledgement: !!effectiveAck.requires_acknowledgement };
    },
    onSuccess: (res) => {
      ['sops-all', 'sops', 'sop-versions', 'sops-live', 'all-sops-dash', 'sops-pending-ack', 'sops-pending-ack-dash', 'draft-sops']
        .forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      queryClient.invalidateQueries({ queryKey: ['sop', id] });
      queryClient.invalidateQueries({ queryKey: ['sop-edit', id] });
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      toast.success(`SOP published as v${res.version}${res.requires_acknowledgement ? ' — staff will be asked to acknowledge' : ''}`);
      navigate(createPageUrl('SOPDetail') + `?id=${id}`);
    },
    onError: (e) => toast.error('Could not publish the SOP: ' + (e?.message || 'unknown error')),
  });

  // Return (send back): admin returns a draft to its creator with a note.
  const returnMutation = useMutation({
    mutationFn: async (note) => {
      const res = await base44.functions.invoke('approveContent', { type: 'sop', id, action: 'send_back', note });
      return res?.data ?? res;
    },
    onSuccess: () => {
      toast.success('Draft sent back to the creator');
      navigate(createPageUrl('SOPs'));
    },
    onError: (e) => toast.error('Could not send the draft back: ' + (e?.message || 'unknown error')),
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list('name', 100),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users-sop'],
    queryFn: () => base44.entities.User.list('first_name', 500),
  });

  const { data: sopCategories = [] } = useQuery({
    queryKey: ['sop-categories'],
    queryFn: () => base44.entities.SOPCategory.list('order', 200),
  });

  const { data: sopTags = [], refetch: refetchTags } = useQuery({
    queryKey: ['sop-tags'],
    queryFn: () => base44.entities.SOPTag.list('name', 200),
  });

  const [newTagInput, setNewTagInput] = useState('');
  const [addingTag, setAddingTag] = useState(false);

  const handleAddTag = async () => {
    const trimmed = newTagInput.trim().toLowerCase();
    if (!trimmed) return;
    setAddingTag(true);
    await base44.entities.SOPTag.create({ name: trimmed });
    await refetchTags();
    setNewTagInput('');
    setAddingTag(false);
  };

  const handleDeleteTag = async (tagId) => {
    await base44.entities.SOPTag.delete(tagId);
    await refetchTags();
  };

  const toggleFormTag = (tagName) => {
    const current = form.tags || [];
    const updated = current.includes(tagName) ? current.filter(t => t !== tagName) : [...current, tagName];
    set('tags', updated);
    setTagsInput(updated.join(', '));
  };

  const { data: existing, isFetching: existingFetching } = useQuery({
    queryKey: ['sop-edit', id],
    queryFn: async () => {
      const list = await base44.entities.SOP.filter({ id });
      return list[0];
    },
    enabled: !!id,
    refetchOnMount: 'always', // never start editing from a stale cached copy
  });

  const isManagerOnly = isManager && !isAdmin && !isSuperAdmin;

  const { data: liveSops = [] } = useQuery({
    queryKey: ['sops-live'],
    queryFn: () => fetchLiveSops(500),
  });

  // What is live right now (legacy SOPs keep their text in `content`).
  const liveBaseline = useMemo(
    () => (existing ? { ...DEFAULT_FORM, ...existing, instructions: sopBody(existing), status: existing.status === 'pending_approval' ? 'published' : existing.status } : DEFAULT_FORM),
    [existing]
  );
  const existingPendingState = existing ? pendingState(existing) : null;

  // Initialise the form once (a background refetch must never overwrite what is being typed).
  useEffect(() => {
    if (initRef.current || userLoading) return;
    if (id && (!existing || existingFetching)) return;
    initRef.current = true;
    let base = { ...liveBaseline };
    if (isManagerOnly && existing && existingPendingState) {
      // Managers pick up their own previous submission (e.g. after changes were requested).
      base = { ...base, ...getPendingFields(existing) };
    }
    setForm(base);
    setTagsInput((base.tags || []).join(', '));
    setInitialForm(base);
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        if (d?.form && (!existing || new Date(d.savedAt) > new Date(existing.updated_date))) setSavedDraft(d);
      }
    } catch { /* storage unavailable */ }
  }, [existing, existingFetching, id, userLoading, isManagerOnly, liveBaseline, existingPendingState, draftKey]);

  const currentTags = useMemo(() => tagsInput.split(',').map(t => t.trim()).filter(Boolean), [tagsInput]);

  // Autosave an unsaved draft locally so a refresh / navigation doesn't lose work.
  useEffect(() => {
    if (!initRef.current || !initialForm) return;
    const timer = setTimeout(() => {
      try {
        const dirty = JSON.stringify({ ...form, tags: currentTags }) !== JSON.stringify({ ...initialForm, tags: initialForm.tags || [] });
        if (dirty) localStorage.setItem(draftKey, JSON.stringify({ form, tagsInput, savedAt: new Date().toISOString() }));
        else localStorage.removeItem(draftKey);
      } catch { /* storage unavailable */ }
    }, 800);
    return () => clearTimeout(timer);
  }, [form, tagsInput, currentTags, initialForm, draftKey]);

  const restoreDraft = () => {
    setForm(savedDraft.form);
    setTagsInput(savedDraft.tagsInput || '');
    setSavedDraft(null);
  };
  const discardDraft = () => {
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    setSavedDraft(null);
  };

  // Verification: SOPs are re-verified every 90 days automatically. A manager may pull the date
  // earlier, but the date is only validated when it was actually changed (an overdue SOP must still be editable).
  const verificationChanged = (form.verification_due_date || '') !== (liveBaseline.verification_due_date || '');
  const verificationDaysOut = form.verification_due_date ? daysFromToday(form.verification_due_date) : null;
  const verificationError = verificationChanged && verificationDaysOut !== null && (verificationDaysOut < 1 || verificationDaysOut > MAX_VERIFICATION_DAYS);

  const wasLive = !!existing && isLive(existing);
  const managerSubmitsEdit = isManagerOnly && !!id && wasLive;
  const hasChanges = !existing || fieldsDiffer({ ...form, tags: currentTags }, liveBaseline, SOP_CONTENT_FIELDS) || form.status !== liveBaseline.status || verificationChanged;
  const needsChangeSummary = !!id && hasChanges && wasLive && (managerSubmitsEdit || form.status === 'published');
  const missingChangeSummary = needsChangeSummary && !changeSummary.trim();
  const missingRequired = !form.title.trim() || !form.category.trim();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const fields = { ...pick(form, SOP_CONTENT_FIELDS), tags: currentTags };
      const who = { email: user?.email, name: getUserDisplayName(user) };

      // Manager edit of a live SOP: the live version stays untouched until an admin approves.
      if (managerSubmitsEdit) {
        await manageSop('submit_edit', { id, fields, change_summary: changeSummary });
        return { submitted: true };
      }

      // Managers can only save drafts (server-enforced); they never publish, restore or edit a live SOP directly.
      if (isManagerOnly) {
        const saved = await manageSop('save_draft', { id, fields, change_summary: changeSummary });
        const draftData = { ...fields, content: fields.instructions, status: 'draft' };
        await recordVersion(saved.id, saved.version || 1, draftData, changeSummary || (id ? 'Updated' : 'Initial version'), getUserDisplayName(user));
        return { bumped: false, version: saved.version || 1 };
      }

      const goingLive = form.status === 'published';
      const sopData = {
        ...fields,
        content: fields.instructions,
        status: form.status,
        last_updated_by: user?.email,
        last_updated_by_name: getUserDisplayName(user),
      };
      if (form.status === 'archived') Object.assign(sopData, CLEARED_PENDING);
      if (form.verification_due_date) sopData.verification_due_date = form.verification_due_date;

      // The version number is managed automatically: every approved edit of a live SOP is a new version.
      let version = existing?.version || 1;
      let bumped = false;
      if (wasLive && goingLive && fieldsDiffer(fields, liveBaseline, SOP_MATERIAL_FIELDS)) {
        version += 1;
        bumped = true;
      }
      if (bumped || (goingLive && !wasLive)) Object.assign(sopData, publishStamp(who));
      sopData.version = version;

      const result = id ? await base44.entities.SOP.update(id, sopData) : await base44.entities.SOP.create(sopData);
      const sopId = id || result.id;
      // Only write version history when a version is created or a draft is saved (not for settings-only tweaks).
      if (bumped || !wasLive) {
        await recordVersion(sopId, version, sopData, changeSummary || (id ? 'Updated' : 'Initial version'), getUserDisplayName(user));
      }
      return { bumped, version };
    },
    onSuccess: (res) => {
      ['sops-all', 'sops', 'sop-versions', 'sops-live', 'all-sops-dash', 'sops-pending-ack', 'sops-pending-ack-dash', 'draft-sops']
        .forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      queryClient.invalidateQueries({ queryKey: ['sop', id] });
      queryClient.invalidateQueries({ queryKey: ['sop-edit', id] });
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      if (res.submitted) toast.success('Edit submitted for admin approval — the current version stays live until it is approved');
      else if (res.bumped) toast.success(`SOP updated to v${res.version}${form.requires_acknowledgement ? ' — staff will be asked to re-acknowledge' : ''}`);
      else toast.success(id ? 'SOP saved' : 'SOP created');
      navigate(createPageUrl(id ? 'SOPDetail' : 'SOPs') + (id ? `?id=${id}` : ''));
    },
    onError: (e) => toast.error('Could not save the SOP: ' + (e?.message || 'unknown error')),
  });

  if (!id && !can('sop.create')) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Only admins and managers can create new SOPs</p>
        <Link to={createPageUrl('SOPs')}><Button variant="ghost" className="mt-4">Back to SOPs</Button></Link>
      </div>
    );
  }

  if (id && !can('sop.update') && !can('sop.submit_review')) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">You don't have permission to edit SOPs</p>
        <Link to={createPageUrl('SOPs')}><Button variant="ghost" className="mt-4">Back to SOPs</Button></Link>
      </div>
    );
  }

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <Link to={createPageUrl('SOPs')}>
          <Button variant="ghost" className="gap-2 text-slate-600"><ArrowLeft className="w-4 h-4" /> Back</Button>
        </Link>
        <div className="flex gap-2 flex-wrap">
          {id && (
            <Link to={createPageUrl('SOPVersions') + `?id=${id}`}>
              <Button variant="outline" className="gap-2"><History className="w-4 h-4" /> Version History</Button>
            </Link>
          )}
          {/* Admin draft actions: Return (send back to creator) and Publish */}
          {id && (isAdmin || isSuperAdmin) && existing?.status === 'draft' && !managerSubmitsEdit && (
            <>
              <Button variant="outline" onClick={() => setReturnOpen(true)} className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50">
                <CornerUpLeft className="w-4 h-4" /> Return
              </Button>
              <Button onClick={() => setPublishOpen(true)} disabled={missingRequired} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                <CheckCircle2 className="w-4 h-4" /> Publish
              </Button>
            </>
          )}
        </div>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 mb-6">{id ? 'Edit SOP' : 'Create New SOP'}</h1>

      {savedDraft && (
        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-900 mb-6 flex items-center gap-3 flex-wrap">
          <RotateCcw className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">You have unsaved changes from {formatDate(savedDraft.savedAt, 'M/D/YYYY h:mm A')}. Restore them?</span>
          <Button size="sm" onClick={restoreDraft} className="bg-indigo-600 hover:bg-indigo-700">Restore</Button>
          <Button size="sm" variant="outline" onClick={discardDraft}>Discard</Button>
        </div>
      )}

      {isManagerOnly && existingPendingState === 'changes_requested' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-900 mb-6">
          <p className="font-semibold flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Changes requested{existing?.pending_reviewed_by_name ? ` by ${existing.pending_reviewed_by_name}` : ''}</p>
          {existing?.pending_review_note && <p className="mt-1 whitespace-pre-wrap">"{existing.pending_review_note}"</p>}
          <p className="mt-2 text-red-700">Your previous submission is loaded below. Make the requested changes and resubmit. The current approved version stays live in the meantime.</p>
        </div>
      )}

      {isManagerOnly && existingPendingState === 'submitted' && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900 mb-6">
          You already have an edit waiting for admin review (loaded below). Submitting again replaces it.
        </div>
      )}

      {!isManagerOnly && existingPendingState === 'submitted' && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900 mb-6">
          A manager's edit is waiting for review. <Link className="underline font-medium" to={createPageUrl('SOPDetail') + `?id=${id}`}>Review it on the SOP page</Link> before changing the live version here, otherwise your changes and theirs may overlap.
        </div>
      )}

      {/* AI Importer — only for new SOPs */}
      {!id && (
        <SOPAIImporter
          sopTags={sopTags}
          hasExistingContent={!!(form.title.trim() || form.category.trim() || form.summary.trim() || form.purpose.trim() || form.instructions.replace(/<[^>]*>/g, '').trim())}
          onFill={(data) => {
            setForm(f => ({ ...f, ...data }));
            if (data.tags) setTagsInput(data.tags.join(', '));
          }}
        />
      )}

      {/* Header Info */}
      <Card className="border-0 shadow-sm mb-8">
        <CardHeader className="pb-2"><CardTitle className="text-base text-slate-700">Header Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Title *</Label><Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="SOP Title" /></div>
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={v => set('category', v)}>
                <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                <SelectContent>
                  {sopCategories.map(cat => (
                    <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                  ))}
                  {form.category && !sopCategories.some(c => c.name === form.category) && (
                    <SelectItem value={form.category}>{form.category}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {sopCategories.length === 0 && (
                <p className="text-xs text-slate-400">No categories yet — create them under Administration → SOP Categories.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v)} disabled={isManagerOnly && !!id}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  {!isManagerOnly && <SelectItem value="published">Published</SelectItem>}
                  {(!isManagerOnly || form.status === 'archived') && <SelectItem value="archived">Archived</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Version</Label>
              <Input value={`v${form.version || 1}`} disabled />
              <p className="text-xs text-slate-400">Updates automatically each time an edit is approved.</p>
            </div>
          </div>

          {/* Applicable Teams */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Applicable Teams</Label>
            <div className="flex flex-wrap gap-2">
              {teams.map(team => (
                <label key={team.id} className="flex items-center gap-1.5 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100">
                  <Checkbox
                    checked={(form.applicable_teams || []).includes(team.id)}
                    onCheckedChange={checked => {
                      const curr = form.applicable_teams || [];
                      set('applicable_teams', checked ? [...curr, team.id] : curr.filter(t => t !== team.id));
                    }}
                  />
                  <span className="text-sm text-slate-700">{team.name}</span>
                </label>
              ))}
              {teams.length === 0 && <p className="text-xs text-slate-400">No teams created yet</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> Tags</Label>
            <div className="flex flex-wrap gap-2 p-3 border border-slate-200 rounded-lg bg-slate-50 min-h-[48px]">
              {sopTags.map(tag => {
                const selected = (form.tags || []).includes(tag.name);
                return (
                  <div key={tag.id} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${selected ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'}`}>
                    <span onClick={() => toggleFormTag(tag.name)}>{tag.name}</span>
                    {can('tag.delete') && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag.id); }}
                        className={`ml-0.5 rounded-full hover:bg-black/10 p-0.5 ${selected ? 'text-indigo-200 hover:text-white' : 'text-slate-400 hover:text-red-500'}`}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              {sopTags.length === 0 && <p className="text-xs text-slate-400">No tags yet</p>}
            </div>
            {can('tag.create') && (
              <div className="flex gap-2">
                <Input
                  value={newTagInput}
                  onChange={e => setNewTagInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                  placeholder="Create new tag..."
                  className="h-8 text-sm"
                />
                <Button size="sm" variant="outline" onClick={handleAddTag} disabled={addingTag || !newTagInput.trim()} className="gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-2"><Label>Summary <span className="text-slate-400 text-xs">(brief description for search)</span></Label><Textarea value={form.summary} onChange={e => set('summary', e.target.value)} placeholder="One sentence summary" rows={2} /></div>

          {id && (
            <div className="space-y-2">
              <Label>Change Summary {needsChangeSummary ? <span className="text-red-500">*</span> : null} <span className="text-slate-400 text-xs">(what changed?{needsChangeSummary ? ' — required for edits to a live SOP' : ''})</span></Label>
              <Input value={changeSummary} onChange={e => setChangeSummary(e.target.value)} placeholder="e.g. Updated step 3 with new sanitizer protocol" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* SOP Content */}
      <Card className="border-0 shadow-sm mb-8">
        <CardHeader className="pb-2"><CardTitle className="text-base text-slate-700">SOP Content</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Purpose *</Label>
            <Textarea value={form.purpose} onChange={e => set('purpose', e.target.value)} placeholder="Why does this SOP exist? What problem does it solve?" rows={3} />
          </div>

          <div className="space-y-2">
            <Label>When It Applies</Label>
            <Textarea value={form.when_it_applies} onChange={e => set('when_it_applies', e.target.value)} placeholder="Under what conditions or situations should this SOP be followed?" rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Required Tools / Materials</Label>
            <Textarea value={form.required_tools} onChange={e => set('required_tools', e.target.value)} placeholder="List any tools, equipment, or materials needed" rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Step-by-Step Instructions *</Label>
            <div className="min-h-[300px] border border-slate-200 rounded-lg overflow-hidden">
              <ReactQuill
                value={form.instructions}
                onChange={v => set('instructions', v)}
                className="bg-white"
                theme="snow"
                modules={{
                  toolbar: [
                    [{ header: [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline'],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    [{ indent: '-1' }, { indent: '+1' }],
                    ['blockquote', 'code-block'],
                    ['link'],
                    ['clean'],
                  ],
                }}
                formats={['header', 'bold', 'italic', 'underline', 'list', 'bullet', 'indent', 'blockquote', 'code-block', 'link']}
                style={{ minHeight: '280px' }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Video className="w-3.5 h-3.5" /> Video URL <span className="text-slate-400 text-xs font-normal">(optional)</span></Label>
            <Input value={form.video_url} onChange={e => set('video_url', e.target.value)} placeholder="https://youtube.com/..." />
          </div>

          <SOPDocumentUpload value={form.document_url} onChange={v => set('document_url', v)} />

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-amber-700"><AlertTriangle className="w-3.5 h-3.5" /> Warnings / Cautions</Label>
            <Textarea value={form.warnings} onChange={e => set('warnings', e.target.value)} placeholder="Any safety warnings, hazards, or important cautions" rows={2} className="border-amber-200 focus-visible:ring-amber-400" />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5" /> Who Is Responsible</Label>
            <Select value={form.responsible_role} onValueChange={v => set('responsible_role', v)}>
              <SelectTrigger><SelectValue placeholder="Select a team or person" /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Teams</SelectLabel>
                  {teams.map(t => (
                    <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Individuals</SelectLabel>
                  {allUsers.map(u => {
                    const name = (u.first_name || u.last_name) ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : u.email;
                    return <SelectItem key={u.id} value={name}>{name}</SelectItem>;
                  })}
                </SelectGroup>
                {form.responsible_role && !teams.some(t => t.name === form.responsible_role) && !allUsers.some(u => {
                  const name = (u.first_name || u.last_name) ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : u.email;
                  return name === form.responsible_role;
                }) && (
                  <SelectItem value={form.responsible_role}>{form.responsible_role}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Related SOPs */}
      <Card className="border-0 shadow-sm mb-8">
        <CardHeader className="pb-2"><CardTitle className="text-base text-slate-700 flex items-center gap-2"><Link2 className="w-4 h-4 text-indigo-600" /> Related SOPs</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">Linked SOPs appear at the bottom of this SOP so staff can jump to the next procedure.</p>
          <Input value={relatedSearch} onChange={e => setRelatedSearch(e.target.value)} placeholder="Search SOPs to link..." className="h-8 text-sm" />
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {liveSops
              .filter(o => o.id !== id && (!relatedSearch || o.title.toLowerCase().includes(relatedSearch.toLowerCase()) || (form.related_sop_ids || []).includes(o.id)))
              .map(o => {
                const selected = (form.related_sop_ids || []).includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => set('related_sop_ids', selected ? form.related_sop_ids.filter(x => x !== o.id) : [...(form.related_sop_ids || []), o.id])}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                  >
                    {o.title}
                  </button>
                );
              })}
            {liveSops.length === 0 && <p className="text-xs text-slate-400">No published SOPs to link yet</p>}
          </div>
        </CardContent>
      </Card>

      {/* Verification */}
      <Card className="border-0 shadow-sm mb-8">
        <CardHeader className="pb-2"><CardTitle className="text-base text-slate-700 flex items-center gap-2"><CalendarCheck className="w-4 h-4 text-indigo-600" /> Verification Schedule</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">Every SOP must be looked at again every {MAX_VERIFICATION_DAYS} days. The clock restarts automatically when a version is published or approved and when a manager or admin on an applicable team verifies it from the SOP page.</p>
          <div className="flex items-start gap-4 flex-wrap">
            <div className="space-y-2">
              <Label>Next verification due <span className="text-slate-400 text-xs font-normal">(optional: bring it earlier)</span></Label>
              <Input
                type="date"
                value={form.verification_due_date || ''}
                min={addDaysStr(1)}
                max={addDaysStr(MAX_VERIFICATION_DAYS)}
                onChange={e => set('verification_due_date', e.target.value)}
                className={verificationError ? 'border-red-400' : ''}
              />
              {verificationError && (
                <p className="text-xs text-red-600">Must be between 1 and {MAX_VERIFICATION_DAYS} days from today</p>
              )}
              {verificationDaysOut !== null && !verificationError && (
                <p className="text-xs text-slate-400">
                  {verificationDaysOut < 0 ? `Overdue by ${Math.abs(verificationDaysOut)} day${Math.abs(verificationDaysOut) !== 1 ? 's' : ''}` : `${verificationDaysOut} day${verificationDaysOut !== 1 ? 's' : ''} from today`}
                </p>
              )}
            </div>
            {existing?.last_verified_by_name && (
              <div className="space-y-1 mt-1">
                <Label className="text-xs text-slate-500">Last Verified By</Label>
                <div className="flex items-center gap-1.5 text-sm text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{existing.last_verified_by_name}</span>
                  {existing.last_verified_at && <span className="text-slate-400">on {formatDate(existing.last_verified_at)}</span>}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Acknowledgement */}
      <Card className="border-0 shadow-sm mb-8">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <Switch checked={form.requires_acknowledgement} onCheckedChange={v => set('requires_acknowledgement', v)} />
            <div className="flex-1">
              <p className="font-medium text-sm">Require Staff Acknowledgement</p>
              <p className="text-xs text-slate-500">Staff must confirm they've read this SOP when published or updated</p>
            </div>
            {form.requires_acknowledgement && (
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Days to acknowledge</Label>
                <Input type="number" value={form.acknowledgement_due_days} onChange={e => set('acknowledgement_due_days', Number(e.target.value))} className="w-16 h-8 text-sm" />
              </div>
            )}
          </div>

          {form.requires_acknowledgement && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Assign to (leave blank for all staff)</p>

              {teams.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-slate-600"><Users className="w-3.5 h-3.5" /> Teams</div>
                  <div className="flex flex-wrap gap-2">
                    {teams.map(team => (
                      <label key={team.id} className="flex items-center gap-1.5 cursor-pointer bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100">
                        <Checkbox
                          checked={(form.acknowledgement_assigned_teams || []).includes(team.id)}
                          onCheckedChange={checked => {
                            const curr = form.acknowledgement_assigned_teams || [];
                            set('acknowledgement_assigned_teams', checked ? [...curr, team.id] : curr.filter(t => t !== team.id));
                          }}
                        />
                        <span className="text-xs text-slate-700">{team.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {allUsers.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-slate-600"><User className="w-3.5 h-3.5" /> Individuals</div>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {allUsers.map(u => (
                      <label key={u.id} className="flex items-center gap-1.5 cursor-pointer bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100">
                        <Checkbox
                          checked={(form.acknowledgement_assigned_emails || []).includes(u.email)}
                          onCheckedChange={checked => {
                            const curr = form.acknowledgement_assigned_emails || [];
                            set('acknowledgement_assigned_emails', checked ? [...curr, u.email] : curr.filter(e => e !== u.email));
                          }}
                        />
                        <span className="text-xs text-slate-700">{u.full_name || u.email}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {managerSubmitsEdit && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 mb-8">
          <strong>Note:</strong> Your edits will be submitted for admin approval. The current version stays live until they are approved; if changes are requested, the SOP comes back to you to edit again.
        </div>
      )}
      {missingChangeSummary && (
        <p className="text-xs text-red-600 text-right mb-2">Add a change summary so reviewers and staff know what changed.</p>
      )}

      <div className="flex justify-end gap-3 pb-8">
        {id && can('sop.archive') && existing?.status !== 'archived' && (
          <Button
            variant="outline"
            onClick={() => setArchiveConfirm(true)}
            className="gap-2 mr-auto"
          >
            <Archive className="w-4 h-4" /> Archive SOP
          </Button>
        )}
        <Link to={createPageUrl('SOPs')}><Button variant="outline">Cancel</Button></Link>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || verificationError || missingChangeSummary || missingRequired || (!!id && !hasChanges)}
          className="bg-indigo-600 hover:bg-indigo-700 gap-2"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {managerSubmitsEdit ? 'Submit for Approval' : id ? 'Update SOP' : 'Create SOP'}
        </Button>
      </div>

      <AlertDialog open={archiveConfirm} onOpenChange={setArchiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive SOP?</AlertDialogTitle>
            <AlertDialogDescription>
              "{existing?.title}" will be hidden from staff and the SOP Assistant. Managers and above can still see it under Archived and restore it as a draft.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiveMutation.mutate()}>
              {archiveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Archive
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Publish dialog — asks who needs to acknowledge, then publishes with a 90-day verification cycle */}
      <SOPPublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onPublish={(ackSettings) => publishMutation.mutate(ackSettings)}
        pending={publishMutation.isPending}
        sopTitle={form.title || existing?.title || 'this SOP'}
        teams={teams}
        users={allUsers}
      />

      {/* Return (send back) dialog — admin returns a draft to its creator with a note */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CornerUpLeft className="w-5 h-5 text-amber-600" /> Return to Creator</DialogTitle>
            <DialogDescription>This draft will be sent back to {existing?.last_updated_by_name || 'the creator'} with your notes. It stays unpublished until they resubmit it.</DialogDescription>
          </DialogHeader>
          <Textarea value={returnNote} onChange={e => setReturnNote(e.target.value)} rows={4} placeholder="What needs to change before this can be published?" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>Cancel</Button>
            <Button
              onClick={() => returnMutation.mutate(returnNote.trim())}
              disabled={returnMutation.isPending || !returnNote.trim()}
              className="bg-amber-600 hover:bg-amber-700 gap-2"
            >
              {returnMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CornerUpLeft className="w-4 h-4" />}
              Send Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}