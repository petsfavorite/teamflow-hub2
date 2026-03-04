import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import PageHeader from '../components/shared/PageHeader';
import StatusBadge from '../components/shared/StatusBadge';
import EmptyState from '../components/shared/EmptyState';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, Plus, Clock, User, Eye, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from "sonner";

const INCIDENT_TYPES = [
  { value: "dog_fight", label: "Dog Fight" },
  { value: "animal_injury", label: "Animal Injury" },
  { value: "staff_injury", label: "Staff Injury" },
  { value: "client_incident", label: "Client Incident" },
  { value: "equipment_failure", label: "Equipment Failure" },
  { value: "escape", label: "Animal Escape" },
  { value: "medical_emergency", label: "Medical Emergency" },
  { value: "other", label: "Other" },
];

const typeColors = {
  dog_fight: "bg-red-100 text-red-700",
  animal_injury: "bg-orange-100 text-orange-700",
  staff_injury: "bg-red-100 text-red-700",
  client_incident: "bg-purple-100 text-purple-700",
  equipment_failure: "bg-amber-100 text-amber-700",
  escape: "bg-rose-100 text-rose-700",
  medical_emergency: "bg-red-100 text-red-700",
  other: "bg-slate-100 text-slate-600",
};

const emptyForm = {
  incident_type: '', title: '', description: '', location_detail: '',
  incident_date: new Date().toISOString().split('T')[0], incident_time: '',
  animals_involved: '', client_involved: '', immediate_action_taken: '',
};

export default function IncidentReports() {
  const { user, canManage } = useCurrentUser();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);
  const [managerNotes, setManagerNotes] = useState('');
  const [form, setForm] = useState(emptyForm);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: () => base44.entities.IncidentReport.list('-created_date', 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.IncidentReport.create(data),
    onSuccess: () => {
      toast.success('Incident report submitted');
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setShowNew(false);
      setForm(emptyForm);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.IncidentReport.update(id, data),
    onSuccess: () => {
      toast.success('Report updated');
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setSelected(null);
    },
  });

  const handleSubmit = () => {
    createMutation.mutate({
      ...form,
      reported_by: user?.email,
      reported_by_name: user?.full_name,
    });
  };

  const resolveReport = (report) => {
    updateMutation.mutate({ id: report.id, data: { status: 'resolved', manager_notes: managerNotes, resolved_by: user?.full_name } });
  };

  return (
    <div>
      <PageHeader
        title="Incident Reports"
        description="Report and track workplace incidents"
        actions={
          <Button onClick={() => setShowNew(true)} className="bg-red-600 hover:bg-red-700 gap-2">
            <Plus className="w-4 h-4" /> Report Incident
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i=><Card key={i} className="border-0 shadow-sm animate-pulse"><CardContent className="p-4"><div className="h-16 bg-slate-100 rounded"/></CardContent></Card>)}</div>
      ) : reports.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No incidents reported" description="Incidents submitted by staff will appear here" />
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <Card key={r.id} className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => { setSelected(r); setManagerNotes(r.manager_notes || ''); }}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{r.title}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[r.incident_type]}`}>
                          {INCIDENT_TYPES.find(t => t.value === r.incident_type)?.label || r.incident_type}
                        </span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{r.incident_date}</span>
                        <span className="flex items-center gap-1"><User className="w-3 h-3" />{r.reported_by_name}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={r.status} />
                    <Eye className="w-4 h-4 text-slate-300" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Report Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Report an Incident</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Incident Type</Label>
                <Select value={form.incident_type} onValueChange={v => setForm({ ...form, incident_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{INCIDENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={form.incident_date} onChange={e => setForm({ ...form, incident_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Brief description" /></div>
            <div className="space-y-2"><Label>Location / Area</Label><Input value={form.location_detail} onChange={e => setForm({ ...form, location_detail: e.target.value })} placeholder="e.g. Kennel B, Grooming Room" /></div>
            <div className="space-y-2"><Label>Full Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="What happened?" /></div>
            <div className="space-y-2"><Label>Animals Involved</Label><Input value={form.animals_involved} onChange={e => setForm({ ...form, animals_involved: e.target.value })} placeholder="Pet names / breeds" /></div>
            <div className="space-y-2"><Label>Client Involved (if any)</Label><Input value={form.client_involved} onChange={e => setForm({ ...form, client_involved: e.target.value })} /></div>
            <div className="space-y-2"><Label>Immediate Action Taken</Label><Textarea value={form.immediate_action_taken} onChange={e => setForm({ ...form, immediate_action_taken: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || !form.incident_type || !form.title} className="bg-red-600 hover:bg-red-700 gap-2">
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Submit Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selected?.title}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeColors[selected?.incident_type]}`}>
                {INCIDENT_TYPES.find(t => t.value === selected?.incident_type)?.label}
              </span>
              <StatusBadge status={selected?.status} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-slate-400 text-xs">Date</p><p className="font-medium">{selected?.incident_date}</p></div>
              <div><p className="text-slate-400 text-xs">Location</p><p className="font-medium">{selected?.location_detail || 'N/A'}</p></div>
              <div><p className="text-slate-400 text-xs">Reported By</p><p className="font-medium">{selected?.reported_by_name}</p></div>
              <div><p className="text-slate-400 text-xs">Animals</p><p className="font-medium">{selected?.animals_involved || 'N/A'}</p></div>
            </div>
            <div><p className="text-slate-400 text-xs mb-1">Description</p><p className="text-sm bg-slate-50 rounded-lg p-3">{selected?.description}</p></div>
            {selected?.immediate_action_taken && <div><p className="text-slate-400 text-xs mb-1">Immediate Action</p><p className="text-sm bg-emerald-50 rounded-lg p-3">{selected.immediate_action_taken}</p></div>}
            {canManage && selected?.status !== 'resolved' && (
              <div className="space-y-2 pt-2 border-t">
                <Label>Manager Notes</Label>
                <Textarea value={managerNotes} onChange={e => setManagerNotes(e.target.value)} rows={3} placeholder="Resolution notes..." />
              </div>
            )}
            {selected?.manager_notes && <div><p className="text-slate-400 text-xs mb-1">Manager Notes</p><p className="text-sm bg-blue-50 rounded-lg p-3">{selected.manager_notes}</p></div>}
          </div>
          {canManage && selected?.status !== 'resolved' && (
            <DialogFooter>
              <Button variant="outline" onClick={() => updateMutation.mutate({ id: selected.id, data: { status: 'under_review', manager_notes: managerNotes } })}>Mark Under Review</Button>
              <Button onClick={() => resolveReport(selected)} disabled={updateMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                <CheckCircle className="w-4 h-4" /> Resolve
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}