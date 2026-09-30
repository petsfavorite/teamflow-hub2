import moment from 'moment-timezone';

// Every moment() call in the app uses this zone, so "today", "now" and all
// displayed times follow the signed-in user's timezone (Settings → Timezone).
export const DEFAULT_TIMEZONE = 'America/New_York';

let currentTimezone = DEFAULT_TIMEZONE;
moment.tz.setDefault(DEFAULT_TIMEZONE);

export function applyTimezone(tz) {
    const zone = tz && moment.tz.zone(tz) ? tz : DEFAULT_TIMEZONE;
    if (zone !== currentTimezone) {
        currentTimezone = zone;
        moment.tz.setDefault(zone);
    }
    return zone;
}

export const getAppTimezone = () => currentTimezone;

// Base44 timestamps can arrive without a "Z" (they are UTC). Without one the
// browser would read them as local time, so pin those to UTC first.
export const parseTs = (value) => parse(value);
const parse = (value) => {
    if (typeof value === 'string' && /T\d{2}:\d{2}/.test(value) && !/(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
        return moment.utc(value);
    }
    return moment(value);
};

/** Date in the app timezone, e.g. 9/30/2026 */
export const formatDate = (value, fmt = 'M/D/YYYY') => (value ? parse(value).tz(currentTimezone).format(fmt) : '');

/** Date + time in the app timezone, e.g. 9/30/2026, 1:17 PM */
export const formatDateTime = (value, fmt = 'M/D/YYYY, h:mm A') => (value ? parse(value).tz(currentTimezone).format(fmt) : '');

const DATE_FMT = 'YYYY-MM-DD';

/** Today's date (YYYY-MM-DD) in the app timezone. */
export const todayStr = () => moment().tz(currentTimezone).format(DATE_FMT);

/** A date (YYYY-MM-DD) n days from today in the app timezone. */
export const addDaysStr = (n) => moment().tz(currentTimezone).add(n, 'days').format(DATE_FMT);

/** Whole calendar days from today (app timezone) until a YYYY-MM-DD date; negative if past. */
export const daysFromToday = (dateStr) =>
    moment.tz(dateStr, DATE_FMT, currentTimezone).diff(moment().tz(currentTimezone).startOf('day'), 'days');
