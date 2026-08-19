import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Deletes spawned checklist instances whose due_date is older than 6 months.
// Spawned instances get marked 'closed' (by checkChecklistTimeouts) or 'archived'
// (by checklistExpiry / finalizeChecklistAssignment) after their due time but are
// never deleted otherwise, so they accumulate forever and bloat the table.
//
// Safety:
//   - Only status 'closed' or 'archived' records are considered.
//   - A due_date is required — master templates (no due_date) are never deleted.
//   - Completion history is preserved in ChecklistCompletion records.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    const cutoffStr = cutoff.toISOString().split('T')[0]; // YYYY-MM-DD

    let deleted = 0;
    let scanned = 0;

    for (const status of ['closed', 'archived'] as const) {
      const stale = await base44.asServiceRole.entities.ChecklistTemplate.filter(
        { status },
        '-due_date',
        2000
      );
      scanned += stale.length;
      for (const t of stale) {
        if (t.due_date && t.due_date < cutoffStr) {
          await base44.asServiceRole.entities.ChecklistTemplate.delete(t.id);
          deleted++;
        }
      }
    }

    return Response.json({ success: true, deleted, scanned, cutoff: cutoffStr });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});