import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import StatusBadge from '../components/shared/StatusBadge';
import SOPQRCode from '../components/sop/SOPQRCode';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft, Pencil, Tag, Clock, User, CheckCircle, History, Users, Loader2,
  ShieldAlert, CheckCircle2, XCircle, Video, AlertTriangle, UserCheck,
  CalendarCheck, Wrench, BookOpen, PlayCircle
} from 'lucide-react';
import { toast } from "sonner";
import { addDays, format, differenceInDays, parseISO } from 'date-fns';

export default function SOPDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const { user, canManage, isAdmin, isSuperAdmin, isManager } = useCurrentUser();
  const canApprove = isAdmin || isSuperAdmin;
  const queryClient = useQueryClient();

  const { data: sop, isLoading } = useQuery({
    queryKey: ['sop', id],
    queryFn: async () => {
      const list = await base44.entities.SOP.filter({ id });
      return list[0];
    },
    enabled: !!id,
  });

  const { data: acknowledgements = [] } = useQuery({
    queryKey: ['ack', id],
    queryFn: () => base44.entities.SOPAcknowledgement.filter({ sop_id: id }),
    enabled: !!id && canManage,
  });

  const { data: myAck } = useQuery({
    queryKey: ['my-ack', id, user?.email],
    queryFn: async () => {
      const list = await base44.entities.SOPAcknowledgement.filter({ sop_id: id, user_email: user?.email });
      return list[0];
    },
    enabled: !!id && !!user?.email,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users-for-ack'],
    queryFn: () => base44.entities.User.list('full_name', 200),
    enabled: canManage,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list('name', 100),
    enabled: canManage,
  });

  const approveMutation = useMutation({
    mutationFn: async (approve) => {
      if (approve) {
        return base44.entities.SOP.update(id, {
          content: sop.pending_content,
          instructions: sop.pending_content,
          summary: sop.pending_summary,
          tags: sop.pending_tags,
          version: (sop.version || 1) + 1,
          last_updated_by: sop.pending_submitted_by,
          last_updated_by_name: sop.pending_submitted_by_name,
          status: 'published',
          pending_content: null, pending_summary: null, pending_tags: null,
          pending_change_summary: null, pending_submitted_by: null, pending_submitted_by_name: null,
        }).then(async (result) => {
          await base44.entities.SOPVersion.create({
            sop_id: id, version_number: (sop.version || 1) + 1, title: sop.title,
            content: sop.pending_content, summary: sop.pending_summary, tags: sop.pending_tags,
            category: sop.category, change_summary: sop.pending_change_summary || 'Manager update (approved)',
            created_by_name: sop.pending_submitted_by_name,
          });
          return result;
        });
      } else {
        return base44.entities.SOP.update(id, {
          status: sop.status === 'pending_approval' ? 'draft' : sop.status,
          pending_content: null, pending_summary: null, pending_tags: null,
          pending_change_summary: null, pending_submitted_by: null, pending_submitted_by_name: null,
        });
      }
    },
    onSuccess: (_, approve) => {
      toast.success(approve ? 'Changes approved and published!' : 'Changes rejected');
      queryClient.invalidateQueries({ queryKey: ['sop', id] });
      queryClient.invalidateQueries({ queryKey: ['sops'] });
      queryClient.invalidateQueries({ queryKey: ['sop-versions'] });
    },
  });

  const ackMutation = useMutation({
    mutationFn: () => base44.entities.SOPAcknowledgement.create({
      sop_id: id, sop_title: sop.title, version_number: sop.version,
      user_email: user.email, user_name: user.full_name,
      acknowledged_at: new Date().toISOString(),
    }),
    onSuccess: () => {
      toast.success('SOP acknowledged!');
      queryClient.invalidateQueries({ queryKey: ['my-ack'] });
      queryClient.invalidateQueries({ queryKey: ['ack'] });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () => base44.entities.SOP.update(id, {
      last_verified_by: user.email,
      last_verified_by_name: user.full_name,
      last_verified_at: new Date().toISOString(),
      verification_due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    }),
    onSuccess: () => {
      toast.success('SOP verified! Next verification set for 30 days out.');
      queryClient.invalidateQueries({ queryKey: ['sop', id] });
      queryClient.invalidateQueries({ queryKey: ['sops'] });
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>;
  }

  if (!sop) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">SOP not found</p>
        <Link to={createPageUrl('SOPs')}><Button variant="ghost" className="mt-4">Back to SOPs</Button></Link>
      </div>
    );
  }

  const myCurrentAck = myAck?.version_number === sop.version;
  const currentAcks = acknowledgements.filter(a => a.version_number === sop?.version);
  const acknowledgedEmails = currentAcks.map(a => a.user_email);
  const notAcknowledged = allUsers.filter(u => !acknowledgedEmails.includes(u.email));
  const acknowledged = allUsers.filter(u => acknowledgedEmails.includes(u.email));

  // Verification
  const verificationDaysLeft = sop.verification_due_date
    ? differenceInDays(parseISO(sop.verification_due_date), new Date())
    : null;
  const verificationOverdue = verificationDaysLeft !== null && verificationDaysLeft < 0;
  const verificationSoon = verificationDaysLeft !== null && verificationDaysLeft <= 7 && verificationDaysLeft >= 0;

  // Can user verify? Must be manager/admin on an applicable team
  const applicableTeams = teams.filter(t => (sop.applicable_teams || []).includes(t.id));
  const userTeams = teams.filter(t => (t.member_emails || []).includes(user?.email));
  const isOnApplicableTeam = applicableTeams.length === 0 || userTeams.some(ut => (sop.applicable_teams || []).includes(ut.id));
  const canVerify = canManage && isOnApplicableTeam;

  // Display instructions (prefer structured field, fallback to legacy content)
  const displayInstructions = sop.instructions || sop.content;

  const teamNames = applicableTeams.map(t => t.name);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Link to={createPageUrl('SOPs')}>
          <Button variant="ghost" className="gap-2 text-slate-600"><ArrowLeft className="w-4 h-4" /> Back to SOPs</Button>
        </Link>
        <div className="flex gap-2">
          {canManage && (
            <Link to={createPageUrl('SOPVersions') + `?id=${sop.id}`}>
              <Button variant="outline" className="gap-2"><History className="w-4 h-4" /> History</Button>
            </Link>
          )}
          <SOPQRCode sop={sop} />
          {canManage && (
            <Link to={createPageUrl('SOPEditor') + `?id=${sop.id}`}>
              <Button variant="outline" className="gap-2"><Pencil className="w-4 h-4" /> Edit</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Header Card */}
      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="p-8">
          <div className="flex items-center gap-3 mb-3">
            <StatusBadge status={canApprove ? sop.status : (sop.status === 'pending_approval' ? 'published' : sop.status)} />
            <span className="text-sm text-slate-400">Version {sop.version || 1}</span>
          </div>

          <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-4">{sop.title}</h1>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500 mb-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-1.5"><Tag className="w-4 h-4" />{sop.category}</div>
            <div className="flex items-center gap-1.5"><Clock className="w-4 h-4" />Created {new Date(sop.created_date).toLocaleDateString()}</div>
            <div className="flex items-center gap-1.5"><Clock className="w-4 h-4" />Updated {new Date(sop.updated_date).toLocaleDateString()}</div>
            {sop.last_updated_by_name && <div className="flex items-center gap-1.5"><User className="w-4 h-4" />by {sop.last_updated_by_name}</div>}
            {teamNames.length > 0 && (
              <div className="flex items-center gap-1.5"><Users className="w-4 h-4" />{teamNames.join(', ')}</div>
            )}
            {sop.responsible_role && (
              <div className="flex items-center gap-1.5"><UserCheck className="w-4 h-4" />Responsible: {sop.responsible_role}</div>
            )}
          </div>

          {sop.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {sop.tags.map(tag => (
                <span key={tag} className="px-3 py-1 rounded-full bg-slate-100 text-xs font-medium text-slate-600">{tag}</span>
              ))}
            </div>
          )}

          {sop.summary && (
            <div className="bg-indigo-50 rounded-xl p-4">
              <p className="text-sm font-medium text-indigo-700">{sop.summary}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Verification Banner */}
      {(verificationOverdue || verificationSoon) && canVerify && (
        <Card className={`border-0 shadow-sm mb-4 border-l-4 ${verificationOverdue ? 'border-l-red-500' : 'border-l-amber-400'}`}>
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CalendarCheck className={`w-5 h-5 ${verificationOverdue ? 'text-red-600' : 'text-amber-600'}`} />
              <p className={`text-sm font-semibold ${verificationOverdue ? 'text-red-800' : 'text-amber-800'}`}>
                {verificationOverdue
                  ? `Verification overdue by ${Math.abs(verificationDaysLeft)} day${Math.abs(verificationDaysLeft) !== 1 ? 's' : ''}!`
                  : `Verification due in ${verificationDaysLeft} day${verificationDaysLeft !== 1 ? 's' : ''}`}
              </p>
            </div>
            <Button onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending} size="sm"
              className={verificationOverdue ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}>
              {verifyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Mark Verified
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Verification info (non-urgent) */}
      {sop.verification_due_date && !verificationOverdue && !verificationSoon && canManage && (
        <Card className="border-0 shadow-sm mb-4">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <CalendarCheck className="w-4 h-4 text-emerald-600" />
              <span>Next verification due: <strong>{new Date(sop.verification_due_date + 'T12:00:00').toLocaleDateString()}</strong></span>
              {sop.last_verified_by_name && <span className="text-slate-400">· Last verified by {sop.last_verified_by_name}</span>}
            </div>
            {canVerify && (
              <Button variant="outline" size="sm" onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending} className="gap-1">
                {verifyMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Verify Now
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Purpose */}
      {sop.purpose && (
        <Card className="border-0 shadow-sm mb-4">
          <CardContent className="p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-2 flex items-center gap-2"><BookOpen className="w-4 h-4 text-indigo-500" /> Purpose</h2>
            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{sop.purpose}</p>
          </CardContent>
        </Card>
      )}

      {/* When it applies */}
      {sop.when_it_applies && (
        <Card className="border-0 shadow-sm mb-4">
          <CardContent className="p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-2 flex items-center gap-2"><Tag className="w-4 h-4 text-slate-500" /> When It Applies</h2>
            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{sop.when_it_applies}</p>
          </CardContent>
        </Card>
      )}

      {/* Required Tools */}
      {sop.required_tools && (
        <Card className="border-0 shadow-sm mb-4">
          <CardContent className="p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-2 flex items-center gap-2"><Wrench className="w-4 h-4 text-slate-500" /> Required Tools / Materials</h2>
            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{sop.required_tools}</p>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {sop.warnings && (
        <Card className="border-0 shadow-sm mb-4 border-l-4 border-l-amber-400">
          <CardContent className="p-6">
            <h2 className="text-base font-semibold text-amber-800 mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-600" /> Warnings / Cautions</h2>
            <p className="text-amber-900 text-sm leading-relaxed whitespace-pre-wrap">{sop.warnings}</p>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="p-8">
          <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-indigo-500" /> Step-by-Step Instructions</h2>
          <div className="prose prose-slate max-w-none prose-headings:font-semibold prose-a:text-indigo-600"
            dangerouslySetInnerHTML={{ __html: displayInstructions || '<p class="text-slate-400 italic">No instructions added yet.</p>' }} />
        </CardContent>
      </Card>

      {/* Video */}
      {sop.video_url && (
        <Card className="border-0 shadow-sm mb-4">
          <CardContent className="p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2"><PlayCircle className="w-4 h-4 text-indigo-500" /> Training Video</h2>
            <a href={sop.video_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium">
              <Video className="w-4 h-4" /> Watch Video
            </a>
          </CardContent>
        </Card>
      )}

      {/* Pending approval banner */}
      {sop.status === 'pending_approval' && sop.pending_content && canApprove && (
        <Card className="border-0 shadow-sm border-l-4 border-l-amber-500 mb-4">
          <CardContent className="p-6">
            <div className="flex items-start gap-3 mb-4">
              <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-amber-900">Pending Manager Edit — Awaiting Approval</p>
                <p className="text-sm text-amber-700">Submitted by <strong>{sop.pending_submitted_by_name}</strong>{sop.pending_change_summary ? ` — "${sop.pending_change_summary}"` : ''}</p>
              </div>
            </div>
            <div className="prose prose-sm prose-slate max-w-none bg-amber-50 rounded-lg p-4 mb-4 max-h-60 overflow-y-auto" dangerouslySetInnerHTML={{ __html: sop.pending_content }} />
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => approveMutation.mutate(false)} disabled={approveMutation.isPending} className="gap-2 border-red-200 text-red-700 hover:bg-red-50">
                <XCircle className="w-4 h-4" /> Reject
              </Button>
              <Button onClick={() => approveMutation.mutate(true)} disabled={approveMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Approve & Publish
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {sop.status === 'pending_approval' && !canApprove && (
        <Card className="border-0 shadow-sm border-l-4 border-l-amber-400 mb-4">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <p className="text-sm text-amber-800">This SOP has a pending edit awaiting admin approval.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Acknowledgement section */}
      {sop.requires_acknowledgement && (
        <Card className="border-0 shadow-sm mb-4">
          <CardContent className="p-6">
            {!myCurrentAck ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">Acknowledgement Required</p>
                  <p className="text-sm text-slate-500">Please confirm you have read and understood this SOP</p>
                </div>
                <Button onClick={() => ackMutation.mutate()} disabled={ackMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                  {ackMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  I've Read This
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-700">You acknowledged this version on {new Date(myAck.acknowledged_at).toLocaleDateString()}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Manager: acknowledgement status */}
      {canManage && sop.requires_acknowledgement && allUsers.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-slate-600" />
              <p className="font-semibold text-slate-800">Acknowledgement Status — v{sop.version}</p>
              <span className="ml-auto text-xs text-slate-500">{acknowledgedEmails.length}/{allUsers.length} read</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {acknowledged.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Read ({acknowledged.length})</p>
                  <div className="space-y-1">
                    {acknowledged.map(u => {
                      const ack = currentAcks.find(a => a.user_email === u.email);
                      return (
                        <div key={u.id} className="flex items-center justify-between px-3 py-1.5 bg-emerald-50 rounded-lg">
                          <span className="text-xs font-medium text-slate-700">{u.full_name || u.email}</span>
                          {ack?.acknowledged_at && <span className="text-xs text-slate-400">{new Date(ack.acknowledged_at).toLocaleDateString()}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {notAcknowledged.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Not Yet Read ({notAcknowledged.length})</p>
                  <div className="space-y-1">
                    {notAcknowledged.map(u => (
                      <div key={u.id} className="flex items-center px-3 py-1.5 bg-amber-50 rounded-lg">
                        <span className="text-xs font-medium text-slate-700">{u.full_name || u.email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}