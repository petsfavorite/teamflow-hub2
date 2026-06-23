import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    const tz = settings[0]?.global_timezone || 'America/New_York';
    const today = now.toLocaleDateString('en-CA', { timeZone: tz });
    const [tzH, tzM] = now.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).split(':').map(Number);
    const currentMinutes = tzH * 60 + tzM;

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

      // Calculate the visibility date by subtracting visible_day_offset from due_date
      const dayOffset = checklist.visible_day_offset || 0;
      const dueDateObj = new Date(checklist.due_date + 'T00:00:00');
      dueDateObj.setDate(dueDateObj.getDate() - dayOffset);
      const visibilityDate = dueDateObj.toISOString().split('T')[0];

      const isVisibilityDateToday = visibilityDate === today;
      const isVisibilityDatePast = visibilityDate < today;

      if (!isVisibilityDateToday && !isVisibilityDatePast) continue;

      // If there's a visible_time set, check if we've reached it yet (only matters for today)
      if (isVisibilityDateToday && checklist.visible_time) {
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