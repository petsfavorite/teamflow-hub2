import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();

    const recurringSchedules = await base44.asServiceRole.entities.RecurringChecklist.filter({
      is_active: true
    });

    let created = 0;
    let skipped = 0;

    for (const schedule of recurringSchedules) {
      const visibleDayOffset = schedule.visible_day_offset || 0;

      // The due date for the next instance
      const dueDate = getNextDueDate(schedule, now);
      if (!dueDate) { skipped++; continue; }

      // The date on which this instance should become visible (due_date minus offset days)
      const visibleDate = subtractDays(dueDate, visibleDayOffset);
      const todayStr = now.toISOString().split('T')[0];

      // Only create the instance when today IS the visibleDate (or we've passed it and it hasn't been created yet)
      if (visibleDate > todayStr) { skipped++; continue; }

      // DEDUPLICATION: skip if an active instance for this due_date already exists
      const existing = await base44.asServiceRole.entities.ChecklistTemplate.filter({
        title: schedule.template_title,
        due_date: dueDate,
        status: 'active'
      });

      if (existing.length > 0) { skipped++; continue; }

      // Determine whether to show immediately or hide until visible_time
      const isVisibleNow = shouldBeVisibleNow(schedule, now, visibleDate, todayStr);

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

// Returns YYYY-MM-DD string for the next due date of this schedule
function getNextDueDate(schedule, now) {
  const today = now.toISOString().split('T')[0];
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().split('T')[0];

  switch (schedule.recurrence_type) {
    case 'daily':
    case 'weekdays':
    case 'specific_days': {
      // Create instance for tomorrow (standard daily-style: created one day ahead)
      if (schedule.recurrence_type === 'weekdays') {
        const dow = new Date(tomorrow + 'T00:00:00').getDay();
        if (dow < 1 || dow > 5) return null;
      }
      if (schedule.recurrence_type === 'specific_days') {
        const dow = new Date(tomorrow + 'T00:00:00').getDay();
        if (!(schedule.recurrence_days_of_week || []).includes(dow)) return null;
      }
      return tomorrow;
    }
    case 'monthly': {
      // Next occurrence of recurrence_day_of_month
      const target = schedule.recurrence_day_of_month || 1;
      const d = new Date(now.getFullYear(), now.getMonth(), target);
      if (d.toISOString().split('T')[0] <= today) {
        d.setMonth(d.getMonth() + 1);
      }
      return d.toISOString().split('T')[0];
    }
    case 'every_x_months': {
      const target = schedule.recurrence_day_of_month || 1;
      const interval = schedule.recurrence_interval_months || 1;
      const d = new Date(now.getFullYear(), now.getMonth(), target);
      if (d.toISOString().split('T')[0] <= today) {
        d.setMonth(d.getMonth() + interval);
      }
      return d.toISOString().split('T')[0];
    }
    case 'annually': {
      const target = schedule.recurrence_day_of_month || 1;
      const d = new Date(now.getFullYear(), 0, target);
      if (d.toISOString().split('T')[0] <= today) {
        d.setFullYear(d.getFullYear() + 1);
      }
      return d.toISOString().split('T')[0];
    }
    default:
      return null;
  }
}

function subtractDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function shouldBeVisibleNow(schedule, now, visibleDate, todayStr) {
  if (visibleDate > todayStr) return false;
  if (visibleDate < todayStr) return true; // past visible date → show now
  // visibleDate === todayStr: check visible_time
  if (!schedule.visible_time) return true;
  const [vh, vm] = schedule.visible_time.split(':').map(Number);
  const visibleMinutes = vh * 60 + (vm || 0);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= visibleMinutes;
}