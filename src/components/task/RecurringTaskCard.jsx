import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Calendar, RefreshCw, Edit2 } from 'lucide-react';

const priorityColors = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
};

function recurrenceLabel(task) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  switch (task.recurrence_type) {
    case 'daily': return 'Repeats daily';
    case 'weekdays': return 'Repeats weekdays (Mon–Fri)';
    case 'specific_days': {
      const days = (task.recurrence_days_of_week || []).map(d => dayNames[d]).join(', ');
      return `Repeats on ${days || '—'}`;
    }
    case 'monthly': return `Repeats monthly on day ${task.recurrence_day_of_month || '—'}`;
    case 'every_x_months': return `Repeats every ${task.recurrence_interval_months || '?'} months`;
    case 'annually': return 'Repeats annually';
    case 'manual': return 'Manual recurrence';
    default: return task.recurrence_type;
  }
}

export default function RecurringTaskCard({ task, onEdit }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <RefreshCw className="w-4 h-4 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-slate-900">{task.title}</p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColors[task.priority]}`}>{task.priority}</span>
                <button
                  onClick={() => onEdit(task)}
                  className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
                  title="Edit task"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {task.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{task.description}</p>}
            <p className="text-xs font-medium text-violet-600 mt-1.5">{recurrenceLabel(task)}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
              {(task.assigned_to_names?.length > 0 || task.assigned_teams?.length > 0) && (
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {[...(task.assigned_to_names || []), ...(task.assigned_teams || [])].join(', ')}
                </span>
              )}
              {task.due_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Next due {task.due_date}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}