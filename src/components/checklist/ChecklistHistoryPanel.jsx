import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckSquare, Clock, User, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function ChecklistHistoryPanel({ checklist, onClose }) {
  const title = checklist?.title || checklist?.template_title;

  // Match by title, not template id: recurring checklists spawn a new
  // ChecklistTemplate instance each day (different ids), so filtering by
  // checklist_template_id only ever returns the current day's completion.
  // All instances share the same checklist_title, so this surfaces the full history.
  const { data: completions = [], isLoading } = useQuery({
    queryKey: ['checklist-history-panel', title],
    queryFn: () => base44.entities.ChecklistCompletion.filter(
      { checklist_title: title },
      '-updated_date',
      100
    ),
    enabled: !!title,
  });

  return (
    <Dialog open={!!checklist} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-indigo-600" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : completions.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">No completions recorded yet.</div>
        ) : (
          <div className="space-y-3">
            {completions.map(c => {
              const total = c.completed_items?.length || 0;
              const checked = c.completed_items?.filter(i => i.checked).length || 0;
              const allDone = checked === total && total > 0;

              return (
                <div key={c.id} className="border border-slate-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      {allDone
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        : <XCircle className="w-4 h-4 text-amber-500" />
                      }
                      <span className={`font-medium ${allDone ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {checked}/{total} items
                      </span>
                      <span className="text-xs text-slate-400 capitalize">· {c.status}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock className="w-3 h-3" />
                      {c.completion_date}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <User className="w-3 h-3" />
                    {c.completed_by_name || c.completed_by || 'Unknown'}
                  </div>

                  {c.completed_items && c.completed_items.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {c.completed_items.map((item, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className={`mt-0.5 w-3 h-3 rounded-sm border flex-shrink-0 flex items-center justify-center ${item.checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'}`}>
                            {item.checked && '✓'}
                          </span>
                          <div>
                            <span className={item.checked ? 'text-slate-700' : 'text-slate-400 line-through'}>{item.label}</span>
                            {item.notes && <p className="text-slate-400 italic mt-0.5">{item.notes}</p>}
                            {item.checked_by_name && (
                              <p className="text-slate-400">by {item.checked_by_name}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}