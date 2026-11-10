import moment from 'moment';
import { getUserDisplayName } from '@/lib/utils';

// Builds a care_log entry that records a location change. Because it lives in
// the visit's care_log, it shows up in the pet's in-app Activity Log, the
// preliminary report, and the discharge (checkout) report.
export function buildLocationChangeEntry(oldLocation, newLocation, currentUser) {
    const name = getUserDisplayName(currentUser);
    const initials = currentUser?.initials
        || name.split(' ').filter(Boolean).map((n) => n[0]).join('').toUpperCase()
        || '?';
    const from = (oldLocation || '').trim() || '—';
    const to = (newLocation || '').trim() || '—';
    return {
        time: moment().format('h:mm A'),
        date: moment().format('YYYY-MM-DD'),
        activity: 'Location Change',
        notes: `${from} → ${to}`,
        staff: initials,
    };
}