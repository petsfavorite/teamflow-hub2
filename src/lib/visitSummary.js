import moment from 'moment';
import { getCbdChews, chewValue } from '@/lib/cbdDosing';

// Head-line facts about a boarding stay: nights, CBD chews, probiotic doses, and a bath.
// Shared by the preliminary report and the checkout report so both read the same.

const isCbdTask = (t) => t.medication_name === 'CBD Chews' || t.type === 'CBD if needed for storms';
const isProbioticTask = (t) => (t.type || '').startsWith('Probiotic');

const round2 = (n) => Math.round(n * 100) / 100;
const display = (n) => (Number.isInteger(n) ? String(n) : String(round2(n)));

export function getStaySummary(pet, visit) {
    const done = (visit?.scheduled_tasks || []).filter((t) => t.completed);

    const start = moment(visit?.check_in_date || visit?.check_in_time);
    const end = moment(visit?.check_out_time || visit?.scheduled_checkout_date || new Date());
    const nights = Math.max(0, end.startOf('day').diff(start.startOf('day'), 'days'));

    const cbdDoses = done.filter(isCbdTask).length;
    const perDose = chewValue(getCbdChews(pet?.species, pet?.weight));
    const cbdChews = perDose ? round2(cbdDoses * perDose) : null;
    const probioticDoses = done.filter(isProbioticTask).length;
    const bathDone = done.some((t) => t.type === 'Schedule Bath');

    const rows = [{ label: 'Nights of Boarding', value: String(nights) }];
    if (cbdDoses > 0) {
        rows.push(
            cbdChews != null
                ? { label: 'CBD Chews Given', value: display(cbdChews) }
                : { label: 'CBD Doses Given', value: String(cbdDoses) }
        );
    }
    if (probioticDoses > 0) rows.push({ label: 'Probiotic Doses Given', value: String(probioticDoses) });
    if (bathDone) rows.push({ label: 'Bath', value: 'Done' });

    return { nights, rows };
}