import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Clock, User, RotateCcw, Eye } from 'lucide-react';
import { toast } from "sonner";

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

  const rollbackMutation = useMutation({
    mutationFn: async (version) => {
      return base44.entities.SOP.update(sopId, {
        content: version.content,
        summary: version.summary,
        title: version.title,
        tags: version.tags,
        category: version.category,
        version: version.version_number,
        last_updated_by: user?.email,
        last_updated_by_name: user?.full_name,
      });
    },
    onSuccess: () => {
      toast.success('Rolled back successfully');
      queryClient.invalidateQueries({ queryKey: ['sops'] });
      navigate(createPageUrl('SOPDetail') + `?id=${sopId}`);
    },
  });

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
            <Card key={v.id} className={`border-0 shadow-sm ${i === 0 ? 'ring-2 ring-indigo-200' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${i === 0 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      v{v.version_number}
                    </div>
                    <div>
                      {i === 0 && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium mr-2">Current</span>}
                      <p className="font-medium text-slate-900 inline">{v.change_summary || 'No change summary'}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><User className="w-3 h-3" />{v.created_by_name}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(v.created_date).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setPreviewing(v)} className="gap-1">
                      <Eye className="w-4 h-4" />
                    </Button>
                    {canManage && i !== 0 && (
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
          <div className="prose prose-sm prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: previewing?.content }} />
          <DialogFooter>
            {canManage && (
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