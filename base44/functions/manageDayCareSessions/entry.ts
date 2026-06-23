import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const now = new Date();
        const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
        const tz = settings[0]?.global_timezone || 'America/New_York';
        const today = now.toLocaleDateString('en-CA', { timeZone: tz });
        const dayOfWeek = new Date(today + 'T12:00:00Z').getDay();
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

        if (!isWeekday) {
            return Response.json({ success: true, message: 'Weekend - no sessions to generate' });
        }

        // Get all play camp visits (both visit types that have play camp)
        const boardingVisits = await base44.asServiceRole.entities.Visit.filter({
            status: 'checked_in',
            play_camp_duration: { $exists: true }
        });

        const playCampVisits = await base44.asServiceRole.entities.Visit.filter({
            status: 'checked_in',
            visit_type: 'play_camp'
        });

        const allVisits = [...boardingVisits, ...playCampVisits.filter(v => !boardingVisits.find(b => b.id === v.id))];

        for (const visit of allVisits) {
            const tasks = visit.scheduled_tasks || [];

            // Check if play sessions already exist for today
            const existingToday = tasks.filter(t => t.type === 'Play Session' && t.date === today);
            if (existingToday.length > 0) continue;

            const totalSessions = visit.play_camp_duration === 'half_day' ? 2 : 4;

            const newSessionTasks = Array.from({ length: totalSessions }, (_, i) => ({
                type: 'Play Session',
                time: '',
                date: today,
                is_template: false,
                completed: false,
                completed_at: null,
                completed_by: null,
                notes: `Session ${i + 1}`
            }));

            await base44.asServiceRole.entities.Visit.update(visit.id, {
                scheduled_tasks: [...tasks, ...newSessionTasks]
            });
        }

        return Response.json({ success: true, processedVisits: allVisits.length });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});