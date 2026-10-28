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

    // The service-role fetch above bypasses entity RLS, so mirror the read rules here:
    // only the creator, assigned staff, or a manager/admin/super_admin may act on a record.
    const PRIVILEGED_ROLES = ['manager', 'admin', 'super_admin'];
    const isPrivileged = PRIVILEGED_ROLES.includes(user.role || '');
    const isCreator = !!creatorEmail && creatorEmail === user.email;
    const isAssigned = assignedEmails.includes(user.email) || record.assigned_to === user.email;
    if (!isPrivileged && !isCreator && !isAssigned) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Re-assigning is a management action (the UI only offers it to managers+), and it also
    // keeps this endpoint from being used to probe which addresses are registered users.
    if (action === 'assign' && !isPrivileged) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const title = record.title;
    const label = type === 'incident' ? 'incident report' : 'maintenance request';
    const actorName = user.full_name || user.email;

    // Cap and clean caller-supplied free text so it cannot push oversized or control-character content
    const safeNote = typeof noteText === 'string'
      ? noteText.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 2000)
      : '';

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
      const newEmails = (Array.isArray(newAssigneeEmails) ? newAssigneeEmails : [])
        .filter((e: any) => typeof e === 'string' && e.length > 0 && e !== user.email)
        .slice(0, 50);
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
      bodyText = `${actorName} added a note to the ${label} "${title}":\n\n${safeNote}\n\nPlease review and acknowledge it in the app.`;
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

    // Only a count — the participant addresses belong to the record, not to the caller
    return Response.json({ sent, recipientCount: recipients.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}