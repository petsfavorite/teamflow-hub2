import React, { useState, useRef } from 'react';
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
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Plus, Clock, User, Loader2, ChevronDown, Paperclip, Lock, Archive, Printer } from 'lucide-react';
import { toast } from "sonner";

const CATEGORIES = [
  { value: "interpersonal", label: "Interpersonal" },
  { value: "pet_issue", label: "Pet Issue" },
  { value: "osha_reportable", label: "OSHA Reportable Incident" },
  { value: "other", label: "Other" },
];

const categoryColors = {
  interpersonal: "bg-purple-100 text-purple-700",
  pet_issue: "bg-orange-100 text-orange-700",
  osha_reportable: "bg-red-100 text-red-700",
  other: "bg-slate-100 text-slate-600",
};

const emptyForm = {
  category: '',
  title: '',
  description: '',
  incident_date: new Date().toISOString().split('T')[0],
  incident_time: '',
  is_private: false,
  osha_not_sure_about_care: false,
  // OSHA fields
  osha_employee_name: '',
  osha_job_title: '',
  osha_date_of_birth: '',
  osha_date_hired: '',
  osha_sex: '',
  osha_time_of_incident: '',
  osha_what_was_employee_doing: '',
  osha_what_happened: '',
  osha_injury_or_illness: '',
  osha_object_or_substance: '',
  osha_medical_treatment: '',
  osha_days_away_from_work: '',
  osha_days_on_restricted_duty: '',
  osha_physician_name: '',
  osha_treatment_facility: '',
  osha_treatment_facility_address: '',
};

