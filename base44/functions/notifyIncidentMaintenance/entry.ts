import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { type, id, action, noteText, newAssigneeEmails } = body;
    // type: 'incident' | 'maintenance'
    // action: 'create' | 'assign' | 'note'

    if (!['incident', 'maintenance'].includes(type) || !['create', 'assign', 'note'].includes(action) || !id) {
      return Response.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const entityName = type === 'incident' ? 'IncidentReport' : 'MaintenanceRequest';
    const record = await base44.asServiceRole.entities[entityName].get(id);
    if (!record) return Response.json({ error: 'Not found' }, { status: 404 });

    const creatorEmail = type === 'incident' ? record.reported_by : record.requested_by;
    const creatorName = type === 'incident' ? record.reported_by_name : record.requested_by_name;
    const assignedEmails: string[] = record.assigned_to_emails || [];
    const title = record.title;
    const label = type === 'incident' ? 'incident report' : 'maintenance request';
    const actorName = user.full_name || user.email;

    // Helper: find admins/managers on the creator's team
    const getTeamAdminManagers = async (excludeEmail: string): Promise<{ email: string; name: string }[]> => {
      const teams = await base44.asServiceRole.entities.Team.filter({ member_emails: { $in: [creatorEmail] } });
      const teamMemberEmails = [...new Set((teams || []).flatMap((t: any) => t.member_emails || []))];

      let candidates: any[];
      if (teamMemberEmails.length > 0) {
        const users = await base44.asServiceRole.entities.User.filter({ email: { $in: teamMemberEmails } });
        candidates = users;
      } else {
        // No team found — fall back to all admins/managers/super_admins
        const allUsers = await base44.asServiceRole.entities.User.list();
        candidates = allUsers;
      }

      return candidates
        .filter((u: any) => ['admin', 'manager', 'super_admin'].includes(u.role) && u.email !== excludeEmail)
        .map((u: any) => ({ email: u.email, name: u.full_name || u.email }));
    };

    let recipients: { email: string; name: string }[] = [];
    let subject = '';
    let bodyText = '';

    if (action === 'create') {
      // On creation: notify admins/managers on the creator's team (so they can acknowledge)
      recipients = await getTeamAdminManagers(creatorEmail);
      subject = `New ${label}: ${title}`;
      bodyText = `A new ${label} "${title}" has been filed by ${creatorName || creatorEmail}.\n\nPlease review and acknowledge it in the app.`;
    } else if (action === 'assign') {
      // On assignment: notify newly assigned users (not the actor)
      const newEmails = (newAssigneeEmails || []).filter((e: string) => e !== user.email);
      if (newEmails.length > 0) {
        const users = await base44.asServiceRole.entities.User.filter({ email: { $in: newEmails } });
        recipients = users.map((u: any) => ({ email: u.email, name: u.full_name || u.email }));
      }
      subject = `Assigned to ${label}: ${title}`;
      bodyText = `You have been assigned to the ${label} "${title}" by ${actorName}.\n\nPlease review and acknowledge it in the app.`;
    } else if (action === 'note') {
      // On note: if assigned, notify creator + assigned users; if unassigned, notify admins/managers on team
      if (assignedEmails.length > 0) {
        const emails = [creatorEmail, ...assignedEmails].filter((e: string) => e && e !== user.email);
        if (emails.length > 0) {
          const users = await base44.asServiceRole.entities.User.filter({ email: { $in: emails } });
          recipients = users.map((u: any) => ({ email: u.email, name: u.full_name || u.email }));
        }
      } else {
        recipients = await getTeamAdminManagers(user.email);
      }
      subject = `New note on ${label}: ${title}`;
      bodyText = `${actorName} added a note to the ${label} "${title}":\n\n${noteText || ''}\n\nPlease review and acknowledge it in the app.`;
    }

    // Send emails
    let sent = 0;
    for (const r of recipients) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: r.email,
          subject,
          body: bodyText,
        });
        sent++;
      } catch (e) {
        // Continue even if one email fails
      }
    }

    return Response.json({ sent, recipients: recipients.map((r) => r.email) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}