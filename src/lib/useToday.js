import { useState, useEffect } from 'react';
import moment from 'moment';

const FMT = 'YYYY-MM-DD';

/**
 * Today's date (YYYY-MM-DD, in the app timezone) that updates itself at midnight,
 * and when a sleeping laptop / backgrounded tablet wakes up after midnight.
 * Screens left on overnight (like the Monitor view) stay on the right day.
 */
export function useToday() {
    const [today, setToday] = useState(() => moment().format(FMT));

    useEffect(() => {
        let timer;
        const check = () => {
            const now = moment().format(FMT);
            setToday(prev => (prev === now ? prev : now));
        };
        const arm = () => {
            clearTimeout(timer);
            const msToMidnight = moment().add(1, 'day').startOf('day').diff(moment()) + 1000;
            timer = setTimeout(() => { check(); arm(); }, Math.min(msToMidnight, 2 ** 31 - 1));
        };
        const onVisible = () => {
            if (!document.hidden) { check(); arm(); }
        };
        arm();
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    return today;
}
