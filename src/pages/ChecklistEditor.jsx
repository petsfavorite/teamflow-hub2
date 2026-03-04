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
import { ArrowLeft, Plus, Trash2, GripVertical, Save, Loader2 } from 'lucide-react';
import { toast } from "sonner";

export default function ChecklistEditor() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isSuperAdmin, isAdmin, canManage } = useCurrentUser();

  const [form, setForm] = useState({
    title: '', description: '', category: '', frequency: 'daily', status: 'active', assigned_to_emails: [], assigned_to_teams: [], items: [],
    custom_frequency_type: 'days', custom_frequency_value: 1, custom_frequency_days: [], custom_frequency_day_of_month: 1
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

  useEffect(() => {
    if (existing) {
      setForm({
        ...existing,
        assigned_to_emails: existing.assigned_to_emails || [],
        assigned_to_teams: existing.assigned_to_teams || [],
        custom_frequency_type: existing.custom_frequency_type || 'days',
        custom_frequency_value: existing.custom_frequency_value || 1,
        custom_frequency_days: existing.custom_frequency_days || [],
        custom_frequency_day_of_month: existing.custom_frequency_day_of_month || 1
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

  const updateItem = (index, label) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, label } : item)
    }));
  };

  const removeItem = (index) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index).map((item, i) => ({ ...item, order: i }))
    }));
  };

  const handleSave = () => {
    saveMutation.mutate({
      ...form,
      assigned_to_emails: selectedUsers,
      assigned_to_teams: selectedTeams
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={v => setForm({ ...form, frequency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="as_needed">As Needed</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
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
          </div>

          {form.frequency === 'custom' && (
            <div className="space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="space-y-2">
                <Label>Repeat every</Label>
                <div className="flex gap-2 items-end">
                  <Input type="number" min="1" value={form.custom_frequency_value} onChange={e => setForm({ ...form, custom_frequency_value: parseInt(e.target.value) || 1 })} className="w-20" />
                  <Select value={form.custom_frequency_type} onValueChange={v => setForm({ ...form, custom_frequency_type: v })}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="days">Day(s)</SelectItem>
                      <SelectItem value="weeks">Week(s)</SelectItem>
                      <SelectItem value="months">Month(s)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.custom_frequency_type === 'weeks' && (
                <div className="space-y-2">
                  <Label>On these days</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, idx) => (
                      <label key={idx} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={form.custom_frequency_days?.includes(idx)}
                          onCheckedChange={checked => {
                            setForm(prev => ({
                              ...prev,
                              custom_frequency_days: checked
                                ? [...(prev.custom_frequency_days || []), idx]
                                : (prev.custom_frequency_days || []).filter(d => d !== idx)
                            }));
                          }}
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {form.custom_frequency_type === 'months' && (
                <div className="space-y-2">
                  <Label>On day of month</Label>
                  <Input type="number" min="1" max="31" value={form.custom_frequency_day_of_month} onChange={e => setForm({ ...form, custom_frequency_day_of_month: parseInt(e.target.value) || 1 })} />
                </div>
              )}
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Checklist Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1">
                <Plus className="w-3 h-3" /> Add Item
              </Button>
            </div>
            {form.items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
                <span className="text-xs text-slate-400 w-6">{i + 1}.</span>
                <Input
                  value={item.label}
                  onChange={e => updateItem(i, e.target.value)}
                  placeholder="Item description"
                  className="flex-1"
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)}>
                  <Trash2 className="w-4 h-4 text-red-400" />
                </Button>
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