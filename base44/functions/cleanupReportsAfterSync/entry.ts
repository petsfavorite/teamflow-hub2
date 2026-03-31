import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Get all reports
        const reports = await base44.asServiceRole.entities.Report.list();
        
        if (!reports || reports.length === 0) {
            return Response.json({ success: true, deleted: 0, message: 'No reports to clean up' });
        }

        // Delete reports that have expiry dates in the past
        // (Reports have a 90-day expiry window before being sent to Google Drive)
        const now = new Date();
        let deletedCount = 0;

        for (const report of reports) {
            if (report.expiry_date) {
                const expiryDate = new Date(report.expiry_date);
                // Delete if the expiry date has passed (report window closed)
                if (expiryDate < now) {
                    await base44.asServiceRole.entities.Report.delete(report.id);
                    deletedCount++;
                }
            }
        }

        return Response.json({ 
            success: true, 
            deleted: deletedCount,
            message: `Cleaned up ${deletedCount} expired report(s)`
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});