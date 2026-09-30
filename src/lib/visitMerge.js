// Fields the server owns; never sent back in an update.
const SYSTEM_FIELDS = ['id', 'created_date', 'updated_date', 'created_by', 'created_by_id', 'is_sample'];

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Tasks have no id, so identify them by what makes them "the same task".
const taskIdentity = (t) =>
    [t?.type, t?.date || '', t?.time || '', t?.medication_name || '', t?.is_template ? 1 : 0].join('|');

// Multiset difference: entries of `a` that are not in `b` (compared by full content).
function minus(a, b) {
    const pool = [...b];
    return a.filter(item => {
        const i = pool.findIndex(p => same(p, item));
        if (i === -1) return true;
        pool.splice(i, 1);
        return false;
    });
}

function mergeLog(serverLog, baseLog, nextLog) {
    const added = minus(nextLog, baseLog);
    const removed = minus(baseLog, nextLog);
    const result = [...serverLog];
    removed.forEach(r => {
        const i = result.findIndex(x => same(x, r));
        if (i !== -1) result.splice(i, 1);
    });
    return [...result, ...added];
}

function mergeTasks(serverTasks, baseTasks, nextTasks) {
    const added = minus(nextTasks, baseTasks);
    const removed = minus(baseTasks, nextTasks);
    const result = [...serverTasks];

    const locate = (task) => {
        const exact = result.findIndex(x => same(x, task));
        return exact !== -1 ? exact : result.findIndex(x => taskIdentity(x) === taskIdentity(task));
    };

    const unpaired = [...removed];
    added.forEach(a => {
        // An edited task shows up as "old version removed + new version added".
        // Replace in place so another user's edit to a *different* task is kept.
        const pi = unpaired.findIndex(r => taskIdentity(r) === taskIdentity(a));
        if (pi !== -1) {
            const [old] = unpaired.splice(pi, 1);
            const at = locate(old);
            if (at !== -1) { result[at] = a; return; }
        }
        result.push(a);
    });
    unpaired.forEach(r => {
        const at = locate(r);
        if (at !== -1) result.splice(at, 1);
    });
    return result;
}

/**
 * Build the smallest update that applies the user's edit (base -> next) on top
 * of the latest server copy, so concurrent edits by other staff are not lost.
 * Returns null when there is nothing to save.
 * If `base` is missing, `next` is treated as an already-partial patch.
 */
export function buildVisitPatch(base, next, server) {
    const patch = {};
    Object.keys(next).forEach(key => {
        if (SYSTEM_FIELDS.includes(key)) return;
        if (base && same(next[key], base[key])) return; // user didn't touch this field
        if (base && server && key === 'care_log') {
            patch[key] = mergeLog(server.care_log || [], base.care_log || [], next.care_log || []);
        } else if (base && server && key === 'scheduled_tasks') {
            patch[key] = mergeTasks(server.scheduled_tasks || [], base.scheduled_tasks || [], next.scheduled_tasks || []);
        } else {
            patch[key] = next[key];
        }
    });
    return Object.keys(patch).length ? patch : null;
}
