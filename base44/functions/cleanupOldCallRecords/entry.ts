import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { requireAdmin } from '../../shared/auth.ts';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { error: authError } = await requireAdmin(base44);
        if (authError) return authError;

        // Call records are kept for exactly 90 days (no other retention period can be passed in).
        const days = 90;

        // Calculate cutoff based on configured days
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffISO = cutoff.toISOString();

        // Delete all call records older than the cutoff in batches
        let deleted = 0;
        const pageSize = 500;
        while (true) {
            const page = await base44.asServiceRole.entities.CallRecord.filter(
                { call_date: { $lt: cutoffISO } },
                "call_date",
                pageSize,
                0
            );
            if (page.length === 0) break;

            const idsToDelete = page.map(r => r.id);
            await base44.asServiceRole.entities.CallRecord.deleteMany({ id: { $in: idsToDelete } });
            deleted += page.length;
            if (page.length < pageSize) break;
        }

        return Response.json({ success: true, deleted, cutoff: cutoffISO, days });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});