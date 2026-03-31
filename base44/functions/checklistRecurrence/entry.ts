import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // Get all active recurring checklist schedules
    const recurringSchedules = await base44.asServiceRole.entities.RecurringChecklist.filter({
      is_active: true
    });

    let created = 0;
    let skipped = 0;

    for (const schedule of recurringSchedules) {
      const shouldCreate = shouldCreateToday(
        schedule.recurrence_type,
        schedule.recurrence_days_of_week,
        schedule.recurrence_day_of_month,
        schedule.recurrence_interval_months
      );

      if (!shouldCreate) {
        skipped++;
        continue;
      }

      // DEDUPLICATION: Check if an active instance for tomorrow already exists with this title
      const existing = await base44.asServiceRole.entities.ChecklistTemplate.filter({
        title: schedule.template_title,
        due_date: tomorrow,
        status: 'active'
      });

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Create the daily instance as an active ChecklistTemplate record (appears in "My Checklists")
      await base44.asServiceRole.entities.ChecklistTemplate.create({
        title: schedule.template_title,
        description: schedule.template_description,
        category: schedule.template_category,
        items: schedule.template_items,
        assigned_to_emails: schedule.assigned_to_emails,
        assigned_to_names: schedule.assigned_to_names,
        assigned_teams: schedule.assigned_teams,
        due_date: tomorrow,
        due_time: schedule.due_time || '21:00',
        recurrence_type: schedule.recurrence_type,
        recurrence_days_of_week: schedule.recurrence_days_of_week,
        recurrence_day_of_month: schedule.recurrence_day_of_month,
        recurrence_interval_months: schedule.recurrence_interval_months,
        status: 'active',
        is_visible: false
      });

      created++;
    }

    return Response.json({ success: true, created, skipped });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function shouldCreateToday(recurrenceType, daysOfWeek, dayOfMonth, intervalMonths) {
  const today = new Date();
  const dayOfWeek = today.getDay();

  switch (recurrenceType) {
    case 'daily':
      return true;
    case 'weekdays':
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    case 'specific_days':
      return daysOfWeek?.includes(dayOfWeek);
    case 'monthly':
      return today.getDate() === dayOfMonth;
    case 'every_x_months':
      return today.getDate() === dayOfMonth;
    case 'annually':
      return today.getMonth() === 0 && today.getDate() === (dayOfMonth || 1);
    default:
      return false;
  }
}