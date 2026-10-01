import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Deletes one-off Task records that were completed or cancelled more than 60 days ago.
// Spawned daily copies of recurring tasks are never deleted otherwise, so they pile up and
// bloat the table. The record of what happened lives in TaskHistory (kept 60 days).
//
// Safety: recurring task definitions (recurrence_type other than 'once') are never touched,
// even if cancelled, so a stopped recurring task stays visible on the Recurring tab.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    const cutoffIso = cutoff.toISOString();

    let deleted = 0;
    for (const status of ['completed', 'cancelled'] as const) {
      const closed = await base44.asServiceRole.entities.Task.filter({ status }, 'updated_date', 5000);
      for (const t of closed) {
        const isOneOff = !t.recurrence_type || t.recurrence_type === 'once';
        const closedAt = t.updated_date || t.created_date;
        if (isOneOff && closedAt && closedAt < cutoffIso) {
          await base44.asServiceRole.entities.Task.delete(t.id);
          deleted++;
        }
      }
    }

    return Response.json({ success: true, deleted });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});