import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getUserDisplayName } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Clock, User, RotateCcw, Eye } from 'lucide-react';
import { toast } from "sonner";
import { formatDateTime } from '@/lib/timezone';
import { SOP_RESTORE_FIELDS, pick, sanitizeHtml, publishStamp, recordVersion, isLive } from '@/lib/sop';

export default function SOPVersions() {
  const params = new URLSearchParams(window.location.search);
  const sopId = params.get('id');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, canManage, isAdmin, isSuperAdmin } = useCurrentUser();
  const canSeeAllVersions = canManage;
  const canRollback = isAdmin || isSuperAdmin;
  const [previewing, setPreviewing] = useState(null);

  const { data: sop } = useQuery({
    queryKey: ['sop-for-versions', sopId],
    queryFn: async () => {
      const list = await base44.entities.SOP.filter({ id: sopId });
      return list[0];
    },
    enabled: !!sopId,
  });

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['sop-versions', sopId],
    queryFn: () => base44.entities.SOPVersion.filter({ sop_id: sopId }, '-version_number', 50),
    enabled: !!sopId,
  });

  // Restoring creates a NEW version (current + 1) holding the old content, so history stays linear
  // and staff are asked to acknowledge it like any other update.
  const rollbackMutation = useMutation({
    mutationFn: async (version) => {
      const latest = (await base44.entities.SOP.filter({ id: sopId }))[0];
      if (!latest) throw new Error('SOP not found');
      const snap = version.snapshot || {
        title: version.title, category: version.category, summary: version.summary,
        tags: version.tags, instructions: version.content,
      };
      const fields = pick({ ...snap, instructions: snap.instructions ?? version.content }, SOP_RESTORE_FIELDS);
      const newVersion = Math.max(latest.version || 1, ...versions.map(v => v.version_number || 0)) + 1;
      const update = {
        ...fields,
        content: fields.instructions,
        version: newVersion,
        last_updated_by: user?.email,
        last_updated_by_name: getUserDisplayName(user),
        ...(isLive(latest) ? publishStamp({ email: user?.email, name: getUserDisplayName(user) }) : {}),
      };
      await base44.entities.SOP.update(sopId, update);
      await recordVersion(sopId, newVersion, { ...latest, ...update }, `Restored from v${version.version_number}`, getUserDisplayName(user));
      return newVersion;
    },
    onSuccess: (newVersion, version) => {
      toast.success(`Restored v${version.version_number} as new version v${newVersion}`);
      ['sops', 'sops-all', 'sops-live', 'sop', 'sop-versions', 'sops-pending-ack', 'sops-pending-ack-dash']
        .forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      navigate(createPageUrl('SOPDetail') + `?id=${sopId}`);
    },
    onError: (e) => toast.error('Restore failed: ' + (e?.message || 'unknown error')),
  });

  const currentVersionNumber = sop?.version;
  // Older data can hold duplicate rows for one version number; only the newest row is "current".
  const currentRowId = versions.find(v => v.version_number === currentVersionNumber)?.id ?? versions[0]?.id;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to={createPageUrl('SOPDetail') + `?id=${sopId}`}>
          <Button variant="ghost" className="gap-2 text-slate-600"><ArrowLeft className="w-4 h-4" /> Back to SOP</Button>
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">Version History</h1>
      {sop && <p className="text-slate-500 mb-6">{sop.title}</p>}

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse"/>)}</div>
      ) : versions.length === 0 ? (
        <p className="text-slate-400 text-center py-12">No version history yet</p>
      ) : (
        <div className="space-y-3">
          {!canSeeAllVersions && versions.length > 3 && (
            <p className="text-xs text-slate-400 text-center mb-3 bg-slate-50 rounded-lg py-2">
              Showing your 3 most recent versions. Managers can view full history.
            </p>
          )}
          {(canSeeAllVersions ? versions : versions.slice(0, 3)).map((v, i) => (
            <Card key={v.id} className={`border-0 shadow-sm ${v.id === currentRowId ? 'ring-2 ring-indigo-200' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${v.id === currentRowId ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      v{v.version_number}
                    </div>
                    <div>
                      {v.id === currentRowId && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium mr-2">Current</span>}
                      <p className="font-medium text-slate-900 inline">{v.change_summary || 'No change summary'}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><User className="w-3 h-3" />{v.created_by_name}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDateTime(v.created_date)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setPreviewing(v)} className="gap-1">
                      <Eye className="w-4 h-4" />
                    </Button>
                    {canRollback && v.id !== currentRowId && (
                      <Button variant="outline" size="sm" onClick={() => rollbackMutation.mutate(v)} className="gap-1">
                        <RotateCcw className="w-3.5 h-3.5" /> Restore
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!previewing} onOpenChange={() => setPreviewing(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>v{previewing?.version_number} — {previewing?.change_summary}</DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewing?.snapshot?.instructions || previewing?.content) }} />
          <DialogFooter>
            {canRollback && previewing?.id !== currentRowId && (
              <Button onClick={() => { rollbackMutation.mutate(previewing); setPreviewing(null); }} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                <RotateCcw className="w-4 h-4" /> Restore This Version
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}