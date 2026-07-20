import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
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

      // DEDUPLICATION: skip if an active instance for this due_date already exists
      const existing = await base44.asServiceRole.entities.ChecklistTemplate.filter({
        title: schedule.template_title,
        due_date: dueDate,
        status: 'active'
      });

      if (existing.length > 0) { skipped++; continue; }

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

function getNextDueDate(schedule, now, tz) {
  const today = now.toLocaleDateString('en-CA', { timeZone: tz });

  switch (schedule.recurrence_type) {
    case 'daily':
      return today;
    case 'weekdays': {
      const dow = new Date(today + 'T12:00:00Z').getDay();
      if (dow < 1 || dow > 5) return null;
      return today;
    }
    case 'specific_days': {
      const dow = new Date(today + 'T12:00:00Z').getDay();
      if (!(schedule.recurrence_days_of_week || []).includes(dow)) return null;
      return today;
    }
    case 'monthly': {
      const target = schedule.recurrence_day_of_month || 1;
      const [ty, tm] = today.split('-').map(Number);
      const d = new Date(Date.UTC(ty, tm - 1, target));
      if (d.toISOString().split('T')[0] <= today) {
        d.setUTCMonth(d.getUTCMonth() + 1);
      }
      return d.toISOString().split('T')[0];
    }
    case 'every_x_months': {
      const target = schedule.recurrence_day_of_month || 1;
      const interval = schedule.recurrence_interval_months || 1;
      const [ty, tm] = today.split('-').map(Number);
      const d = new Date(Date.UTC(ty, tm - 1, target));
      if (d.toISOString().split('T')[0] <= today) {
        d.setUTCMonth(d.getUTCMonth() + interval);
      }
      return d.toISOString().split('T')[0];
    }
    case 'annually': {
      const target = schedule.recurrence_day_of_month || 1;
      const [ty] = today.split('-').map(Number);
      const d = new Date(Date.UTC(ty, 0, target));
      if (d.toISOString().split('T')[0] <= today) {
        d.setUTCFullYear(d.getUTCFullYear() + 1);
      }
      return d.toISOString().split('T')[0];
    }
    default:
      return null;
  }
}

function subtractDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split('T')[0];
}

function shouldBeVisibleNow(schedule, now, visibleDate, todayStr, tz) {
  if (visibleDate > todayStr) return false;
  if (visibleDate < todayStr) return true;
  if (!schedule.visible_time) return true;
  const [vh, vm] = schedule.visible_time.split(':').map(Number);
  const visibleMinutes = vh * 60 + (vm || 0);
  const [tzH, tzM] = now.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).split(':').map(Number);
  return (tzH * 60 + tzM) >= visibleMinutes;
}