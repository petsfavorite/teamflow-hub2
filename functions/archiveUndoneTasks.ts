import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Get all checked-in visits
        const visits = await base44.asServiceRole.entities.Visit.filter({ status: 'checked_in' });
        
        if (!visits || visits.length === 0) {
            return Response.json({ message: 'No checked-in visits found' });
        }
        
        const today = new Date().toISOString().split('T')[0];
        let updatedCount = 0;
        
        for (const visit of visits) {
            if (!visit.scheduled_tasks || visit.scheduled_tasks.length === 0) {
                continue;
            }
            
            // Find tasks due today that are not completed
            const undoneTasks = visit.scheduled_tasks.filter(task => {
                const taskDate = task.date || today;
                return taskDate === today && !task.completed;
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
            
            // Remove undone tasks from scheduled_tasks
            const updatedTasks = visit.scheduled_tasks.filter(task => {
                const taskDate = task.date || today;
                return !(taskDate === today && !task.completed);
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