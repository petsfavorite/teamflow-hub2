import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const visits = await base44.asServiceRole.entities.Visit.filter({ status: 'checked_in' });

        if (!visits || visits.length === 0) {
            return Response.json({ message: 'No checked-in visits found' });
        }

        const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
        const tz = settings[0]?.global_timezone || 'America/New_York';
        const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
        const nowTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
        let updatedCount = 0;

        for (const visit of visits) {
            if (!visit.scheduled_tasks || visit.scheduled_tasks.length === 0) {
                continue;
            }

            const undonePlaySessions = visit.scheduled_tasks.filter(task => {
                return task.type === 'Play Session' && task.date === today && !task.completed;
            });

            if (undonePlaySessions.length === 0) {
                continue;
            }

            const activityLog = visit.care_log || [];

            undonePlaySessions.forEach(task => {
                activityLog.push({
                    time: nowTime,
                    date: today,
                    activity: `Task: ${task.type}`,
                    notes: 'Not Done',
                    staff: 'System'
                });
            });

            const updatedTasks = visit.scheduled_tasks.filter(task => {
                return !(task.type === 'Play Session' && task.date === today && !task.completed);
            });

            await base44.asServiceRole.entities.Visit.update(visit.id, {
                scheduled_tasks: updatedTasks,
                care_log: activityLog
            });

            updatedCount++;
        }

        return Response.json({
            message: `Archived undone play sessions for ${updatedCount} visits`,
            visitsProcessed: updatedCount
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});