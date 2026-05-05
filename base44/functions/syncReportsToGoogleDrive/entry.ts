import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FOLDER_ID = '1cS0qd-257GiwotZNyFy_UJnmoaMVsA38';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
        const authHeader = { Authorization: `Bearer ${accessToken}` };

        // Only fetch reports from the last 48 hours to keep the batch small
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const allReports = await base44.asServiceRole.entities.Report.list('-created_date', 200);
        const reports = allReports.filter(r => r.created_date >= cutoff);

        let uploadedCount = 0;
        const errors = [];

        for (const report of reports) {
            try {
                if (!report.report_url) continue;

                const filename = `${report.pet_name}_${report.visit_type || 'visit'}_${report.check_out_date || report.check_in_date}.pdf`;

                // Check if file already exists in Drive to avoid duplicates
                const searchRes = await fetch(
                    `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(filename)}' and '${FOLDER_ID}' in parents and trashed=false&fields=files(id,name)`,
                    { headers: authHeader }
                );
                if (searchRes.ok) {
                    const searchData = await searchRes.json();
                    if (searchData.files && searchData.files.length > 0) {
                        // Already uploaded, skip
                        continue;
                    }
                }

                // Download the PDF
                const pdfResponse = await fetch(report.report_url);
                if (!pdfResponse.ok) {
                    errors.push(`Failed to download ${report.pet_name}'s report: ${pdfResponse.status}`);
                    continue;
                }

                const pdfBuffer = await pdfResponse.arrayBuffer();

                // Upload to Google Drive
                const formData = new FormData();
                formData.append('metadata', new Blob([JSON.stringify({
                    name: filename,
                    parents: [FOLDER_ID],
                    mimeType: 'application/pdf'
                })], { type: 'application/json' }));
                formData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }));

                const uploadResponse = await fetch(
                    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
                    { method: 'POST', headers: authHeader, body: formData }
                );

                if (uploadResponse.ok) {
                    uploadedCount++;
                } else {
                    const errText = await uploadResponse.text();
                    errors.push(`Failed to upload ${filename}: ${errText}`);
                }
            } catch (err) {
                errors.push(`Error processing ${report.pet_name}: ${err.message}`);
            }
        }

        return Response.json({
            success: true,
            uploadedCount,
            skippedOrNew: reports.length,
            errors: errors.length > 0 ? errors : null
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});