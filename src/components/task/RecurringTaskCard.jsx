import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Users, Calendar, RefreshCw, Edit2, Package } from 'lucide-react';
import moment from 'moment-timezone';
import { todayStr, formatDate } from '@/lib/timezone';

const priorityColors = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
};

const FMT = 'YYYY-MM-DD';

// Day-of-month clamped to the month's last day (31 -> 28/29/30 in shorter months).
function clampedDate(year, monthOffset, dom) {
  const first = moment.utc([year, 0, 1]).add(monthOffset, 'months');
  return first.clone().date(Math.min(dom, first.daysInMonth())).format(FMT);
}

// Mirrors generateRecurringTasks: which date this task will next be created for (app timezone).
function getNextDueDate(task) {
  const today = todayStr();
  const t = moment.utc(today, FMT);
  const anchor = task.due_date ? moment.utc(task.due_date, FMT) : null;

  switch (task.recurrence_type) {
    case 'daily':
      return today;
    case 'weekdays': {
      const d = t.clone();
      while (d.day() === 0 || d.day() === 6) d.add(1, 'day');
      return d.format(FMT);
    }
    case 'specific_days': {
      const days = task.recurrence_days_of_week || [];
      if (!days.length) return null;
      const d = t.clone();
      for (let i = 0; i <= 7; i++) {
        if (days.includes(d.day())) return d.format(FMT);
        d.add(1, 'day');
      }
      return null;
    }
    case 'monthly': {
      const dom = task.recurrence_day_of_month || 1;
      for (let k = 0; k < 13; k++) {
        const d = clampedDate(t.year(), t.month() + k, dom);
        if (d >= today) return d;
      }
      return null;
    }
    case 'every_x_months': {
      if (!anchor) return null;
      const dom = task.recurrence_day_of_month || 1;
      const interval = Math.max(1, task.recurrence_interval_months || 1);
      for (let k = 0; k < 400; k++) {
        const d = clampedDate(anchor.year(), anchor.month() + k * interval, dom);
        if (d >= today) return d;
      }
      return null;
    }
    case 'annually': {
      if (!anchor) return null;
      for (let k = 0; k < 3; k++) {
        const d = clampedDate(t.year() + k, anchor.month(), anchor.date());
        if (d >= today) return d;
      }
      return null;
    }
    default:
      return task.due_date || null;
  }
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
    case 'every_x_months': return `Repeats every ${task.recurrence_interval_months || '?'} months${task.due_date ? `, starting ${formatDate(task.due_date)}` : ''}`;
    case 'annually': return task.due_date ? `Repeats annually on ${formatDate(task.due_date, 'MMM D')}` : 'Repeats annually';
    case 'manual': return 'Manual recurrence';
    default: return task.recurrence_type;
  }
}

export default function RecurringTaskCard({ task, onEdit, assetName = null }) {
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
                    Next due {formatDate(next, 'MMM D, YYYY')}
                  </span>
                ) : null;
              })()}
              {assetName && (
                <span className="flex items-center gap-1 text-amber-600">
                  <Package className="w-3 h-3" />
                  {assetName}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}