import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { requireAdminOnly } from '../../shared/auth.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { error: authError } = await requireAdminOnly(base44);
    if (authError) return authError;
    const now = new Date();

    const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    const tz = settings[0]?.global_timezone || 'America/New_York';
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz });

    const recurringSchedules = await base44.asServiceRole.entities.RecurringChecklist.filter({
      is_active: true
    });

    let created = 0;
    let skipped = 0;

    for (const schedule of recurringSchedules) {
      const visibleDayOffset = schedule.visible_day_offset || 0;

      const dueDate = getNextDueDate(schedule, now, tz);
      if (!dueDate) { skipped++; continue; }

      const visibleDate = subtractDays(dueDate, visibleDayOffset);

      // DEDUPLICATION: skip if an instance for this schedule + due_date already exists in ANY
      // status. Completed/stopped instances are archived or closed, and must not be respawned.
      const existing = await base44.asServiceRole.entities.ChecklistTemplate.filter({
        recurring_checklist_id: schedule.id,
        due_date: dueDate
      });

      if (existing.length > 0) { skipped++; continue; }

      // PAST-DUE GUARD: if the due date is today and the due time has already passed,
      // skip creating the instance — it would be immediately auto-closed as "missed".
      if (dueDate === todayStr) {
        const dueTime = schedule.due_time || '21:00';
        const [dh, dm] = dueTime.split(':').map(Number);
        const dueMinutes = dh * 60 + (dm || 0);
        const [tzH, tzM] = now.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).split(':').map(Number);
        const nowMinutes = tzH * 60 + tzM;
        if (nowMinutes > dueMinutes) { skipped++; continue; }
      }

      const isVisibleNow = shouldBeVisibleNow(schedule, now, visibleDate, todayStr, tz);

      await base44.asServiceRole.entities.ChecklistTemplate.create({
        title: schedule.template_title,
        description: schedule.template_description,
        category: schedule.template_category,
        items: schedule.template_items,
        assigned_to_emails: schedule.assigned_to_emails,
        assigned_to_names: schedule.assigned_to_names,
        assigned_teams: schedule.assigned_teams,
        due_date: dueDate,
        due_time: schedule.due_time || '21:00',
        visible_time: schedule.visible_time || null,
        visible_day_offset: schedule.visible_day_offset || 0,
        recurring_checklist_id: schedule.id,
        recurrence_type: schedule.recurrence_type,
        recurrence_days_of_week: schedule.recurrence_days_of_week,
        recurrence_day_of_month: schedule.recurrence_day_of_month,
        recurrence_interval_months: schedule.recurrence_interval_months,
        status: 'active',
        is_visible: isVisibleNow
      });

      created++;
    }

    return Response.json({ success: true, created, skipped });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Clamp a day-of-month to the last valid day of the target month (e.g. 31 → 28 for February).
// monthIdx may be out of range (e.g. 12 = January of next year); Date.UTC rolls it over.
function getClampedDate(year: number, monthIdx: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIdx, Math.min(day, lastDay))).toISOString().split('T')[0];
}

// The next date (today or later, and never before the schedule's start_date) that this
// schedule is due, or null if it is not due today / has not started yet.
// Dates are YYYY-MM-DD in the app timezone.
function getNextDueDate(schedule, now: Date, tz: string): string | null {
  const today = now.toLocaleDateString('en-CA', { timeZone: tz });
  const start: string | null = schedule.start_date || null;
  const floor = start && start > today ? start : today; // earliest date we may return
  const [fy, fm] = floor.split('-').map(Number);
  const startDay = start ? Number(start.split('-')[2]) : null;

  switch (schedule.recurrence_type) {
    case 'daily':
      return today >= (start || today) ? today : null;
    case 'weekdays': {
      if (start && today < start) return null;
      const dow = new Date(today + 'T12:00:00Z').getUTCDay();
      return dow >= 1 && dow <= 5 ? today : null;
    }
    case 'specific_days': {
      if (start && today < start) return null;
      const dow = new Date(today + 'T12:00:00Z').getUTCDay();
      return (schedule.recurrence_days_of_week || []).includes(dow) ? today : null;
    }
    case 'monthly': {
      const target = schedule.recurrence_day_of_month || startDay || 1;
      for (let k = 0; k < 24; k++) {
        const d = getClampedDate(fy, fm - 1 + k, target);
        if (d >= floor) return d;
      }
      return null;
    }
    case 'every_x_months': {
      const target = schedule.recurrence_day_of_month || startDay || 1;
      const interval = Math.max(1, schedule.recurrence_interval_months || 1);
      // Months that occur are the anchor month plus multiples of the interval.
      const anchorStr = start || (schedule.created_date ? String(schedule.created_date).slice(0, 10) : today);
      const [ay, am] = anchorStr.split('-').map(Number);
      for (let k = 0; k < 400; k++) {
        const d = getClampedDate(ay, am - 1 + k * interval, target);
        if (d >= floor) return d;
      }
      return null;
    }
    case 'annually': {
      // The start date's month/day is the yearly due date (legacy schedules without one: January).
      const month = start ? Number(start.split('-')[1]) - 1 : 0;
      const day = start ? startDay! : (schedule.recurrence_day_of_month || 1);
      for (let k = 0; k < 3; k++) {
        const d = getClampedDate(fy + k, month, day);
        if (d >= floor) return d;
      }
      return null;
    }
    default:
      return null;
  }
}

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split('T')[0];
}

function shouldBeVisibleNow(schedule, now: Date, visibleDate: string, todayStr: string, tz: string): boolean {
  if (visibleDate > todayStr) return false;
  if (visibleDate < todayStr) return true;
  if (!schedule.visible_time) return true;
  const [vh, vm] = schedule.visible_time.split(':').map(Number);
  const visibleMinutes = vh * 60 + (vm || 0);
  const [tzH, tzM] = now.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).split(':').map(Number);
  return (tzH * 60 + tzM) >= visibleMinutes;
}