function PrintableReport({ report }) {
  const catLabel = CATEGORIES.find(c => c.value === report.category)?.label || report.category;
  const isOsha = report.category === 'osha_reportable';

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '11pt', color: '#111', padding: '20px', maxWidth: '720px', margin: '0 auto' }}>
      <div style={{ borderBottom: '2px solid #dc2626', paddingBottom: '10px', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '16pt', fontWeight: 'bold', margin: 0 }}>Incident Report</h1>
        <p style={{ margin: '4px 0 0', color: '#555', fontSize: '10pt' }}>
          {isOsha ? 'OSHA — Employee\'s First Report of Injury or Illness' : catLabel}
        </p>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
        <tbody>
          <tr>
            <td style={{ width: '25%', color: '#555', paddingBottom: '6px' }}>Title:</td>
            <td style={{ fontWeight: 'bold', paddingBottom: '6px' }}>{report.title}</td>
            <td style={{ width: '25%', color: '#555', paddingBottom: '6px' }}>Category:</td>
            <td style={{ paddingBottom: '6px' }}>{catLabel}</td>
          </tr>
          <tr>
            <td style={{ color: '#555', paddingBottom: '6px' }}>Date:</td>
            <td style={{ paddingBottom: '6px' }}>{report.incident_date}</td>
            <td style={{ color: '#555', paddingBottom: '6px' }}>Time:</td>
            <td style={{ paddingBottom: '6px' }}>{report.incident_time || '—'}</td>
          </tr>
          <tr>
            <td style={{ color: '#555', paddingBottom: '6px' }}>Reported By:</td>
            <td style={{ paddingBottom: '6px' }}>{report.reported_by_name}</td>
            <td style={{ color: '#555', paddingBottom: '6px' }}>Status:</td>
            <td style={{ paddingBottom: '6px' }}>{report.status?.replace(/_/g, ' ')}</td>
          </tr>
          {report.assigned_to && (
            <tr>
              <td style={{ color: '#555', paddingBottom: '6px' }}>Assigned To:</td>
              <td colSpan={3} style={{ paddingBottom: '6px' }}>{report.assigned_to}</td>
            </tr>
          )}
        </tbody>
      </table>

      {report.description && (
        <div style={{ marginBottom: '14px' }}>
          <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>Description</p>
          <p style={{ background: '#f9f9f9', border: '1px solid #ddd', padding: '8px', borderRadius: '4px', margin: 0 }}>{report.description}</p>
        </div>
      )}

      {isOsha && (
        <div style={{ border: '1px solid #fca5a5', borderRadius: '6px', padding: '14px', background: '#fff5f5', marginBottom: '14px' }}>
          <p style={{ fontWeight: 'bold', color: '#b91c1c', marginBottom: '10px', marginTop: 0 }}>OSHA Details</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {report.osha_employee_name && <tr><td style={{ width: '35%', color: '#555', paddingBottom: '5px' }}>Employee Name:</td><td style={{ paddingBottom: '5px', fontWeight: '500' }}>{report.osha_employee_name}</td></tr>}
              {report.osha_job_title && <tr><td style={{ color: '#555', paddingBottom: '5px' }}>Job Title:</td><td style={{ paddingBottom: '5px' }}>{report.osha_job_title}</td></tr>}
              {report.osha_date_of_birth && <tr><td style={{ color: '#555', paddingBottom: '5px' }}>Date of Birth:</td><td style={{ paddingBottom: '5px' }}>{report.osha_date_of_birth}</td></tr>}
              {report.osha_date_hired && <tr><td style={{ color: '#555', paddingBottom: '5px' }}>Date Hired:</td><td style={{ paddingBottom: '5px' }}>{report.osha_date_hired}</td></tr>}
              {report.osha_sex && <tr><td style={{ color: '#555', paddingBottom: '5px' }}>Sex:</td><td style={{ paddingBottom: '5px', textTransform: 'capitalize' }}>{report.osha_sex.replace(/_/g, ' ')}</td></tr>}
              {report.osha_time_of_incident && <tr><td style={{ color: '#555', paddingBottom: '5px' }}>Time of Incident:</td><td style={{ paddingBottom: '5px' }}>{report.osha_time_of_incident}</td></tr>}
            </tbody>
          </table>
          {report.osha_what_was_employee_doing && (
            <div style={{ marginTop: '8px' }}>
              <p style={{ color: '#555', marginBottom: '2px', fontSize: '10pt' }}>What was the employee doing just before the incident?</p>
              <p style={{ background: 'white', border: '1px solid #fca5a5', padding: '6px', borderRadius: '3px', margin: 0, fontSize: '10pt' }}>{report.osha_what_was_employee_doing}</p>
            </div>
          )}
          {report.osha_what_happened && (
            <div style={{ marginTop: '8px' }}>
              <p style={{ color: '#555', marginBottom: '2px', fontSize: '10pt' }}>What happened?</p>
              <p style={{ background: 'white', border: '1px solid #fca5a5', padding: '6px', borderRadius: '3px', margin: 0, fontSize: '10pt' }}>{report.osha_what_happened}</p>
            </div>
          )}
          {report.osha_injury_or_illness && (
            <div style={{ marginTop: '8px' }}>
              <p style={{ color: '#555', marginBottom: '2px', fontSize: '10pt' }}>Nature of injury / illness:</p>
              <p style={{ background: 'white', border: '1px solid #fca5a5', padding: '6px', borderRadius: '3px', margin: 0, fontSize: '10pt' }}>{report.osha_injury_or_illness}</p>
            </div>
          )}
          {report.osha_object_or_substance && (
            <div style={{ marginTop: '8px' }}>
              <p style={{ color: '#555', marginBottom: '2px', fontSize: '10pt' }}>Object or substance that caused harm:</p>
              <p style={{ background: 'white', border: '1px solid #fca5a5', padding: '6px', borderRadius: '3px', margin: 0, fontSize: '10pt' }}>{report.osha_object_or_substance}</p>
            </div>
          )}
          {!report.osha_not_sure_about_care && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
              <tbody>
                {report.osha_medical_treatment && <tr><td style={{ width: '35%', color: '#555', paddingBottom: '5px' }}>Medical Treatment:</td><td style={{ paddingBottom: '5px', textTransform: 'capitalize' }}>{report.osha_medical_treatment.replace(/_/g, ' ')}</td></tr>}
                {(report.osha_days_away_from_work !== '' && report.osha_days_away_from_work != null) && <tr><td style={{ color: '#555', paddingBottom: '5px' }}>Days Away from Work:</td><td style={{ paddingBottom: '5px' }}>{report.osha_days_away_from_work}</td></tr>}
                {(report.osha_days_on_restricted_duty !== '' && report.osha_days_on_restricted_duty != null) && <tr><td style={{ color: '#555', paddingBottom: '5px' }}>Days Restricted Duty:</td><td style={{ paddingBottom: '5px' }}>{report.osha_days_on_restricted_duty}</td></tr>}
                {report.osha_physician_name && <tr><td style={{ color: '#555', paddingBottom: '5px' }}>Treating Physician:</td><td style={{ paddingBottom: '5px' }}>{report.osha_physician_name}</td></tr>}
                {report.osha_treatment_facility && <tr><td style={{ color: '#555', paddingBottom: '5px' }}>Treatment Facility:</td><td style={{ paddingBottom: '5px' }}>{report.osha_treatment_facility}</td></tr>}
                {report.osha_treatment_facility_address && <tr><td style={{ color: '#555', paddingBottom: '5px' }}>Facility Address:</td><td style={{ paddingBottom: '5px' }}>{report.osha_treatment_facility_address}</td></tr>}
              </tbody>
            </table>
          )}
          {report.osha_not_sure_about_care && (
            <p style={{ marginTop: '10px', fontStyle: 'italic', color: '#666', fontSize: '10pt' }}>* Care details not yet determined at time of report</p>
          )}
        </div>
      )}

      {report.notes_log?.length > 0 && (
        <div>
          <p style={{ fontWeight: 'bold', marginBottom: '6px' }}>Notes Log</p>
          {report.notes_log.map((log, i) => (
            <div key={i} style={{ background: '#f9f9f9', border: '1px solid #e5e7eb', borderRadius: '4px', padding: '8px', marginBottom: '6px' }}>
              <p style={{ margin: '0 0 4px' }}>{log.note}</p>
              <p style={{ margin: 0, fontSize: '9pt', color: '#777' }}>{log.added_by_name} — {log.date}</p>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '30px', borderTop: '1px solid #ddd', paddingTop: '10px', fontSize: '9pt', color: '#aaa', textAlign: 'center' }}>
        Printed on {new Date().toLocaleDateString()} • Confidential
      </div>
    </div>
  );
}

export default function IncidentReports() {
  const { user, canManage, isAdmin, isSuperAdmin } = useCurrentUser();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [newNote, setNewNote] = useState('');
  const [newNoteAttachment, setNewNoteAttachment] = useState(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [expandedNotesLog, setExpandedNotesLog] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState('');
  const printRef = useRef(null);

  const canSeePrivate = isAdmin || isSuperAdmin;
  const canAssign = canManage;

  const { data: allReports = [], isLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: () => base44.entities.IncidentReport.list('-created_date', 500),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => base44.entities.User.list(),
    enabled: canAssign,
  });

  const visibleReports = allReports.filter(r => {
    if (r.is_private && !canSeePrivate) {
      return r.reported_by === user?.email;
    }
    return true;
  });

  const activeReports = visibleReports.filter(r => r.status !== 'resolved');
  const archivedReports = visibleReports.filter(r => r.status === 'resolved');

  const visibleActive = canManage
    ? activeReports
    : activeReports.filter(r => r.reported_by === user?.email || r.assigned_to === user?.email);

  const filteredArchive = archivedReports.filter(r => {
    const q = archiveSearch.toLowerCase();
    return (
      r.title?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q) ||
      new Date(r.created_date).toLocaleDateString().includes(q)
    );
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
    onSuccess: (_, vars) => {
      toast.success('Report updated');
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      if (vars.closeAfter) setSelected(null);
    },
  });

  const handleSubmit = () => {
    if (!form.category || !form.title) return;
    const toNum = (v) => (v === '' || v === null || v === undefined) ? undefined : Number(v);
    createMutation.mutate({
      ...form,
      osha_days_away_from_work: toNum(form.osha_days_away_from_work),
      osha_days_on_restricted_duty: toNum(form.osha_days_on_restricted_duty),
      reported_by: user?.email,
      reported_by_name: user?.full_name,
    });
  };

  const handleStatusUpdate = (id, status) => {
    updateMutation.mutate({ id, data: { status }, closeAfter: status === 'resolved' });
  };

  const canEdit = (r) => {
    if (!r) return false;
    if (!r.assigned_to) return true;
    return r.assigned_to === user?.email || canManage;
  };

  const canPrint = (r) => {
    if (!r) return false;
    return canManage || r.assigned_to === user?.email;
  };

  const handlePrint = (report) => {
    const printWindow = window.open('', '_blank');
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Incident Report - ${report.title}</title>
        <style>
          @page { size: A4; margin: 20mm; }
          body { font-family: Arial, sans-serif; font-size: 11pt; color: #111; margin: 0; }
          * { box-sizing: border-box; }
        </style>
      </head>
      <body>${printRef.current?.innerHTML || ''}</body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  };

  const f = (key) => (e) => setForm({ ...form, [key]: e.target.value });

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
      ) : visibleActive.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No open incidents" description="Reported incidents will appear here" />
      ) : (
        <div className="space-y-3">
          {visibleActive.map(r => (
            <IncidentCard key={r.id} report={r} onClick={() => { setSelected(r); setExpandedNotesLog(false); setNewNote(''); }} />
          ))}
        </div>
      )}

      {/* Archive — managers+ only */}
      {canManage && archivedReports.length > 0 && (
        <div className="mt-8 border-t pt-6">
          <button
            onClick={() => setShowArchive(!showArchive)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-slate-700 transition-colors mb-4"
          >
            <Archive className="w-4 h-4 text-slate-500" />
            <ChevronDown className={`w-4 h-4 transition-transform ${showArchive ? 'rotate-180' : ''}`} />
            Archive — Resolved ({archivedReports.length})
          </button>
          {showArchive && (
            <div className="space-y-4">
              <Input
                placeholder="Search by title, description, or date..."
                value={archiveSearch}
                onChange={(e) => setArchiveSearch(e.target.value)}
                className="border-0 shadow-sm"
              />
              <div className="space-y-3">
                {filteredArchive.length === 0 ? (
                  <p className="text-sm text-slate-400 py-8 text-center">No archived reports match your search</p>
                ) : filteredArchive.map(r => (
                  <IncidentCard key={r.id} report={r} archived onClick={() => { setSelected(r); setExpandedNotesLog(false); setNewNote(''); }} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Report Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
          <DialogHeader><DialogTitle>Report an Incident</DialogTitle></DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-1">
            <div className="space-y-2">
              <Label>Incident Category <span className="text-red-500">*</span></Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {form.category && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date <span className="text-red-500">*</span></Label>
                    <Input type="date" value={form.incident_date} onChange={f('incident_date')} />
                  </div>
                  <div className="space-y-2">
                    <Label>Time (optional)</Label>
                    <Input type="time" value={form.incident_time} onChange={f('incident_time')} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Title <span className="text-red-500">*</span></Label>
                  <Input value={form.title} onChange={f('title')} placeholder="Brief description of the incident" />
                </div>

                {/* OSHA-specific form */}
                {form.category === 'osha_reportable' && (
                  <div className="border border-red-200 rounded-xl p-4 space-y-4 bg-red-50">
                    <p className="text-sm font-semibold text-red-800">OSHA — Employee's First Report of Injury or Illness</p>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Employee Full Name</Label>
                        <Input value={form.osha_employee_name} onChange={f('osha_employee_name')} />
                      </div>
                      <div className="space-y-2">
                        <Label>Job Title</Label>
                        <Input value={form.osha_job_title} onChange={f('osha_job_title')} />
                      </div>
                      <div className="space-y-2">
                        <Label>Date of Birth</Label>
                        <Input type="date" value={form.osha_date_of_birth} onChange={f('osha_date_of_birth')} />
                      </div>
                      <div className="space-y-2">
                        <Label>Date Hired</Label>
                        <Input type="date" value={form.osha_date_hired} onChange={f('osha_date_hired')} />
                      </div>
                      <div className="space-y-2">
                        <Label>Sex</Label>
                        <Select value={form.osha_sex} onValueChange={v => setForm({ ...form, osha_sex: v })}>
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                            <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Time of Incident</Label>
                        <Input type="time" value={form.osha_time_of_incident} onChange={f('osha_time_of_incident')} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>What was the employee doing just before the incident?</Label>
                      <Textarea value={form.osha_what_was_employee_doing} onChange={f('osha_what_was_employee_doing')} rows={2} />
                    </div>
                    <div className="space-y-2">
                      <Label>What happened? (How did the injury/illness occur?)</Label>
                      <Textarea value={form.osha_what_happened} onChange={f('osha_what_happened')} rows={2} />
                    </div>
                    <div className="space-y-2">
                      <Label>Nature of injury / illness and body part affected</Label>
                      <Input value={form.osha_injury_or_illness} onChange={f('osha_injury_or_illness')} placeholder="e.g. Laceration to left hand" />
                    </div>
                    <div className="space-y-2">
                      <Label>Object or substance that directly caused the harm</Label>
                      <Input value={form.osha_object_or_substance} onChange={f('osha_object_or_substance')} placeholder="e.g. Dog bite, chemical, floor" />
                    </div>

                    {/* Not Sure About Care checkbox */}
                    <div className="flex items-center gap-3 py-2 border-y border-red-200">
                      <Checkbox
                        id="not-sure-care"
                        checked={!!form.osha_not_sure_about_care}
                        onCheckedChange={v => setForm({ ...form, osha_not_sure_about_care: !!v })}
                      />
                      <div>
                        <Label htmlFor="not-sure-care" className="cursor-pointer font-medium text-red-900">Not Sure About Care</Label>
                        <p className="text-xs text-red-700">Check this if care details are unknown at this time</p>
                      </div>
                    </div>

                    {!form.osha_not_sure_about_care && (
                      <>
                        <div className="space-y-2">
                          <Label>Medical treatment received</Label>
                          <Select value={form.osha_medical_treatment} onValueChange={v => setForm({ ...form, osha_medical_treatment: v })}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="first_aid_only">First aid only (on-site)</SelectItem>
                              <SelectItem value="physician_or_er">Physician / Emergency Room</SelectItem>
                              <SelectItem value="hospitalized">Hospitalized overnight</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Days away from work</Label>
                            <Input type="number" min="0" value={form.osha_days_away_from_work} onChange={f('osha_days_away_from_work')} />
                          </div>
                          <div className="space-y-2">
                            <Label>Days on restricted duty</Label>
                            <Input type="number" min="0" value={form.osha_days_on_restricted_duty} onChange={f('osha_days_on_restricted_duty')} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Treating physician name</Label>
                          <Input value={form.osha_physician_name} onChange={f('osha_physician_name')} />
                        </div>
                        <div className="space-y-2">
                          <Label>Treatment facility name</Label>
                          <Input value={form.osha_treatment_facility} onChange={f('osha_treatment_facility')} />
                        </div>
                        <div className="space-y-2">
                          <Label>Treatment facility address</Label>
                          <Input value={form.osha_treatment_facility_address} onChange={f('osha_treatment_facility_address')} />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* General description for non-OSHA */}
                {form.category !== 'osha_reportable' && (
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={form.description} onChange={f('description')} rows={4} placeholder="Provide a detailed account of what happened..." />
                  </div>
                )}

                {/* Privacy checkbox */}
                <div className="flex items-center gap-3 pt-2 border-t">
                  <Checkbox
                    id="private-check"
                    checked={form.is_private}
                    onCheckedChange={v => setForm({ ...form, is_private: !!v })}
                  />
                  <div>
                    <Label htmlFor="private-check" className="cursor-pointer font-medium">Mark as Private</Label>
                    <p className="text-xs text-slate-400">Only admins and super admins will be able to view this report</p>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || !form.category || !form.title}
              className="bg-red-600 hover:bg-red-700 gap-2"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Submit Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => { setSelected(null); setNewNote(''); setNewNoteAttachment(null); setExpandedNotesLog(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected?.title}
              {selected?.is_private && <Lock className="w-4 h-4 text-slate-400" title="Private" />}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${categoryColors[selected.category]}`}>
                  {CATEGORIES.find(c => c.value === selected.category)?.label}
                </span>
                <StatusBadge status={selected.status} />
                {selected.is_private && (
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Private
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-slate-400 text-xs">Date</p><p className="font-medium">{selected.incident_date}</p></div>
                <div><p className="text-slate-400 text-xs">Reported By</p><p className="font-medium">{selected.reported_by_name}</p></div>
                {selected.incident_time && <div><p className="text-slate-400 text-xs">Time</p><p className="font-medium">{selected.incident_time}</p></div>}
                {selected.assigned_to && <div><p className="text-slate-400 text-xs">Assigned To</p><p className="font-medium text-purple-700">{selected.assigned_to}</p></div>}
              </div>

              {selected.description && (
                <div><p className="text-slate-400 text-xs mb-1">Description</p><p className="text-sm bg-slate-50 rounded-lg p-3">{selected.description}</p></div>
              )}

              {/* OSHA details */}
              {selected.category === 'osha_reportable' && (
                <div className="border border-red-200 rounded-xl p-4 space-y-3 bg-red-50">
                  <p className="text-sm font-semibold text-red-800">OSHA Report Details</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {selected.osha_employee_name && <div><span className="text-slate-400">Employee:</span> <span className="font-medium">{selected.osha_employee_name}</span></div>}
                    {selected.osha_job_title && <div><span className="text-slate-400">Job Title:</span> <span className="font-medium">{selected.osha_job_title}</span></div>}
                    {selected.osha_date_of_birth && <div><span className="text-slate-400">DOB:</span> <span className="font-medium">{selected.osha_date_of_birth}</span></div>}
                    {selected.osha_date_hired && <div><span className="text-slate-400">Date Hired:</span> <span className="font-medium">{selected.osha_date_hired}</span></div>}
                    {selected.osha_sex && <div><span className="text-slate-400">Sex:</span> <span className="font-medium capitalize">{selected.osha_sex.replace(/_/g,' ')}</span></div>}
                    {selected.osha_time_of_incident && <div><span className="text-slate-400">Time:</span> <span className="font-medium">{selected.osha_time_of_incident}</span></div>}
                  </div>
                  {selected.osha_what_was_employee_doing && <div><p className="text-slate-400 text-xs mb-1">What employee was doing:</p><p className="text-xs bg-white rounded p-2">{selected.osha_what_was_employee_doing}</p></div>}
                  {selected.osha_what_happened && <div><p className="text-slate-400 text-xs mb-1">What happened:</p><p className="text-xs bg-white rounded p-2">{selected.osha_what_happened}</p></div>}
                  {selected.osha_injury_or_illness && <div><p className="text-slate-400 text-xs mb-1">Injury/Illness:</p><p className="text-xs bg-white rounded p-2">{selected.osha_injury_or_illness}</p></div>}
                  {selected.osha_object_or_substance && <div><p className="text-slate-400 text-xs mb-1">Caused by:</p><p className="text-xs bg-white rounded p-2">{selected.osha_object_or_substance}</p></div>}

                  {selected.osha_not_sure_about_care ? (
                    <p className="text-xs italic text-red-700 mt-2">* Care details not yet determined at time of report</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                      {selected.osha_medical_treatment && <div><span className="text-slate-400">Treatment:</span> <span className="font-medium capitalize">{selected.osha_medical_treatment.replace(/_/g,' ')}</span></div>}
                      {selected.osha_days_away_from_work !== '' && selected.osha_days_away_from_work != null && <div><span className="text-slate-400">Days off:</span> <span className="font-medium">{selected.osha_days_away_from_work}</span></div>}
                      {selected.osha_days_on_restricted_duty !== '' && selected.osha_days_on_restricted_duty != null && <div><span className="text-slate-400">Restricted days:</span> <span className="font-medium">{selected.osha_days_on_restricted_duty}</span></div>}
                      {selected.osha_physician_name && <div className="col-span-2"><span className="text-slate-400">Physician:</span> <span className="font-medium">{selected.osha_physician_name}</span></div>}
                      {selected.osha_treatment_facility && <div className="col-span-2"><span className="text-slate-400">Facility:</span> <span className="font-medium">{selected.osha_treatment_facility}</span></div>}
                      {selected.osha_treatment_facility_address && <div className="col-span-2"><span className="text-slate-400">Address:</span> <span className="font-medium">{selected.osha_treatment_facility_address}</span></div>}
                    </div>
                  )}
                </div>
              )}

              {/* Status update */}
              {canEdit(selected) && selected.status !== 'resolved' && (
                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-medium text-slate-900">Update Status</p>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant={selected.status === 'open' ? 'default' : 'outline'} size="sm"
                      onClick={() => { handleStatusUpdate(selected.id, 'open'); setSelected({ ...selected, status: 'open' }); }}>
                      Open
                    </Button>
                    <Button variant={selected.status === 'under_review' ? 'default' : 'outline'} size="sm"
                      onClick={() => { handleStatusUpdate(selected.id, 'under_review'); setSelected({ ...selected, status: 'under_review' }); }}>
                      Under Review
                    </Button>
                    {canManage && (
                      <Button className="bg-emerald-600 hover:bg-emerald-700" size="sm"
                        onClick={() => handleStatusUpdate(selected.id, 'resolved')}>
                        Resolve
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Add Note */}
              {canEdit(selected) && (
                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-medium text-slate-900">Add Note</p>
                  <Textarea placeholder="Add a note" value={newNote} onChange={e => setNewNote(e.target.value)} rows={2} />
                  <div className="space-y-1">
                    <Label className="text-xs">Attachment (optional)</Label>
                    <input type="file" className="text-xs text-slate-600" onChange={e => setNewNoteAttachment(e.target.files?.[0] || null)} disabled={uploadingAttachment} />
                  </div>
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={async () => {
                      if (!newNote.trim() || !user || !selected) return;
                      let attachmentUrl = null;
                      if (newNoteAttachment) {
                        setUploadingAttachment(true);
                        const { file_url } = await base44.integrations.Core.UploadFile({ file: newNoteAttachment });
                        attachmentUrl = file_url;
                        setUploadingAttachment(false);
                      }
                      const noteEntry = {
                        note: newNote,
                        date: new Date().toISOString().split('T')[0],
                        added_by: user.email,
                        added_by_name: user.full_name || user.email,
                        ...(attachmentUrl && { attachment_url: attachmentUrl })
                      };
                      await base44.entities.IncidentReport.update(selected.id, {
                        notes_log: [...(selected.notes_log || []), noteEntry]
                      });
                      queryClient.invalidateQueries({ queryKey: ['incidents'] });
                      setNewNote('');
                      setNewNoteAttachment(null);
                      setSelected({ ...selected, notes_log: [...(selected.notes_log || []), noteEntry] });
                      toast.success('Note added');
                    }}
                    disabled={!newNote.trim() || uploadingAttachment}
                  >
                    {uploadingAttachment && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Add Note
                  </Button>
                </div>
              )}

              {/* Notes Log */}
              {selected.notes_log?.length > 0 && (
                <div className="border-t pt-4">
                  <button onClick={() => setExpandedNotesLog(!expandedNotesLog)} className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors">
                    <ChevronDown className={`w-4 h-4 transition-transform ${expandedNotesLog ? 'rotate-180' : ''}`} />
                    Notes Log ({selected.notes_log.length})
                  </button>
                  {expandedNotesLog && (
                    <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                      {selected.notes_log.map((log, idx) => (
                        <div key={idx} className="text-xs bg-slate-50 rounded p-2">
                          <p className="text-slate-700">{log.note}</p>
                          <div className="text-xs text-slate-400 mt-1">{log.added_by_name} • {log.date}</div>
                          {log.attachment_url && (
                            <a href={log.attachment_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline flex items-center gap-1 mt-1.5">
                              <Paperclip className="w-3 h-3" /> View Attachment
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Assign To */}
              {canAssign && selected.status !== 'resolved' && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-slate-900 mb-2">Assign To (optional)</p>
                  <Select
                    value={selected.assigned_to || ''}
                    onValueChange={v => {
                      const val = v || null;
                      updateMutation.mutate({ id: selected.id, data: { assigned_to: val } });
                      setSelected({ ...selected, assigned_to: val });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>Unassigned</SelectItem>
                      {allUsers.map(u => (
                        <SelectItem key={u.id} value={u.email}>{u.full_name || u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Print Button */}
              {canPrint(selected) && (
                <div className="border-t pt-4">
                  {/* Hidden printable version */}
                  <div ref={printRef} style={{ display: 'none' }}>
                    <PrintableReport report={selected} />
                  </div>
                  <Button
                    variant="outline"
                    className="gap-2 w-full"
                    onClick={() => handlePrint(selected)}
                  >
                    <Printer className="w-4 h-4" /> Print as PDF (A4)
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IncidentCard({ report, onClick, archived }) {
  return (
    <Card
      className={`border-0 shadow-sm hover:shadow-md transition-all cursor-pointer ${archived ? 'bg-emerald-50' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${archived ? 'bg-emerald-100' : 'bg-red-100'}`}>
              <AlertTriangle className={`w-5 h-5 ${archived ? 'text-emerald-600' : 'text-red-600'}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-slate-900 truncate">{report.title}</p>
                {report.is_private && <Lock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full font-medium ${categoryColors[report.category]}`}>
                  {CATEGORIES.find(c => c.value === report.category)?.label}
                </span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{report.incident_date}</span>
                <span className="flex items-center gap-1"><User className="w-3 h-3" />{report.reported_by_name}</span>
              </div>
            </div>
          </div>
          <div className="flex-shrink-0">
            <StatusBadge status={report.status} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}