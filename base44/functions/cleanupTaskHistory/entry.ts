import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Deletes TaskHistory records older than 60 days. Run on a daily schedule.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const cutoff = sixtyDaysAgo.toISOString(); // ISO timestamp for closed_at comparison

    const allHistory = await base44.asServiceRole.entities.TaskHistory.list('closed_at', 2000);
    let deleted = 0;

    for (const record of allHistory) {
      const closedAt = record.closed_at || record.created_date;
      if (closedAt && closedAt < cutoff) {
        await base44.asServiceRole.entities.TaskHistory.delete(record.id);
        deleted++;
      }
    }

    return Response.json({ success: true, deleted });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});