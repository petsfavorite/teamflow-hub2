import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
        // Keep call records for 90 days by default. Manual runs may pass days or months.
        const days = (typeof body.days === 'number' && body.days >= 1) ? body.days
            : (typeof body.months === 'number' && body.months >= 1) ? Math.round(body.months * 30)
            : 90;

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