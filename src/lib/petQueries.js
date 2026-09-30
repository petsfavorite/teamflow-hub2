import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const CHUNK = 100;

// Load only the pets that have a checked-in visit, so the number of pets
// registered in total can never hide a checked-in pet from the whiteboard.
async function fetchPetsForVisits(petIds) {
    if (petIds.length === 0) return [];
    try {
        const chunks = [];
        for (let i = 0; i < petIds.length; i += CHUNK) chunks.push(petIds.slice(i, i + CHUNK));
        const results = await Promise.all(
            chunks.map(ids => base44.entities.Pet.filter({ id: { $in: ids } }, null, ids.length))
        );
        return results.flat();
    } catch (err) {
        // If the targeted lookup ever fails, fall back to a large plain list.
        console.warn('Pet lookup by id failed, falling back to full list', err);
        return base44.entities.Pet.list(null, 1000);
    }
}

/**
 * Pets for the given (checked-in) visits. Waits until visits have loaded.
 * Cached under ['pets', ...] so invalidating ['pets'] refreshes it too.
 */
export function usePetsForVisits(visits, visitsReady) {
    const petIds = [...new Set((visits || []).map(v => v.pet_id).filter(Boolean))].sort();
    const query = useQuery({
        queryKey: ['pets', 'checked-in', petIds.join(',')],
        queryFn: () => fetchPetsForVisits(petIds),
        enabled: visitsReady,
        placeholderData: (previous) => previous, // no flicker when the set of pets changes
    });
    return {
        pets: query.data || [],
        // "pending" also covers the moment before visits have finished loading
        isLoading: query.isPending && visitsReady ? true : !visitsReady,
    };
}
