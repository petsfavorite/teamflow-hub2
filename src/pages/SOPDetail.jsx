import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import StatusBadge from '../components/shared/StatusBadge';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Pencil, Tag, Clock, User, CheckCircle, History, Users, Loader2, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from "sonner";

export default function SOPDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const { user, canManage, isAdmin, isSuperAdmin } = useCurrentUser();
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

  const approveMutation = useMutation({
    mutationFn: async (approve) => {
      if (approve) {
        return base44.entities.SOP.update(id, {
          content: sop.pending_content,
          summary: sop.pending_summary,
          tags: sop.pending_tags,
          version: (sop.version || 1) + 1,
          last_updated_by: sop.pending_submitted_by,
          last_updated_by_name: sop.pending_submitted_by_name,
          status: 'published',
          pending_content: null,
          pending_summary: null,
          pending_tags: null,
          pending_change_summary: null,
          pending_submitted_by: null,
          pending_submitted_by_name: null,
        }).then(async (result) => {
          await base44.entities.SOPVersion.create({
            sop_id: id,
            version_number: (sop.version || 1) + 1,
            title: sop.title,
            content: sop.pending_content,
            summary: sop.pending_summary,
            tags: sop.pending_tags,
            category: sop.category,
            change_summary: sop.pending_change_summary || 'Manager update (approved)',
            created_by_name: sop.pending_submitted_by_name,
          });
          return result;
        });
      } else {
        return base44.entities.SOP.update(id, {
          status: sop.status === 'pending_approval' ? 'draft' : sop.status,
          pending_content: null,
          pending_summary: null,
          pending_tags: null,
          pending_change_summary: null,
          pending_submitted_by: null,
          pending_submitted_by_name: null,
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
      sop_id: id,
      sop_title: sop.title,
      version_number: sop.version,
      user_email: user.email,
      user_name: user.full_name,
      acknowledged_at: new Date().toISOString(),
    }),
    onSuccess: () => {
      toast.success('SOP acknowledged!');
      queryClient.invalidateQueries({ queryKey: ['my-ack'] });
      queryClient.invalidateQueries({ queryKey: ['ack'] });
    },
  });

  const acknowledgedEmails = acknowledgements.filter(a => a.version_number === sop?.version).map(a => a.user_email);
  const notAcknowledged = allUsers.filter(u => u.role === 'user' && !acknowledgedEmails.includes(u.email));

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
          {canManage && (
            <Link to={createPageUrl('SOPEditor') + `?id=${sop.id}`}>
              <Button variant="outline" className="gap-2"><Pencil className="w-4 h-4" /> Edit</Button>
            </Link>
          )}
        </div>
      </div>

      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="p-8">
          <div className="flex items-center gap-3 mb-4">
            <StatusBadge status={sop.status} />
            <span className="text-sm text-slate-400">Version {sop.version || 1}</span>
          </div>

          <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-4">{sop.title}</h1>

          <div className="flex flex-wrap gap-4 text-sm text-slate-500 mb-8 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-1.5"><Tag className="w-4 h-4" />{sop.category}</div>
            <div className="flex items-center gap-1.5"><Clock className="w-4 h-4" />Updated {new Date(sop.updated_date).toLocaleDateString()}</div>
            {sop.last_updated_by_name && <div className="flex items-center gap-1.5"><User className="w-4 h-4" />by {sop.last_updated_by_name}</div>}
          </div>

          {sop.summary && (
            <div className="bg-indigo-50 rounded-xl p-4 mb-8">
              <p className="text-sm font-medium text-indigo-700">{sop.summary}</p>
            </div>
          )}

          <div className="prose prose-slate max-w-none prose-headings:font-semibold prose-a:text-indigo-600" dangerouslySetInnerHTML={{ __html: sop.content }} />

          {sop.tags?.length > 0 && (
            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap gap-2">
              {sop.tags.map(tag => (
                <span key={tag} className="px-3 py-1 rounded-full bg-slate-100 text-xs font-medium text-slate-600">{tag}</span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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

      {/* Manager: who hasn't acknowledged */}
      {canManage && sop.requires_acknowledgement && notAcknowledged.length > 0 && (
        <Card className="border-0 shadow-sm border-l-4 border-l-amber-400">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-amber-600" />
              <p className="font-semibold text-amber-800">{notAcknowledged.length} staff member{notAcknowledged.length > 1 ? 's' : ''} haven't acknowledged v{sop.version}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {notAcknowledged.map(u => (
                <span key={u.id} className="px-3 py-1 bg-amber-50 text-amber-700 text-xs rounded-full font-medium">{u.full_name || u.email}</span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}