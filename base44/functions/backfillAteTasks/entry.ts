import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all currently checked-in boarding visits
    const visits = await base44.asServiceRole.entities.Visit.filter({
      status: 'checked_in',
      visit_type: 'boarding'
    });

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const results = [];

    for (const visit of visits) {
      const tasks = visit.scheduled_tasks || [];
      const checkoutDate = visit.scheduled_checkout_date;

      if (!checkoutDate) {
        results.push({ pet: visit.pet_name, skipped: true, reason: 'no checkout date' });
        continue;
      }

      // Collect all dates that already have an "Ate" task
      const datesWithAte = new Set(
        tasks.filter(t => t.type === 'Ate').map(t => t.date)
      );

      // Find all dates in the stay from today through checkout that are missing "Ate"
      const newAteTasks = [];
      let current = new Date(today + 'T00:00:00');
      const end = new Date(checkoutDate + 'T00:00:00');

      while (current <= end) {
        const dateStr = current.toISOString().slice(0, 10);
        if (!datesWithAte.has(dateStr)) {
          newAteTasks.push({
            type: 'Ate',
            time: '',
            date: dateStr,
            is_template: true,
            completed: false,
            completed_at: null,
            completed_by: null,
            completed_date: null,
            completed_iso: null,
            notes: null,
            medication_name: null,
            recurrence_type: 'none'
          });
        }
        current.setDate(current.getDate() + 1);
      }

      if (newAteTasks.length === 0) {
        results.push({ pet: visit.pet_name, added: 0, message: 'already has Ate for all days' });
        continue;
      }

      const updatedTasks = [...tasks, ...newAteTasks];
      await base44.asServiceRole.entities.Visit.update(visit.id, {
        scheduled_tasks: updatedTasks
      });

      results.push({ pet: visit.pet_name, added: newAteTasks.length, dates: newAteTasks.map(t => t.date) });
    }

    return Response.json({ success: true, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});