import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const now = new Date();

        const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
        const tz = settings[0]?.global_timezone || 'America/New_York';

        const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz });
        const todayDow = new Date(todayStr + 'T12:00:00Z').getDay(); // 0=Sun, 6=Sat
        const todayDom = parseInt(todayStr.split('-')[2]); // 1-31
        const todayMonth = parseInt(todayStr.split('-')[1]) - 1; // 0-indexed
        const todayYear = parseInt(todayStr.split('-')[0]);

        // Get all recurring template tasks (not once, not manual, not cancelled)
        const allTasks = await base44.asServiceRole.entities.Task.list('-created_date', 500);
        const recurringTemplates = allTasks.filter(t =>
            t.recurrence_type &&
            t.recurrence_type !== 'once' &&
            t.recurrence_type !== 'manual' &&
            t.status !== 'cancelled'
        );

        let created = 0;

        for (const template of recurringTemplates) {
            let shouldCreate = false;
            const rt = template.recurrence_type;

            if (rt === 'daily') {
                shouldCreate = true;
            } else if (rt === 'weekdays') {
                shouldCreate = todayDow >= 1 && todayDow <= 5;
            } else if (rt === 'specific_days') {
                shouldCreate = (template.recurrence_days_of_week || []).includes(todayDow);
            } else if (rt === 'monthly') {
                shouldCreate = todayDom === (template.recurrence_day_of_month || 1);
            } else if (rt === 'every_x_months') {
                if (todayDom === (template.recurrence_day_of_month || 1) && template.due_date) {
                    const ref = new Date(template.due_date + 'T12:00:00Z');
                    const monthsDiff = (todayYear - ref.getUTCFullYear()) * 12 + (todayMonth - ref.getUTCMonth());
                    shouldCreate = monthsDiff % (template.recurrence_interval_months || 1) === 0;
                }
            } else if (rt === 'annually') {
                if (template.due_date) {
                    const ref = new Date(template.due_date + 'T12:00:00Z');
                    shouldCreate = todayMonth === ref.getUTCMonth() && todayDom === ref.getUTCDate();
                }
            }

            if (!shouldCreate) continue;

            // Check if an instance was already created today for this template
            const alreadyExists = allTasks.some(t =>
                t.title === template.title &&
                t.recurrence_type === 'once' &&
                t.created_date &&
                t.created_date.startsWith(todayStr)
            );

            if (alreadyExists) continue;

            await base44.asServiceRole.entities.Task.create({
                title: template.title,
                description: template.description,
                assigned_to_emails: template.assigned_to_emails || [],
                assigned_to_names: template.assigned_to_names || [],
                assigned_teams: template.assigned_teams || [],
                priority: template.priority || 'medium',
                due_date: todayStr,
                recurrence_type: 'once',
                status: 'pending',
                created_by_name: 'Auto-generated',
                sop_id: template.sop_id,
                asset_id: template.asset_id,
            });
            created++;
        }

        return Response.json({ success: true, created, date: todayStr });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});