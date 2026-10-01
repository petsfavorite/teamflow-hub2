import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { requireAdminOnly } from '../../shared/auth.ts';
import { localScheduleGate } from '../../shared/localSchedule.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { error: authError } = await requireAdminOnly(base44);
    if (authError) return authError;
    // Runs only at local midnight (see shared/localSchedule.ts)
    const { tz, skip } = await localScheduleGate(base44, req, 0);
    if (skip) return skip;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });

    // Fetch pending and in_progress tasks separately to avoid missing any due to list limits
    const [pending, inProgress] = await Promise.all([
      base44.asServiceRole.entities.Task.filter({ status: 'pending' }, '-due_date', 5000),
      base44.asServiceRole.entities.Task.filter({ status: 'in_progress' }, '-due_date', 5000),
    ]);

    const overdue = [...pending, ...inProgress].filter(t =>
      t.due_date &&
      t.due_date < today &&
      (t.recurrence_type === 'once' || !t.recurrence_type) &&
      // Copies spawned by a recurring task stay open (and overdue) until the next occurrence is
      // due; generateRecurringTasks archives them as not done at that moment.
      !t.recurring_task_id
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
        closed_by_name: 'Not completed (auto-closed at midnight)',
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