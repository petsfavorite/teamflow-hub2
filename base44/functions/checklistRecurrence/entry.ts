import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // Get all PUBLISHED recurring master templates (status: 'published', recurrence_type != 'once' and != 'manual')
    const masterTemplates = await base44.asServiceRole.entities.ChecklistTemplate.filter({
      status: 'published',
      recurrence_type: { $nin: ['once', 'manual', null] }
    });

    let created = 0;
    let skipped = 0;

    for (const template of masterTemplates) {
      const shouldCreate = shouldCreateToday(
        template.recurrence_type,
        template.recurrence_days_of_week,
        template.recurrence_day_of_month,
        template.recurrence_interval_months
      );

      if (!shouldCreate) {
        skipped++;
        continue;
      }

      // DEDUPLICATION: Check if an active instance for tomorrow already exists
      const existing = await base44.asServiceRole.entities.ChecklistTemplate.filter({
        title: template.title,
        due_date: tomorrow,
        status: 'active'
      });

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Create the daily instance for tomorrow
      await base44.asServiceRole.entities.ChecklistTemplate.create({
        title: template.title,
        description: template.description,
        category: template.category,
        items: template.items,
        assigned_to_emails: template.assigned_to_emails,
        assigned_to_names: template.assigned_to_names,
        assigned_teams: template.assigned_teams,
        due_date: tomorrow,
        due_time: template.due_time || '21:00',
        recurrence_type: template.recurrence_type,
        recurrence_days_of_week: template.recurrence_days_of_week,
        recurrence_day_of_month: template.recurrence_day_of_month,
        recurrence_interval_months: template.recurrence_interval_months,
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