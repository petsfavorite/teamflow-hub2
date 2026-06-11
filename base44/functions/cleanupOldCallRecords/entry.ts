import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Calculate cutoff: one month ago
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - 1);
        const cutoffISO = cutoff.toISOString();

        // Fetch all call records older than one month
        const pageSize = 500;
        let allOld = [];
        let skip = 0;
        while (true) {
            const page = await base44.asServiceRole.entities.CallRecord.filter(
                { call_date: { $lt: cutoffISO } },
                "call_date",
                pageSize,
                skip
            );
            allOld = allOld.concat(page);
            if (page.length < pageSize) break;
            skip += pageSize;
        }

        // Delete each old record
        let deleted = 0;
        for (const record of allOld) {
            await base44.asServiceRole.entities.CallRecord.delete(record.id);
            deleted++;
        }

        return Response.json({ success: true, deleted, cutoff: cutoffISO });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});