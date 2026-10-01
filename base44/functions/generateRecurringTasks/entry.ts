import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { requireAdminOnly } from '../../shared/auth.ts';
import { localScheduleGate } from '../../shared/localSchedule.ts';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { error: authError } = await requireAdminOnly(base44);
        if (authError) return authError;
        const now = new Date();

        // Runs only at local midnight (see shared/localSchedule.ts)
        const { tz, skip } = await localScheduleGate(base44, req, 0);
        if (skip) return skip;
        const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz });
        const todayDow = new Date(todayStr + 'T12:00:00Z').getUTCDay(); // 0=Sun, 6=Sat
        const todayDom = parseInt(todayStr.split('-')[2]); // 1-31
        const todayMonth = parseInt(todayStr.split('-')[1]) - 1; // 0-indexed
        const todayYear = parseInt(todayStr.split('-')[0]);
        // A day-of-month of 29-31 falls on the last day of shorter months.
        const lastDomThisMonth = new Date(Date.UTC(todayYear, todayMonth + 1, 0)).getUTCDate();
        const isDueDom = (dom) => todayDom === Math.min(dom, lastDomThisMonth);

        // Templates are fetched by type so they can never fall off the end of a "newest N" list.
        // 'once' and 'manual' never generate; cancelled templates are stopped.
        const recurringTemplates = (await base44.asServiceRole.entities.Task.filter(
            { recurrence_type: { $in: ['daily', 'weekdays', 'specific_days', 'monthly', 'every_x_months', 'annually'] } },
            '-created_date',
            5000
        )).filter(t => t.status !== 'cancelled');

        // Recent tasks only: used to see what was already created today (dedup).
        const allTasks = await base44.asServiceRole.entities.Task.list('-created_date', 2000);

        // Build set of template IDs that already spawned an instance today (dedup by recurring_task_id)
        const spawnedToday = new Set(
            allTasks
                .filter(t => t.recurring_task_id && t.created_date && t.created_date.startsWith(todayStr))
                .map(t => t.recurring_task_id)
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
                shouldCreate = isDueDom(template.recurrence_day_of_month || 1);
            } else if (rt === 'every_x_months') {
                if (isDueDom(template.recurrence_day_of_month || 1) && template.due_date) {
                    const ref = new Date(template.due_date + 'T12:00:00Z');
                    const monthsDiff = (todayYear - ref.getUTCFullYear()) * 12 + (todayMonth - ref.getUTCMonth());
                    shouldCreate = monthsDiff % (template.recurrence_interval_months || 1) === 0;
                }
            } else if (rt === 'annually') {
                if (template.due_date) {
                    const ref = new Date(template.due_date + 'T12:00:00Z');
                    shouldCreate = todayMonth === ref.getUTCMonth() && isDueDom(ref.getUTCDate());
                }
            }

            if (!shouldCreate) continue;

            // Dedup by recurring_task_id (new) — falls back to title for legacy instances without the field
            if (spawnedToday.has(template.id)) continue;
            const legacyExists = allTasks.some(t =>
                t.title === template.title &&
                t.recurrence_type === 'once' &&
                !t.recurring_task_id &&
                t.created_date &&
                t.created_date.startsWith(todayStr)
            );
            if (legacyExists) continue;

            // Time to restart: any earlier copy still open was never finished. Archive it as not done
            // (it stayed active, and overdue, until now) so only the new occurrence is open.
            const staleCopies = await base44.asServiceRole.entities.Task.filter(
                { recurring_task_id: template.id, status: { $in: ['pending', 'in_progress'] } },
                '-created_date',
                200
            );
            for (const old of staleCopies) {
                await base44.asServiceRole.entities.TaskHistory.create({
                    task_id: old.id,
                    task_title: old.title,
                    task_description: old.description || null,
                    priority: old.priority || 'medium',
                    due_date: old.due_date,
                    assigned_to_emails: old.assigned_to_emails || [],
                    assigned_to_names: old.assigned_to_names || [],
                    assigned_teams: old.assigned_teams || [],
                    outcome: 'expired',
                    closed_by: 'system',
                    closed_by_name: 'Not completed (replaced by next occurrence)',
                    closed_at: new Date().toISOString(),
                    completion_notes: old.completion_notes || null,
                });
                await base44.asServiceRole.entities.Task.update(old.id, { status: 'cancelled' });
            }

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
                recurring_task_id: template.id,
            });
            created++;
        }

        return Response.json({ success: true, created, date: todayStr });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});