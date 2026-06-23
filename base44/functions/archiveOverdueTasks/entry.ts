import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    const tz = settings[0]?.global_timezone || 'America/New_York';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });

    // Find all pending/in_progress one-time tasks that are past their due date
    const allTasks = await base44.asServiceRole.entities.Task.list('-due_date', 500);
    const overdue = allTasks.filter(t =>
      t.due_date &&
      t.due_date < today &&
      (t.status === 'pending' || t.status === 'in_progress') &&
      (t.recurrence_type === 'once' || !t.recurrence_type)
    );

    if (overdue.length === 0) return Response.json({ archived: 0 });

    let archived = 0;
    for (const task of overdue) {
      // Write to history
      await base44.asServiceRole.entities.TaskHistory.create({
        task_id: task.id,
        task_title: task.title,
        task_description: task.description || null,
        priority: task.priority || 'medium',
        due_date: task.due_date,
        assigned_to_emails: task.assigned_to_emails || [],
        assigned_to_names: task.assigned_to_names || [],
        assigned_teams: task.assigned_teams || [],
        outcome: 'expired',
        closed_by: 'system',
        closed_by_name: 'Auto-expired (past due date)',
        closed_at: new Date().toISOString(),
        completion_notes: task.completion_notes || null,
      });

      // Mark the task as cancelled so it disappears from active views
      await base44.asServiceRole.entities.Task.update(task.id, { status: 'cancelled' });
      archived++;
    }

    return Response.json({ archived });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});