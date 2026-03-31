import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const FOLDER_ID = '1cS0qd-257GiwotZNyFy_UJnmoaMVsA38';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || !['admin', 'super_admin'].includes(user.role)) {
            return Response.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
        const authHeader = { Authorization: `Bearer ${accessToken}` };

        // Get all reports
        const reports = await base44.asServiceRole.entities.Report.list();

        let uploadedCount = 0;
        let errors = [];

        for (const report of reports) {
            try {
                // Download the PDF from the report URL
                const pdfResponse = await fetch(report.report_url);
                if (!pdfResponse.ok) {
                    errors.push(`Failed to download ${report.pet_name}'s report`);
                    continue;
                }

                const pdfBuffer = await pdfResponse.arrayBuffer();
                
                // Create filename
                const filename = `${report.pet_name}_${report.visit_type}_${report.check_out_date}.pdf`;

                // Upload to Google Drive
                const formData = new FormData();
                formData.append('metadata', JSON.stringify({
                    name: filename,
                    parents: [FOLDER_ID],
                    mimeType: 'application/pdf'
                }));
                formData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }));

                const uploadResponse = await fetch(
                    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
                    {
                        method: 'POST',
                        headers: authHeader,
                        body: formData
                    }
                );

                if (uploadResponse.ok) {
                    uploadedCount++;
                } else {
                    errors.push(`Failed to upload ${filename}`);
                }
            } catch (err) {
                errors.push(`Error processing ${report.pet_name}: ${err.message}`);
            }
        }

        return Response.json({
            success: true,
            uploadedCount,
            totalReports: reports.length,
            errors: errors.length > 0 ? errors : null
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});