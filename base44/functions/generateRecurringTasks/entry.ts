import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const todayDow = now.getDay(); // 0=Sun, 6=Sat
        const todayDom = now.getDate(); // 1-31

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
            // Check if today matches the recurrence schedule
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
                // Check if today is the right day of month
                if (todayDom === (template.recurrence_day_of_month || 1) && template.due_date) {
                    const ref = new Date(template.due_date);
                    const monthsDiff = (now.getFullYear() - ref.getFullYear()) * 12 + (now.getMonth() - ref.getMonth());
                    shouldCreate = monthsDiff % (template.recurrence_interval_months || 1) === 0;
                }
            } else if (rt === 'annually') {
                if (template.due_date) {
                    const ref = new Date(template.due_date);
                    shouldCreate = now.getMonth() === ref.getMonth() && todayDom === ref.getDate();
                }
            }

            if (!shouldCreate) continue;

            // Check if an instance was already created today for this template (same title + recurrence_type=once)
            const alreadyExists = allTasks.some(t =>
                t.title === template.title &&
                t.recurrence_type === 'once' &&
                t.created_date &&
                t.created_date.startsWith(todayStr)
            );

            if (alreadyExists) continue;

            // Create a new task instance for today
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