import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const sop = body.data;
    if (!sop) return Response.json({ skipped: 'no sop data' });

    if (!sop.requires_acknowledgement || sop.status !== 'published') {
      return Response.json({ skipped: 'not applicable' });
    }

    const sopId = sop.id;
    const dueDays = sop.acknowledgement_due_days || 3;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDays);
    const dueDateStr = dueDate.toISOString().split('T')[0];
    const sopTitle = sop.title || 'SOP';

    const allUsers = await base44.asServiceRole.entities.User.list('full_name', 500);
    const targetEmails = new Set();

    if (sop.acknowledgement_assigned_emails?.length > 0) {
      sop.acknowledgement_assigned_emails.forEach(e => targetEmails.add(e));
    }
    if (sop.acknowledgement_assigned_teams?.length > 0) {
      const teams = await base44.asServiceRole.entities.Team.list('name', 200);
      for (const team of teams) {
        if (sop.acknowledgement_assigned_teams.includes(team.id)) {
          (team.member_emails || []).forEach(e => targetEmails.add(e));
        }
      }
    }
    if (targetEmails.size === 0) {
      allUsers.forEach(u => targetEmails.add(u.email));
    }

    const userMap = {};
    allUsers.forEach(u => { userMap[u.email] = u.full_name || u.email; });

    const existingTasks = await base44.asServiceRole.entities.Task.filter({ sop_id: sopId, status: 'pending' });
    for (const t of existingTasks) {
      await base44.asServiceRole.entities.Task.delete(t.id);
    }

    const tasks = [];
    for (const email of targetEmails) {
      tasks.push({
        title: `Acknowledge SOP: ${sopTitle}`,
        description: `Please read and acknowledge the SOP "${sopTitle}". Open the SOP Library to view and acknowledge it.`,
        assigned_to_emails: [email],
        assigned_to_names: [userMap[email] || email],
        due_date: dueDateStr,
        priority: 'high',
        status: 'pending',
        sop_id: sopId,
      });
    }

    if (tasks.length > 0) {
      await base44.asServiceRole.entities.Task.bulkCreate(tasks);
    }

    return Response.json({ created: tasks.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});