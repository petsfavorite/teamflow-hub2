import { base44 } from '@/api/base44Client';

// The whiteboard and monitor only ever show pets that are checked in, so ask the
// server for exactly those (up to 1000) instead of the latest N visits of any
// status. Checked-out history can no longer push a long-stay boarder off the list.
export const CHECKED_IN_VISITS_LIMIT = 1000;

export const fetchCheckedInVisits = () =>
    base44.entities.Visit.filter({ status: 'checked_in' }, '-check_in_time', CHECKED_IN_VISITS_LIMIT);
