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
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Plus, Trash2, GripVertical, Save, Loader2, Clock } from 'lucide-react';
import { toast } from "sonner";

export default function ChecklistEditor() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isSuperAdmin, isAdmin, canManage } = useCurrentUser();

  const [form, setForm] = useState({
    title: '', description: '', category: '', status: 'active', assigned_to_emails: [], assigned_to_teams: [], items: [],
    recurrence_type: 'once', recurrence_days_of_week: [], recurrence_day_of_month: 1, recurrence_interval_months: 1,
    due_date: '', due_time: '21:00'
  });
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState([]);

  const { data: existing } = useQuery({
    queryKey: ['checklist-edit', id],
    queryFn: async () => {
      const list = await base44.entities.ChecklistTemplate.filter({ id });
      return list[0];
    },
    enabled: !!id,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => base44.entities.User.list('full_name', 200),
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams-list'],
    queryFn: () => base44.entities.Team.list('name', 200),
  });

  const { data: sops = [] } = useQuery({
    queryKey: ['sops-list'],
    queryFn: () => base44.entities.SOP.filter({ status: 'published' }, '-updated_date', 200),
  });

  useEffect(() => {
    if (existing) {
      setForm({
        ...existing,
        assigned_to_emails: existing.assigned_to_emails || [],
        assigned_to_teams: existing.assigned_to_teams || [],
        recurrence_type: existing.recurrence_type || 'once',
        recurrence_days_of_week: existing.recurrence_days_of_week || [],
        recurrence_day_of_month: existing.recurrence_day_of_month || 1,
        recurrence_interval_months: existing.recurrence_interval_months || 1,
        due_date: existing.due_date || '',
        due_time: existing.due_time || '21:00'
      });
      setSelectedUsers(existing.assigned_to_emails || []);
      setSelectedTeams(existing.assigned_to_teams || []);
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (id) return base44.entities.ChecklistTemplate.update(id, data);
      return base44.entities.ChecklistTemplate.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist-templates'] });
      toast.success(id ? 'Checklist updated' : 'Checklist created');
      navigate(createPageUrl('Checklists'));
    },
  });

  const addItem = () => {
    setForm(prev => ({
      ...prev,
      items: [...prev.items, { label: '', order: prev.items.length }]
    }));
  };

  const updateItem = (index, field, value) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item)
    }));
  };

  const removeItem = (index) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index).map((item, i) => ({ ...item, order: i }))
    }));
  };

  const handleSave = () => {
    if (!form.due_date) {
      alert('Due date is required');
      return;
    }
    saveMutation.mutate({
      title: form.title,
      description: form.description,
      category: form.category,
      status: form.status,
      items: form.items,
      assigned_to_emails: selectedUsers,
      assigned_to_names: selectedUsers.map(email => users.find(u => u.email === email)?.full_name || email),
      assigned_teams: selectedTeams,
      due_date: form.due_date,
      due_time: form.due_time || '21:00',
      recurrence_type: form.recurrence_type,
      recurrence_days_of_week: form.recurrence_days_of_week,
      recurrence_day_of_month: form.recurrence_day_of_month,
      recurrence_interval_months: form.recurrence_interval_months
    });
  };

  if (!id && !isAdmin && !isSuperAdmin) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Only admins can create checklists</p>
        <Link to={createPageUrl('Checklists')}><Button variant="ghost" className="mt-4">Back</Button></Link>
      </div>
    );
  }

  if (id && !canManage) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">You don't have permission to edit checklists</p>
        <Link to={createPageUrl('Checklists')}><Button variant="ghost" className="mt-4">Back</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link to={createPageUrl('Checklists')}>
        <Button variant="ghost" className="gap-2 text-slate-600 mb-4"><ArrowLeft className="w-4 h-4" /> Back</Button>
      </Link>

      <PageHeader title={id ? 'Edit Checklist' : 'New Checklist'} />

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Checklist name" />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Opening, Closing" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description" rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {id && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Recurrence</Label>
                  <Select value={form.recurrence_type} onValueChange={v => setForm({ ...form, recurrence_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once">Once</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekdays">Weekdays</SelectItem>
                      <SelectItem value="specific_days">Specific Days</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="every_x_months">Every X Months</SelectItem>
                      <SelectItem value="annually">Annually</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Due Date <span className="text-red-500">*</span></Label>
                  <Input
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm({ ...form, due_date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Clock className="w-4 h-4" /> Due Time</Label>
                  <Input
                    type="time"
                    value={form.due_time}
                    onChange={e => setForm({ ...form, due_time: e.target.value })}
                  />
                </div>
              </div>

              {form.recurrence_type === 'specific_days' && (
                <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <Label>On these days</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, idx) => (
                      <label key={idx} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={form.recurrence_days_of_week?.includes(idx)}
                          onCheckedChange={checked => {
                            setForm(prev => ({
                              ...prev,
                              recurrence_days_of_week: checked
                                ? [...(prev.recurrence_days_of_week || []), idx]
                                : (prev.recurrence_days_of_week || []).filter(d => d !== idx)
                            }));
                          }}
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {form.recurrence_type === 'monthly' && (
                <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <Label>On day of month</Label>
                  <Input type="number" min="1" max="31" value={form.recurrence_day_of_month} onChange={e => setForm({ ...form, recurrence_day_of_month: parseInt(e.target.value) || 1 })} />
                </div>
              )}

              {form.recurrence_type === 'every_x_months' && (
                <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <Label>Repeat every X months</Label>
                  <Input type="number" min="1" value={form.recurrence_interval_months} onChange={e => setForm({ ...form, recurrence_interval_months: parseInt(e.target.value) || 1 })} />
                  <Label className="mt-4">On day of month</Label>
                  <Input type="number" min="1" max="31" value={form.recurrence_day_of_month} onChange={e => setForm({ ...form, recurrence_day_of_month: parseInt(e.target.value) || 1 })} />
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Assign to Users</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200">
                    {users.map(u => (
                      <label key={u.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={selectedUsers.includes(u.email)}
                          onCheckedChange={checked => {
                            setSelectedUsers(checked
                              ? [...selectedUsers, u.email]
                              : selectedUsers.filter(e => e !== u.email)
                            );
                          }}
                        />
                        {u.full_name || u.email}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Assign to Teams</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200">
                    {teams.map(t => (
                      <label key={t.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={selectedTeams.includes(t.id)}
                          onCheckedChange={checked => {
                            setSelectedTeams(checked
                              ? [...selectedTeams, t.id]
                              : selectedTeams.filter(id => id !== t.id)
                            );
                          }}
                        />
                        {t.name}
                      </label>
                    ))}
                  </div>
                </div>

                {selectedUsers.length > 0 && (
                  <div className="text-sm text-slate-600">Selected {selectedUsers.length} user(s)</div>
                )}
                {selectedTeams.length > 0 && (
                  <div className="text-sm text-slate-600">Selected {selectedTeams.length} team(s)</div>
                )}
              </div>
            </>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Checklist Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1">
                <Plus className="w-3 h-3" /> Add Item
              </Button>
            </div>
            {form.items.map((item, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  <span className="text-xs text-slate-400 w-6">{i + 1}.</span>
                  <Input
                    value={item.label}
                    onChange={e => updateItem(i, 'label', e.target.value)}
                    placeholder="Item description"
                    className="flex-1"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)}>
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </Button>
                </div>
                <div className="ml-10">
                  <Select value={item.sop_id || ''} onValueChange={v => updateItem(i, 'sop_id', v || undefined)}>
                    <SelectTrigger className="text-xs"><SelectValue placeholder="Attach SOP (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>No SOP</SelectItem>
                      {sops.map(sop => (
                        <SelectItem key={sop.id} value={sop.id}>{sop.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
            {form.items.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">No items yet. Click "Add Item" to start.</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Link to={createPageUrl('Checklists')}><Button variant="outline">Cancel</Button></Link>
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {id ? 'Update' : 'Create'} Checklist
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}