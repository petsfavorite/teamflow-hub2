import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import PageHeader from '../components/shared/PageHeader';
import EmptyState from '../components/shared/EmptyState';
import StatusBadge from '../components/shared/StatusBadge';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { CheckSquare, Plus, Send, Loader2, Clock } from 'lucide-react';
import { toast } from "sonner";

export default function Checklists() {
  const { user, isSuperAdmin, isAdmin, isManager, canManage } = useCurrentUser();
  const queryClient = useQueryClient();
  const [activeChecklist, setActiveChecklist] = useState(null);
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState({});

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['checklist-templates'],
    queryFn: () => base44.entities.ChecklistTemplate.filter({ status: 'published' }, '-created_date', 100),
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
    enabled: canManage,
  });

  const myTeamIds = new Set(
    canManage 
      ? teams.filter(t => t.member_emails?.includes(user?.email)).map(t => t.id)
      : []
  );

  const myTemplates = templates.filter(t => {
    const assignedToMe = t.assigned_to_emails?.includes(user?.email);
    const inMyTeam = t.assigned_teams?.some(teamId => myTeamIds.has(teamId));
    return assignedToMe || inMyTeam;
  });

  const submitMutation = useMutation({
    mutationFn: (data) => base44.entities.ChecklistCompletion.create(data),
    onSuccess: () => {
      toast.success('Checklist submitted!');
      setActiveChecklist(null);
      setItems([]);
      setNotes({});
      queryClient.invalidateQueries({ queryKey: ['completions'] });
    },
  });

  const startChecklist = (template) => {
    setActiveChecklist(template);
    setItems(template.items.map(item => ({ ...item, checked: false })));
    setNotes({});
  };

  const toggleItem = (index) => {
    setItems(prev => prev.map((item, i) => {
      if (i === index) {
        const isChecking = !item.checked;
        return {
          ...item,
          checked: isChecking,
          checked_at: isChecking ? new Date().toISOString() : null,
          checked_by_email: isChecking ? user?.email : null,
          checked_by_name: isChecking ? user?.full_name : null,
        };
      }
      return item;
    }));
  };

  const submitChecklist = () => {
    const completedItems = items.map((item, i) => ({
      ...item,
      notes: notes[i] || ''
    }));

    submitMutation.mutate({
      checklist_template_id: activeChecklist.id,
      checklist_title: activeChecklist.title,
      completed_by: user?.email,
      completed_by_name: user?.full_name,
      completed_items: completedItems,
      completion_date: new Date().toISOString().split('T')[0],
      status: 'completed',
    });
  };

  if (activeChecklist) {
    const allChecked = items.every(i => i.checked);
    return (
      <div className="max-w-2xl mx-auto">
        <Button variant="ghost" onClick={() => setActiveChecklist(null)} className="mb-4 text-slate-600">
          ← Back to Checklists
        </Button>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-1">{activeChecklist.title}</h2>
            {activeChecklist.description && <p className="text-sm text-slate-500 mb-6">{activeChecklist.description}</p>}

            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className={`p-4 rounded-xl border transition-all ${item.checked ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={item.checked}
                      onCheckedChange={() => toggleItem(i)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 mb-1">
                        {item.sop_id ? (
                          <Link to={createPageUrl('SOPDetail') + `?id=${item.sop_id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-700 underline">
                            {item.label}
                          </Link>
                        ) : (
                          <span className={`text-sm font-medium ${item.checked ? 'text-emerald-700 line-through' : 'text-slate-800'}`}>
                            {item.label}
                          </span>
                        )}
                      </div>
                      {item.assigned_to_name && (
                        <p className="text-xs text-slate-500 mb-2">Assigned to: {item.assigned_to_name}</p>
                      )}
                      {item.checked && (
                        <p className="text-xs text-emerald-600 mb-2">
                          ✓ Checked by {item.checked_by_name} at {new Date(item.checked_at).toLocaleString()}
                        </p>
                      )}
                      <Textarea
                        placeholder="Add notes (optional)"
                        value={notes[i] || ''}
                        onChange={e => setNotes({ ...notes, [i]: e.target.value })}
                        className="mt-2 text-xs h-16 resize-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                onClick={submitChecklist}
                disabled={!allChecked || submitMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 gap-2"
              >
                {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Submit Checklist
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Checklists"
        description="Complete your assigned checklists"
        actions={
          (isSuperAdmin || isAdmin) && (
            <Link to={createPageUrl('ChecklistEditor')}>
              <Button className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                <Plus className="w-4 h-4" /> New Checklist
              </Button>
            </Link>
          )
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <Card key={i} className="border-0 shadow-sm animate-pulse">
              <CardContent className="p-6"><div className="h-20 bg-slate-100 rounded" /></CardContent>
            </Card>
          ))}
        </div>
      ) : myTemplates.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No checklists assigned"
          description="You don't have any active checklists right now"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {myTemplates.map(template => (
            <Card key={template.id} className="border-0 shadow-sm hover:shadow-lg transition-all cursor-pointer" onClick={() => startChecklist(template)}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <CheckSquare className="w-5 h-5 text-emerald-600" />
                  </div>
                  <StatusBadge status={template.frequency} />
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">{template.title}</h3>
                {template.description && <p className="text-sm text-slate-500 mb-3">{template.description}</p>}
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Clock className="w-3 h-3" />
                  {template.items?.length || 0} items
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canManage && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">All Checklist Templates</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(t => (
              <Card key={t.id} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm text-slate-800">{t.title}</p>
                      <p className="text-xs text-slate-400">{t.items?.length} items · {t.frequency}</p>
                    </div>
                    <Link to={createPageUrl('ChecklistEditor') + `?id=${t.id}`}>
                      <Button variant="ghost" size="sm">Edit</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}