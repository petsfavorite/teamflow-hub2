import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Get all checked-in visits
        const visits = await base44.asServiceRole.entities.Visit.filter({ status: 'checked_in' });
        
        if (!visits || visits.length === 0) {
            return Response.json({ message: 'No checked-in visits found' });
        }
        
        // Use America/New_York date — this function runs at 11:59 PM EST (04:59 UTC),
        // so UTC date is already the next day. We must delete tasks for the EST "today".
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        let updatedCount = 0;
        
        for (const visit of visits) {
            if (!visit.scheduled_tasks || visit.scheduled_tasks.length === 0) {
                continue;
            }
            
            // Find tasks due TODAY that are not completed.
            // Only target tasks with an explicit date (day-specific tasks).
            // Template tasks (is_template: true, no date) recur every day — never delete them.
            const undoneTasks = visit.scheduled_tasks.filter(task => {
                return task.date === today && !task.completed && !task.is_template;
            });
            
            if (undoneTasks.length === 0) {
                continue;
            }
            
            // Create activity log entries for each undone task
            const activityLog = visit.care_log || [];
            const timestamp = new Date().toISOString();
            
            undoneTasks.forEach(task => {
                activityLog.push({
                    time: timestamp,
                    activity: `Task: ${task.type}`,
                    notes: 'Not Done',
                    staff: 'System'
                });
            });
            
            // Remove only the day-specific undone tasks for today — leave template tasks untouched
            const updatedTasks = visit.scheduled_tasks.filter(task => {
                return !(task.date === today && !task.completed && !task.is_template);
            });
            
            // Remove uncompleted play sessions for today
            const updatedPlaySessions = (visit.play_sessions || []).filter(session => {
                return !(session.date === today && !session.completed);
            });
            
            // Update the visit
            await base44.asServiceRole.entities.Visit.update(visit.id, {
                scheduled_tasks: updatedTasks,
                play_sessions: updatedPlaySessions,
                care_log: activityLog
            });
            
            updatedCount++;
        }
        
        return Response.json({ 
            message: `Archived undone tasks for ${updatedCount} visits`,
            visitsProcessed: updatedCount
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});