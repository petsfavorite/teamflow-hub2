import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Calendar, RefreshCw, Edit2 } from 'lucide-react';

const priorityColors = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
};

function getNextDueDate(task) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (task.recurrence_type) {
    case 'daily': {
      // Next occurrence is today if not yet passed, else tomorrow
      return today;
    }
    case 'weekdays': {
      const d = new Date(today);
      // Move forward until we hit Mon–Fri
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      return d;
    }
    case 'specific_days': {
      const days = task.recurrence_days_of_week || [];
      if (!days.length) return null;
      const d = new Date(today);
      for (let i = 0; i <= 7; i++) {
        if (days.includes(d.getDay())) return d;
        d.setDate(d.getDate() + 1);
      }
      return null;
    }
    case 'monthly': {
      const dom = task.recurrence_day_of_month || 1;
      const d = new Date(today.getFullYear(), today.getMonth(), dom);
      if (d < today) d.setMonth(d.getMonth() + 1);
      return d;
    }
    case 'every_x_months': {
      const dom = task.recurrence_day_of_month || 1;
      const interval = task.recurrence_interval_months || 1;
      const d = new Date(today.getFullYear(), today.getMonth(), dom);
      while (d < today) d.setMonth(d.getMonth() + interval);
      return d;
    }
    case 'annually': {
      if (!task.due_date) return null;
      const orig = new Date(task.due_date + 'T00:00:00');
      const d = new Date(today.getFullYear(), orig.getMonth(), orig.getDate());
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      return d;
    }
    default:
      return task.due_date ? new Date(task.due_date + 'T00:00:00') : null;
  }
}

function formatDate(date) {
  if (!date) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

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
              {(() => {
                const next = getNextDueDate(task);
                return next ? (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Next due {formatDate(next)}
                  </span>
                ) : null;
              })()}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}