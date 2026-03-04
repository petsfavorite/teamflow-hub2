import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import ReactQuill from 'react-quill';
import { ArrowLeft, Save, Loader2, History, Users, User, Video, AlertTriangle, UserCheck, CheckCircle2, CalendarCheck, X, Plus, Tag } from 'lucide-react';
import SOPAIImporter from '../components/sop/SOPAIImporter';
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { addDays, format, parseISO, differenceInDays } from 'date-fns';

const MAX_VERIFICATION_DAYS = 90;

export default function SOPEditor() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAdmin, isSuperAdmin, isManager } = useCurrentUser();
  const canManage = isAdmin || isSuperAdmin || isManager;

  const defaultForm = {
    title: '', category: '', purpose: '', when_it_applies: '', required_tools: '',
    instructions: '', video_url: '', warnings: '', responsible_role: '',
    applicable_teams: [], summary: '', tags: [], status: 'draft', version: 1,
    requires_acknowledgement: false, acknowledgement_due_days: 3,
    acknowledgement_assigned_emails: [], acknowledgement_assigned_teams: [],
    verification_due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    content: '',
  };

  const [form, setForm] = useState(defaultForm);
  const [tagsInput, setTagsInput] = useState('');
  const [changeSummary, setChangeSummary] = useState('');

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list('name', 100),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users-sop'],
    queryFn: () => base44.entities.User.list('full_name', 500),
    enabled: !!(isAdmin || isSuperAdmin),
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
      setForm({ ...defaultForm, ...existing });
      setTagsInput(existing.tags?.join(', ') || '');
    }
  }, [existing]);

  const isManagerOnly = isManager && !isAdmin && !isSuperAdmin;

  // Verification date validation
  const verificationDaysOut = form.verification_due_date
    ? differenceInDays(parseISO(form.verification_due_date), new Date())
    : null;
  const verificationError = verificationDaysOut !== null && (verificationDaysOut < 1 || verificationDaysOut > MAX_VERIFICATION_DAYS);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);

      if (isManagerOnly && id) {
        return base44.entities.SOP.update(id, {
          pending_content: data.instructions || data.content,
          pending_summary: data.summary,
          pending_tags: tags,
          pending_change_summary: changeSummary || 'Manager update',
          pending_submitted_by: user?.email,
          pending_submitted_by_name: user?.full_name,
          status: 'pending_approval',
        });
      }

      const sopData = {
        ...data, tags,
        last_updated_by: user?.email,
        last_updated_by_name: user?.full_name,
      };

      let result;
      if (id) {
        result = await base44.entities.SOP.update(id, sopData);
      } else {
        result = await base44.entities.SOP.create(sopData);
      }

      const sopId = id || result.id;
      await base44.entities.SOPVersion.create({
        sop_id: sopId,
        version_number: sopData.version,
        title: sopData.title,
        content: sopData.instructions || sopData.content,
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
      toast.success(isManagerOnly && id ? 'Edit submitted for admin approval' : id ? 'SOP updated' : 'SOP created');
      navigate(createPageUrl('SOPs'));
    },
  });

  if (!id && !isAdmin && !isSuperAdmin) {
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

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

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

      <h1 className="text-2xl font-bold text-slate-900 mb-6">{id ? 'Edit SOP' : 'Create New SOP'}</h1>

      <SOPAIImporter
        sopTags={sopTags}
        onFill={(data) => {
          setForm(f => ({
            ...f,
            ...Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'tags')),
          }));
          if (data.tags?.length) {
            const validTags = data.tags.filter(t => sopTags.some(st => st.name === t));
            setForm(f => ({ ...f, tags: validTags }));
            setTagsInput(validTags.join(', '));
          }
        }}
      />

      {/* Header Info */}
      <Card className="border-0 shadow-sm mb-4">
        <CardHeader className="pb-2"><CardTitle className="text-base text-slate-700">Header Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Title *</Label><Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="SOP Title" /></div>
            <div className="space-y-2"><Label>Category *</Label><Input value={form.category} onChange={e => set('category', e.target.value)} placeholder="e.g. Safety, Operations" /></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v)} disabled={isManagerOnly && !!id}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  {!isManagerOnly && <SelectItem value="published">Published</SelectItem>}
                  {!isManagerOnly && <SelectItem value="archived">Archived</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Version</Label><Input type="number" value={form.version} onChange={e => set('version', Number(e.target.value))} /></div>
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
                    {(isAdmin || isSuperAdmin) && (
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
            {(isAdmin || isSuperAdmin) && (
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
              <Label>Change Summary <span className="text-slate-400 text-xs">(what changed?)</span></Label>
              <Input value={changeSummary} onChange={e => setChangeSummary(e.target.value)} placeholder="e.g. Updated step 3 with new sanitizer protocol" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* SOP Content */}
      <Card className="border-0 shadow-sm mb-4">
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
            <div className="min-h-[300px]">
              <ReactQuill value={form.instructions} onChange={v => set('instructions', v)} className="bg-white rounded-lg" theme="snow" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Video className="w-3.5 h-3.5" /> Video URL <span className="text-slate-400 text-xs font-normal">(optional)</span></Label>
            <Input value={form.video_url} onChange={e => set('video_url', e.target.value)} placeholder="https://youtube.com/..." />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-amber-700"><AlertTriangle className="w-3.5 h-3.5" /> Warnings / Cautions</Label>
            <Textarea value={form.warnings} onChange={e => set('warnings', e.target.value)} placeholder="Any safety warnings, hazards, or important cautions" rows={2} className="border-amber-200 focus-visible:ring-amber-400" />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5" /> Who Is Responsible</Label>
            <Input value={form.responsible_role} onChange={e => set('responsible_role', e.target.value)} placeholder="e.g. Kennel Staff, Shift Lead, All Staff" />
          </div>
        </CardContent>
      </Card>

      {/* Verification */}
      <Card className="border-0 shadow-sm mb-4">
        <CardHeader className="pb-2"><CardTitle className="text-base text-slate-700 flex items-center gap-2"><CalendarCheck className="w-4 h-4 text-indigo-600" /> Verification Schedule</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">Set a future date (max 90 days) by which a manager or admin on an applicable team must re-verify this SOP.</p>
          <div className="flex items-start gap-4 flex-wrap">
            <div className="space-y-2">
              <Label>Verification Due Date</Label>
              <Input
                type="date"
                value={form.verification_due_date || ''}
                min={format(addDays(new Date(), 1), 'yyyy-MM-dd')}
                max={format(addDays(new Date(), MAX_VERIFICATION_DAYS), 'yyyy-MM-dd')}
                onChange={e => set('verification_due_date', e.target.value)}
                className={verificationError ? 'border-red-400' : ''}
              />
              {verificationError && (
                <p className="text-xs text-red-600">Must be between 1 and 90 days from today</p>
              )}
              {verificationDaysOut !== null && !verificationError && (
                <p className="text-xs text-slate-400">{verificationDaysOut} day{verificationDaysOut !== 1 ? 's' : ''} from today</p>
              )}
            </div>
            {existing?.last_verified_by_name && (
              <div className="space-y-1 mt-1">
                <Label className="text-xs text-slate-500">Last Verified By</Label>
                <div className="flex items-center gap-1.5 text-sm text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{existing.last_verified_by_name}</span>
                  {existing.last_verified_at && <span className="text-slate-400">on {new Date(existing.last_verified_at).toLocaleDateString()}</span>}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Acknowledgement */}
      <Card className="border-0 shadow-sm mb-4">
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

      {isManagerOnly && id && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 mb-4">
          <strong>Note:</strong> Your edits will be submitted for admin approval before going live.
        </div>
      )}

      <div className="flex justify-end gap-3 pb-8">
        <Link to={createPageUrl('SOPs')}><Button variant="outline">Cancel</Button></Link>
        <Button
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending || verificationError}
          className="bg-indigo-600 hover:bg-indigo-700 gap-2"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isManagerOnly && id ? 'Submit for Approval' : id ? 'Update SOP' : 'Create SOP'}
        </Button>
      </div>
    </div>
  );
}