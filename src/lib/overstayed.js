import moment from "moment";

/**
 * A boarding pet is "overstayed" when they are still checked in
 * past their scheduled departure day (scheduled_checkout_date < dateStr).
 */
export function isOverstayed(visit, dateStr) {
    if (!visit || visit.visit_type !== 'boarding') return false;
    if (visit.status !== 'checked_in') return false;
    if (!visit.scheduled_checkout_date) return false;
    return moment(dateStr).isAfter(moment(visit.scheduled_checkout_date).format('YYYY-MM-DD'), 'day');
}

/**
 * Copy the most recent day's daily template tasks to the target date,
 * resetting completion state. Returns a new scheduled_tasks array, or
 * null if no new tasks were needed (already populated or no source tasks).
 */
export function populateTasksForDate(scheduledTasks, targetDate) {
    const tasks = scheduledTasks || [];

    // Already has daily template tasks for this date? Nothing to do.
    const hasTasksForDate = tasks.some(
        t => t.date === targetDate && t.is_template && t.type !== 'Schedule Bath'
    );
    if (hasTasksForDate) return null;

    // Find daily template tasks (excluding persistent "Schedule Bath" which shows every day already)
    const dailyTemplateTasks = tasks.filter(
        t => t.is_template && t.type !== 'Schedule Bath' && t.date
    );
    if (dailyTemplateTasks.length === 0) return null;

    // Use the most recent day as the source
    const dates = [...new Set(dailyTemplateTasks.map(t => t.date))].sort();
    const latestDate = dates[dates.length - 1];
    const sourceTasks = dailyTemplateTasks.filter(t => t.date === latestDate);

    const newTasks = sourceTasks.map(t => ({
        ...t,
        date: targetDate,
        completed: false,
        completed_at: null,
        completed_by: null,
        completed_date: null,
        completed_iso: null,
        notes: t.notes || ''
    }));

    return [...tasks, ...newTasks];
}