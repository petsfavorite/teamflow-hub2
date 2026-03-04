import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import StatusBadge from '../components/shared/StatusBadge';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Pencil, Tag, Clock, User } from 'lucide-react';

export default function SOPDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const { isAdmin, canManage } = useCurrentUser();

  const { data: sop, isLoading } = useQuery({
    queryKey: ['sop', id],
    queryFn: async () => {
      const list = await base44.entities.SOP.filter({ id });
      return list[0];
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!sop) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">SOP not found</p>
        <Link to={createPageUrl('SOPs')}>
          <Button variant="ghost" className="mt-4">Back to SOPs</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Link to={createPageUrl('SOPs')}>
          <Button variant="ghost" className="gap-2 text-slate-600">
            <ArrowLeft className="w-4 h-4" /> Back to SOPs
          </Button>
        </Link>
        {canManage && (
          <Link to={createPageUrl('SOPEditor') + `?id=${sop.id}`}>
            <Button variant="outline" className="gap-2">
              <Pencil className="w-4 h-4" /> Edit
            </Button>
          </Link>
        )}
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-8">
          <div className="flex items-center gap-3 mb-4">
            <StatusBadge status={sop.status} />
            <span className="text-sm text-slate-400">Version {sop.version || 1}</span>
          </div>

          <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-4">{sop.title}</h1>

          <div className="flex flex-wrap gap-4 text-sm text-slate-500 mb-8 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <Tag className="w-4 h-4" />
              {sop.category}
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              Updated {new Date(sop.updated_date).toLocaleDateString()}
            </div>
            <div className="flex items-center gap-1.5">
              <User className="w-4 h-4" />
              {sop.created_by}
            </div>
          </div>

          {sop.summary && (
            <div className="bg-indigo-50 rounded-xl p-4 mb-8">
              <p className="text-sm font-medium text-indigo-700">{sop.summary}</p>
            </div>
          )}

          <div
            className="prose prose-slate max-w-none prose-headings:font-semibold prose-a:text-indigo-600"
            dangerouslySetInnerHTML={{ __html: sop.content }}
          />

          {sop.tags?.length > 0 && (
            <div className="mt-8 pt-6 border-t border-slate-100">
              <div className="flex flex-wrap gap-2">
                {sop.tags.map(tag => (
                  <span key={tag} className="px-3 py-1 rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}