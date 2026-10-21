// CBD chew dosing.
// Dogs: number of chews per dose is based on the pet's weight.
// Cats: always 1/2 chew per dose.
export const CAT_CBD_CHEWS = '1/2';

export const CBD_CHEW_RANGES = [
    { maxWeight: 11, chews: '1/4', label: '11 lbs and under' },
    { maxWeight: 20, chews: '1/2', label: '12-20 lbs' },
    { maxWeight: 34, chews: '1', label: '21-34 lbs' },
    { maxWeight: 60, chews: '2', label: '35-60 lbs' },
    { maxWeight: 100, chews: '3', label: '61-100 lbs' },
    { maxWeight: Infinity, chews: '4', label: 'Over 100 lbs' },
];

export const CBD_CHEW_GUIDE = `Dogs by weight: ${CBD_CHEW_RANGES.map(r => `${r.label} = ${r.chews}`).join(' · ')}. Cats = ${CAT_CBD_CHEWS}.`;

/**
 * Chews per dose, or null when the weight isn't known yet (dogs).
 */
export function getCbdChews(species, weight) {
    if (species === 'Cat') return CAT_CBD_CHEWS;
    const lbs = Number(weight);
    if (!lbs || lbs <= 0) return null;
    return CBD_CHEW_RANGES.find(r => lbs <= r.maxWeight)?.chews ?? null;
}

// The fraction strings above, as numbers, so doses can be totalled.
const CHEW_VALUES = { '1/4': 0.25, '1/2': 0.5, '1': 1, '2': 2, '3': 3, '4': 4 };

/**
 * Numeric chews per dose for a dose string, or null if it can't be totalled.
 */
export function chewValue(chews) {
    return chews in CHEW_VALUES ? CHEW_VALUES[chews] : null;
}

/**
 * "1/4 chew", "1 chew", "2 chews"
 */
export function formatChews(chews) {
    if (!chews) return null;
    return `${chews} chew${chews === '1' ? '' : 's'}`;
}