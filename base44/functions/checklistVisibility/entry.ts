import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Get all active checklists that are not yet visible
    const hiddenChecklists = await base44.asServiceRole.entities.ChecklistTemplate.filter({
      status: 'active',
      is_visible: false
    });

    let updated = 0;

    for (const checklist of hiddenChecklists) {
      // Recurring checklists with no due_date and no visible_time become visible immediately
      const isRecurring = checklist.recurrence_type && checklist.recurrence_type !== 'once';
      if (!checklist.due_date) {
        if (isRecurring && !checklist.visible_time) {
          await base44.asServiceRole.entities.ChecklistTemplate.update(checklist.id, { is_visible: true });
          updated++;
        }
        continue;
      }

      const isToday = checklist.due_date === today;
      const isPast = checklist.due_date < today;

      if (!isToday && !isPast) continue;

      // If there's a visible_time set, check if we've reached it yet (only matters for today)
      if (isToday && checklist.visible_time) {
        const [vh, vm] = checklist.visible_time.split(':').map(Number);
        const visibleMinutes = vh * 60 + (vm || 0);
        if (currentMinutes < visibleMinutes) continue; // Not yet time to show
      }

      await base44.asServiceRole.entities.ChecklistTemplate.update(checklist.id, { is_visible: true });
      updated++;
    }

    return Response.json({ success: true, updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});