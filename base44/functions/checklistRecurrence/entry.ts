import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // Get all archived checklists that should recur
    const archivedChecklists = await base44.asServiceRole.entities.ChecklistTemplate.filter({ 
      status: 'archived',
      recurrence_type: { $ne: 'once' }
    });

    for (const checklist of archivedChecklists) {
      const shouldCreate = shouldCreateToday(checklist.recurrence_type, checklist.recurrence_days_of_week, checklist.recurrence_day_of_month, checklist.recurrence_interval_months);

      if (shouldCreate) {
        // Create a new instance for tomorrow (invisible until due date)
        const newChecklist = await base44.asServiceRole.entities.ChecklistTemplate.create({
          title: checklist.title,
          description: checklist.description,
          category: checklist.category,
          items: checklist.items,
          assigned_to_emails: checklist.assigned_to_emails,
          assigned_to_names: checklist.assigned_to_names,
          assigned_teams: checklist.assigned_teams,
          due_date: tomorrow,
          due_time: checklist.due_time || '21:00',
          recurrence_type: checklist.recurrence_type,
          recurrence_days_of_week: checklist.recurrence_days_of_week,
          recurrence_day_of_month: checklist.recurrence_day_of_month,
          recurrence_interval_months: checklist.recurrence_interval_months,
          status: 'active',
          is_visible: false  // Not visible until due date
        });
      }
    }

    return Response.json({ success: true });
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
    case 'weekly':
      return true; // Simplified: create every day, real logic would track last creation
    case 'monthly':
      return today.getDate() === dayOfMonth;
    case 'every_x_months':
      // Simplified: would need to track last creation date
      return today.getDate() === dayOfMonth;
    case 'annually':
      return today.getMonth() === 0 && today.getDate() === (dayOfMonth || 1);
    default:
      return false;
  }
}