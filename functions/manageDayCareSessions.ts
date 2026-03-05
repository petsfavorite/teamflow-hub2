import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const now = new Date();
        const currentDate = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().split(' ')[0];

        // Get all visits with day camp enabled
        const visits = await base44.entities.Visit.filter({
            visit_type: 'boarding',
            play_camp_duration: 'full_day',
            status: 'checked_in'
        });

        for (const visit of visits) {
            // Remove unchecked sessions at 11:59 PM (23:59)
            if (currentTime >= '23:59') {
                const updatedSessions = (visit.play_sessions || []).filter(session => session.completed);
                if (updatedSessions.length !== (visit.play_sessions || []).length) {
                    await base44.entities.Visit.update(visit.id, {
                        play_sessions: updatedSessions
                    });
                }
            }

            // Add new sessions at 12:01 AM on weekdays (Mon-Fri)
            if (currentTime >= '00:01' && currentTime < '06:00') {
                const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
                const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

                if (isWeekday) {
                    const sessions = visit.play_sessions || [];
                    const maxSessionNumber = sessions.length > 0 
                        ? Math.max(...sessions.map(s => s.session_number)) 
                        : 0;

                    const newSessions = [
                        ...sessions,
                        { session_number: maxSessionNumber + 1, completed: false, completed_at: null },
                        { session_number: maxSessionNumber + 2, completed: false, completed_at: null },
                        { session_number: maxSessionNumber + 3, completed: false, completed_at: null },
                        { session_number: maxSessionNumber + 4, completed: false, completed_at: null }
                    ];

                    await base44.entities.Visit.update(visit.id, {
                        play_sessions: newSessions
                    });
                }
            }
        }

        return Response.json({ success: true, processedVisits: visits.length });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});