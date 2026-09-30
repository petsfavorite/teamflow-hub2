import moment from "moment";

// "Collect Feces" / "Collect Urine" are carried forward every day of the stay
// until a staff member marks them complete. One task is stored (dated with the
// day it was added); it shows on that day and every later day until completed.
export const COLLECT_TYPES = ['Collect Feces', 'Collect Urine'];

export const isCollectTask = (task) => COLLECT_TYPES.includes(task?.type);

const ymd = (d) => moment(d).format('YYYY-MM-DD');

/** Is this outstanding collection task due on `date` (YYYY-MM-DD)? */
export function collectTaskDueOn(task, visit, date) {
    if (!isCollectTask(task) || task.completed || task.cancelled) return false;
    const start = task.date || ymd(visit.check_in_date);
    if (date < start) return false;
    // Runs to the scheduled checkout day — and keeps going if the pet overstays.
    const today = ymd();
    return date <= today || !visit.scheduled_checkout_date || date <= ymd(visit.scheduled_checkout_date);
}

/**
 * Older visits stored one Collect task per day. Show just one outstanding task
 * per type (the earliest) so staff never see duplicates.
 */
export function isPrimaryCollectTask(visit, task) {
    const same = (visit.scheduled_tasks || []).filter(
        t => t.type === task.type && !t.completed && !t.cancelled
    );
    const first = same.reduce((a, b) => ((b.date || '') < (a.date || '') ? b : a), same[0]);
    return first === task;
}

/** Does the visit have an outstanding Collect `type` task due on `date`? */
export function hasCollectionDue(visit, type, date) {
    return (visit.scheduled_tasks || []).some(
        t => t.type === type && collectTaskDueOn(t, visit, date)
    );
}
