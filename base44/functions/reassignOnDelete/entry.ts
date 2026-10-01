import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const caller = await base44.auth.me();
  if (!caller || !['admin', 'super_admin'].includes(caller.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { deleted_user_email, team_ids, reassign_to_email, preview } = await req.json();

  const displayName = (u: any) => `${u?.first_name || ''} ${u?.last_name || ''}`.trim() || u?.full_name || u?.email || '';

  // Fetch all users to find reassignment targets
  const allUsers = await base44.asServiceRole.entities.User.list('full_name', 500);

  // Use the stored role, never a caller-supplied one, and enforce the hierarchy server-side.
  const target = allUsers.find(u => u.email === deleted_user_email);
  const deleted_user_role = target?.role || 'user';
  if (deleted_user_role === 'super_admin' && caller.role !== 'super_admin') {
    return Response.json({ error: 'Only a super admin can make changes to a super admin' }, { status: 403 });
  }
  if (deleted_user_role === 'admin' && caller.role === 'admin') {
    return Response.json({ error: 'Admins cannot remove other admins' }, { status: 403 });
  }

  // Candidate assignees (admins/managers or same-team managers)
  const allTeams = await base44.asServiceRole.entities.Team.list('name', 200);
  let assignees = [];
  if (deleted_user_role === 'manager') {
    assignees = allUsers.filter(u => ['admin', 'super_admin'].includes(u.role) && u.email !== deleted_user_email);
  } else {
    const userTeams = allTeams.filter(t => (team_ids || []).includes(t.id));
    const managerEmails = new Set(
      userTeams.flatMap(t => t.member_emails || [])
        .filter(email => {
          const u = allUsers.find(u => u.email === email);
          return u && u.role === 'manager';
        })
    );
    assignees = allUsers.filter(u => managerEmails.has(u.email));
    if (assignees.length === 0) {
      assignees = allUsers.filter(u => ['admin', 'super_admin'].includes(u.role) && u.email !== deleted_user_email);
    }
  }

  // Gather every active item currently assigned to the deleted user
  const [pendingTasks, inProgressTasks, maint, incidents, checklists, recurring] = await Promise.all([
    base44.asServiceRole.entities.Task.filter({ status: 'pending' }),
    base44.asServiceRole.entities.Task.filter({ status: 'in_progress' }),
    base44.asServiceRole.entities.MaintenanceRequest.filter({ assigned_to: deleted_user_email }),
    base44.asServiceRole.entities.IncidentReport.filter({ assigned_to: deleted_user_email }),
    base44.asServiceRole.entities.ChecklistTemplate.list('title', 500),
    base44.asServiceRole.entities.RecurringChecklist.list('template_title', 500),
  ]);

  const myTasks = [...pendingTasks, ...inProgressTasks].filter(t =>
    t.assigned_to_emails?.includes(deleted_user_email)
  );
  const myMaint = maint;
  const myIncidents = incidents.filter(inc => inc.status !== 'resolved');
  const myChecklists = checklists.filter(c =>
    c.status === 'published' && c.assigned_to_emails?.includes(deleted_user_email)
  );
  const myRecurring = recurring.filter(r =>
    r.is_active !== false && r.assigned_to_emails?.includes(deleted_user_email)
  );

  const count = myTasks.length + myMaint.length + myIncidents.length + myChecklists.length + myRecurring.length;

  // Preview mode: return the count + candidate list so the admin can choose who
  // gets the reassigned items, without modifying anything yet.
  if (preview) {
    return Response.json({
      count,
      candidates: assignees.map(u => ({ email: u.email, name: u.full_name || u.email, role: u.role })),
    });
  }

  // Determine the reassignment target: the admin's explicit choice, else auto-pick.
  let primary = null;
  if (reassign_to_email) {
    primary = allUsers.find(u => u.email === reassign_to_email);
    if (!primary) {
      return Response.json({ error: 'Selected reassign target not found' }, { status: 400 });
    }
  } else if (assignees.length > 0) {
    primary = assignees[0];
  }

  // Really delete them: remove from all team member lists so they don't linger.
  const teamsWithUser = allTeams.filter(t => (t.member_emails || []).includes(deleted_user_email));
  for (const t of teamsWithUser) {
    const idx = (t.member_emails || []).indexOf(deleted_user_email);
    const newEmails = (t.member_emails || []).filter(e => e !== deleted_user_email);
    const newNames = (t.member_names || []).filter((_, i) => i !== idx);
    await base44.asServiceRole.entities.Team.update(t.id, {
      member_emails: newEmails,
      member_names: newNames,
    });
  }

  if (!primary) {
    return Response.json({ reassigned: 0, message: 'No suitable assignees found; user removed from teams.' });
  }

  const deletedName = displayName(target);
  const today = new Date().toLocaleDateString('en-US');
  const noteText = (itemType: string) =>
    `Reassigned ${itemType} from ${deletedName} to ${displayName(primary)} on ${today} by ${displayName(caller)}.`;
  const noteEntry = (itemType: string) => ({
    note: noteText(itemType),
    date: today,
    added_by: caller.email,
    added_by_name: displayName(caller),
  });

  let reassigned = 0;

  // --- Tasks (pending + in_progress) ---
  for (const task of myTasks) {
    const newEmails = task.assigned_to_emails.map(e => e === deleted_user_email ? primary.email : e);
    const newNames = (task.assigned_to_names || []).map((n, i) =>
      task.assigned_to_emails[i] === deleted_user_email ? (primary.full_name || primary.email) : n
    );
    const existingNotes = task.completion_notes ? task.completion_notes + '\n' : '';
    await base44.asServiceRole.entities.Task.update(task.id, {
      assigned_to_emails: newEmails,
      assigned_to_names: newNames,
      completion_notes: existingNotes + noteText('task'),
    });
    reassigned++;
  }

  // --- Maintenance Requests ---
  for (const m of myMaint) {
    await base44.asServiceRole.entities.MaintenanceRequest.update(m.id, {
      assigned_to: primary.email,
      notes_log: [...(m.notes_log || []), noteEntry('maintenance request')],
    });
    reassigned++;
  }

  // --- Incident Reports (non-resolved only) ---
  for (const inc of myIncidents) {
    await base44.asServiceRole.entities.IncidentReport.update(inc.id, {
      assigned_to: primary.email,
      notes_log: [...(inc.notes_log || []), noteEntry('incident report')],
    });
    reassigned++;
  }

  // --- Checklist Templates assigned to this user ---
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

  // --- Recurring checklist schedules assigned to this user ---
  // Reassign so future spawned instances go to a live person. Past
  // ChecklistCompletion records are intentionally left untouched so the
  // deleted user's name remains on the history of checklists they completed.
  for (const r of myRecurring) {
    const newEmails = r.assigned_to_emails.map(e => e === deleted_user_email ? primary.email : e);
    const newNames = (r.assigned_to_names || []).map((n, i) =>
      r.assigned_to_emails[i] === deleted_user_email ? (primary.full_name || primary.email) : n
    );
    await base44.asServiceRole.entities.RecurringChecklist.update(r.id, {
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