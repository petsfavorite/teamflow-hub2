import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const caller = await base44.auth.me();
  if (!caller || !['admin', 'super_admin'].includes(caller.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { deleted_user_email, deleted_user_role, team_ids } = await req.json();

  // Fetch all users to find reassignment targets
  const allUsers = await base44.asServiceRole.entities.User.list('full_name', 500);

  let assignees = [];

  if (deleted_user_role === 'manager') {
    // Reassign to admins and super_admins
    assignees = allUsers.filter(u => ['admin', 'super_admin'].includes(u.role) && u.email !== deleted_user_email);
  } else {
    // Regular user — reassign to managers on the same teams
    const teams = await base44.asServiceRole.entities.Team.list('name', 200);
    const userTeams = teams.filter(t => (team_ids || []).includes(t.id));
    const managerEmails = new Set(
      userTeams.flatMap(t => t.member_emails || [])
        .filter(email => {
          const u = allUsers.find(u => u.email === email);
          return u && u.role === 'manager';
        })
    );
    assignees = allUsers.filter(u => managerEmails.has(u.email));
    // Fallback: if no managers found on teams, fall back to admins
    if (assignees.length === 0) {
      assignees = allUsers.filter(u => ['admin', 'super_admin'].includes(u.role) && u.email !== deleted_user_email);
    }
  }

  if (assignees.length === 0) {
    return Response.json({ reassigned: 0, message: 'No suitable assignees found' });
  }

  // Pick the first assignee (or spread round-robin — keep it simple: first admin/manager)
  const primary = assignees[0];

  let reassigned = 0;

  // --- Tasks ---
  const tasks = await base44.asServiceRole.entities.Task.filter({ status: 'pending' });
  const myTasks = tasks.filter(t =>
    t.assigned_to_emails?.includes(deleted_user_email)
  );
  for (const task of myTasks) {
    const newEmails = task.assigned_to_emails.map(e => e === deleted_user_email ? primary.email : e);
    const newNames = (task.assigned_to_names || []).map((n, i) =>
      task.assigned_to_emails[i] === deleted_user_email ? (primary.full_name || primary.email) : n
    );
    await base44.asServiceRole.entities.Task.update(task.id, {
      assigned_to_emails: newEmails,
      assigned_to_names: newNames,
    });
    reassigned++;
  }

  // --- Maintenance Requests ---
  const maint = await base44.asServiceRole.entities.MaintenanceRequest.filter({ assigned_to: deleted_user_email });
  for (const m of maint) {
    await base44.asServiceRole.entities.MaintenanceRequest.update(m.id, {
      assigned_to: primary.email,
    });
    reassigned++;
  }

  // --- Incident Reports ---
  const incidents = await base44.asServiceRole.entities.IncidentReport.filter({ assigned_to: deleted_user_email });
  for (const inc of incidents) {
    if (inc.status !== 'resolved') {
      await base44.asServiceRole.entities.IncidentReport.update(inc.id, {
        assigned_to: primary.email,
      });
      reassigned++;
    }
  }

  // --- Checklist Templates assigned to this user ---
  const checklists = await base44.asServiceRole.entities.ChecklistTemplate.list('title', 500);
  const myChecklists = checklists.filter(c =>
    c.status === 'active' && c.assigned_to_emails?.includes(deleted_user_email)
  );
  for (const c of myChecklists) {
    const newEmails = c.assigned_to_emails.map(e => e === deleted_user_email ? primary.email : e);
    const newNames = (c.assigned_to_names || []).map((n, i) =>
      c.assigned_to_emails[i] === deleted_user_email ? (primary.full_name || primary.email) : n
    );
    await base44.asServiceRole.entities.ChecklistTemplate.update(c.id, {
      assigned_to_emails: newEmails,
      assigned_to_names: newNames,
    });
    reassigned++;
  }

  return Response.json({
    reassigned,
    assigned_to: primary.email,
    message: `Reassigned ${reassigned} items to ${primary.full_name || primary.email}`
  });
});