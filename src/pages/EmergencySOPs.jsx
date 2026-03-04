import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, ChevronRight, Zap } from 'lucide-react';

const EMERGENCY_TAGS = ['emergency', 'Emergency', 'urgent', 'safety', 'Safety'];
const EMERGENCY_KEYWORDS = ['dog fight', 'emergency', 'evacuation', 'fire', 'injury', 'escape', 'collapse', 'aggressive'];

const EMERGENCY_CATEGORIES = [
  { label: 'Dog Fight', emoji: '🐕', keywords: ['dog fight', 'fight'] },
  { label: 'Animal Collapse', emoji: '💔', keywords: ['collapse', 'unconscious', 'unresponsive'] },
  { label: 'Fire Evacuation', emoji: '🔥', keywords: ['fire', 'evacuation', 'evacuate'] },
  { label: 'Aggressive Animal', emoji: '⚠️', keywords: ['aggressive', 'bite', 'attack'] },
  { label: 'Staff Injury', emoji: '🚑', keywords: ['staff injury', 'injury', 'hurt'] },
  { label: 'Medical Emergency', emoji: '🏥', keywords: ['medical', 'medical emergency'] },
  { label: 'Animal Escape', emoji: '🚨', keywords: ['escape', 'escaped', 'loose'] },
];

function matchesEmergency(sop) {
  const text = `${sop.title} ${sop.summary || ''} ${sop.tags?.join(' ') || ''} ${sop.category || ''}`.toLowerCase();
  return EMERGENCY_TAGS.some(t => sop.tags?.includes(t)) ||
    EMERGENCY_KEYWORDS.some(k => text.includes(k));
}

export default function EmergencySOPs() {
  const { data: sops = [], isLoading } = useQuery({
    queryKey: ['sops-emergency'],
    queryFn: () => base44.entities.SOP.filter({ status: 'published' }, '-updated_date', 200),
  });

  const emergencySOPs = sops.filter(matchesEmergency);

  // Group by emergency category
  const categorized = EMERGENCY_CATEGORIES.map(cat => ({
    ...cat,
    sops: emergencySOPs.filter(sop => {
      const text = `${sop.title} ${sop.summary || ''} ${sop.tags?.join(' ') || ''}`.toLowerCase();
      return cat.keywords.some(k => text.includes(k));
    }),
  })).filter(c => c.sops.length > 0);

  const uncategorized = emergencySOPs.filter(sop => {
    return !EMERGENCY_CATEGORIES.some(cat => {
      const text = `${sop.title} ${sop.summary || ''} ${sop.tags?.join(' ') || ''}`.toLowerCase();
      return cat.keywords.some(k => text.includes(k));
    });
  });

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="bg-red-600 rounded-2xl p-6 mb-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Emergency Procedures</h1>
            <p className="text-red-100 text-sm">Quick access to critical SOPs</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="border-0 shadow-sm animate-pulse">
              <CardContent className="p-4"><div className="h-14 bg-slate-100 rounded" /></CardContent>
            </Card>
          ))}
        </div>
      ) : emergencySOPs.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">No emergency SOPs found</p>
            <p className="text-sm text-slate-400 mt-1">Tag SOPs with "emergency", "safety", or "urgent" to show them here</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {categorized.map(cat => (
            <div key={cat.label}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-xl">{cat.emoji}</span>
                <h2 className="font-bold text-slate-800">{cat.label}</h2>
              </div>
              <div className="space-y-2">
                {cat.sops.map(sop => (
                  <Link key={sop.id} to={createPageUrl('SOPDetail') + `?id=${sop.id}`}>
                    <Card className="border-0 shadow-sm hover:shadow-md transition-all bg-red-50 border-l-4 border-l-red-400 cursor-pointer">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{sop.title}</p>
                          {sop.summary && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{sop.summary}</p>}
                        </div>
                        <ChevronRight className="w-5 h-5 text-red-400 flex-shrink-0" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}

          {uncategorized.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-xl">📋</span>
                <h2 className="font-bold text-slate-800">Other Emergency SOPs</h2>
              </div>
              <div className="space-y-2">
                {uncategorized.map(sop => (
                  <Link key={sop.id} to={createPageUrl('SOPDetail') + `?id=${sop.id}`}>
                    <Card className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{sop.title}</p>
                          {sop.summary && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{sop.summary}</p>}
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}