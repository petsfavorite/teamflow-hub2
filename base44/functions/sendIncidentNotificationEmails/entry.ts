import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    // Only process incident creation events
    if (event.type !== 'create' || event.entity_name !== 'IncidentReport') {
      return Response.json({ success: false, message: 'Not an incident creation event' }, { status: 400 });
    }

    const incident = data;

    // Get all admins and super admins
    const allUsers = await base44.asServiceRole.entities.User.list();
    const adminEmails = allUsers
      .filter(u => u.role === 'admin' || u.role === 'super_admin')
      .map(u => u.email);

    if (adminEmails.length === 0) {
      return Response.json({ success: true, message: 'No admins to notify' });
    }

    // Send email to each admin/super admin
    const emailPromises = adminEmails.map(adminEmail =>
      base44.integrations.Core.SendEmail({
        to: adminEmail,
        subject: `New Incident Report: ${incident.title}`,
        body: `
A new incident report has been submitted.

Title: ${incident.title}
Category: ${incident.category}
Status: ${incident.status}
Date: ${incident.incident_date}
Time: ${incident.incident_time || 'Not specified'}
Reported by: ${incident.reported_by_name || incident.reported_by}
${incident.is_private ? '\n🔒 This is a PRIVATE incident report.' : ''}

Description:
${incident.description}

${incident.assigned_to ? `\nAssigned to: ${incident.assigned_to}` : '\nNot yet assigned.'}

View the full report in the app to add notes or update the status.
        `
      })
    );

    await Promise.all(emailPromises);

    return Response.json({ success: true, message: `Emails sent to ${adminEmails.length} admins` });
  } catch (error) {
    console.error('Error sending incident notification emails:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});