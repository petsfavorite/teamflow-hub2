import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Get all active visits (checked_in status)
        const visits = await base44.asServiceRole.entities.Visit.filter({
            status: 'checked_in'
        });

        // For each visit, remove all daily recurring tasks
        for (const visit of visits) {
            if (!visit.scheduled_tasks || visit.scheduled_tasks.length === 0) {
                continue;
            }

            // Filter out tasks with daily recurrence (recurrence_type: 'days')
            const updatedTasks = visit.scheduled_tasks.filter(task => task.recurrence_type !== 'days');

            // Update visit if tasks were removed
            if (updatedTasks.length !== visit.scheduled_tasks.length) {
                await base44.asServiceRole.entities.Visit.update(visit.id, {
                    scheduled_tasks: updatedTasks
                });
            }
        }

        return Response.json({ success: true, visitsUpdated: visits.length });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});