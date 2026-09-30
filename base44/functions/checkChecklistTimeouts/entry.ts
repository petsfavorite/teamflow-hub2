import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import moment from 'npm:moment-timezone@0.5.45';
import { requireAdminOnly } from '../../shared/auth.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { error: authError } = await requireAdminOnly(base44);
    if (authError) return authError;

    const now = new Date();
    const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    const tz = settings[0]?.global_timezone || 'America/New_York';
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz });

    // Find all active checklist templates with a due_date and due_time that have passed
    const activeTemplates = await base44.asServiceRole.entities.ChecklistTemplate.filter({ status: 'active' });

    const overdueTemplates = activeTemplates.filter(t => {
      if (!t.due_date) return false;
      const dueTimeStr = t.due_time || '21:00';
      const dueDateTime = moment.tz(`${t.due_date}T${dueTimeStr}:00`, tz).toDate();
      return now >= dueDateTime;
    });

    const allUsers = await base44.asServiceRole.entities.User.list();
    const teams = await base44.asServiceRole.entities.Team.list();
    let processed = 0;

    for (const template of overdueTemplates) {
      // Check if already completed
      const completions = await base44.asServiceRole.entities.ChecklistCompletion.filter({
        checklist_template_id: template.id,
        status: 'completed'
      });
      if (completions.length > 0) {
        // Already submitted, but the template is still open (e.g. the page's finalize call failed).
        // Close it out the same way finalizeChecklistAssignment does so it leaves everyone's list.
        await base44.asServiceRole.entities.ChecklistTemplate.update(template.id, {
          status: 'archived',
          assigned_to_emails: [],
          assigned_to_names: [],
          assigned_teams: []
        });
        continue;
      }

      // Get in-progress completion if exists, otherwise treat all items as unchecked
      const inProgress = await base44.asServiceRole.entities.ChecklistCompletion.filter({
        checklist_template_id: template.id,
        status: 'in_progress'
      });

      const incompleteItems = (inProgress[0]?.completed_items || (template.items || []).map(item => ({ ...item, checked: false })))
        .filter(item => !item.checked);

      // Update the existing in-progress completion in place (prevents orphaned duplicate records).
      // If no in-progress record exists, create a new completed one for history.
      let completion;
      if (inProgress[0]) {
        completion = await base44.asServiceRole.entities.ChecklistCompletion.update(inProgress[0].id, {
          status: 'completed',
          completion_date: todayStr,
          completed_by: 'system',
          completed_by_name: 'Auto-submitted (due time reached)'
        });
      } else {
        completion = await base44.asServiceRole.entities.ChecklistCompletion.create({
          checklist_template_id: template.id,
          checklist_title: template.title,
          recurring_checklist_id: template.recurring_checklist_id || null,
          completed_by: 'system',
          completed_by_name: 'Auto-submitted (due time reached)',
          completed_items: (template.items || []).map(item => ({ ...item, checked: false })),
          completion_date: todayStr,
          status: 'completed'
        });
      }

      // Mark template closed
      await base44.asServiceRole.entities.ChecklistTemplate.update(template.id, {
        status: 'closed'
      });

      // If there are incomplete items, notify managers
      if (incompleteItems.length > 0) {
        const managerEmails = new Set();

        // Add admins and super_admins
        allUsers.forEach(u => {
          if (u.role === 'super_admin' || u.role === 'admin') {
            managerEmails.add(u.email);
          }
        });

        // Add managers from assigned teams
        if (template.assigned_teams?.length > 0) {
          const assignedTeams = teams.filter(t => template.assigned_teams.includes(t.id));
          assignedTeams.forEach(team => {
            allUsers
              .filter(u => u.role === 'manager' && team.member_emails?.includes(u.email))
              .forEach(m => managerEmails.add(m.email));
          });
        }

        // Add managers from teams of assigned users
        if (template.assigned_to_emails?.length > 0) {
          const relevantTeams = teams.filter(t =>
            t.member_emails?.some(email => template.assigned_to_emails.includes(email))
          );
          relevantTeams.forEach(team => {
            allUsers
              .filter(u => u.role === 'manager' && team.member_emails?.includes(u.email))
              .forEach(m => managerEmails.add(m.email));
          });
        }

        for (const managerEmail of managerEmails) {
          const manager = allUsers.find(u => u.email === managerEmail);
          if (!manager) continue;
          const managerTeams = teams.filter(t => t.member_emails?.includes(managerEmail));
          const teamId = managerTeams.length > 0 ? managerTeams[0].id : null;
          const teamName = managerTeams.length > 0 ? managerTeams[0].name : null;
          await base44.asServiceRole.entities.ChecklistNotification.create({
            checklist_completion_id: completion.id,
            checklist_title: template.title,
            manager_email: manager.email,
            manager_name: manager.full_name,
            incomplete_items: incompleteItems,
            completed_by: 'system',
            completed_by_name: 'Auto-submitted (due time reached)',
            team_id: teamId,
            team_name: teamName,
            read: false
          });
        }
      }

      processed++;
    }

    const alerted = await alertUnsubmittedChecklists(base44, allUsers, teams);

    return Response.json({ success: true, processed, alerted });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Managers to notify: every admin / super_admin, plus managers on the teams of the people
// involved (the assigned teams, and any team containing an assigned or submitting user).
function getManagersToNotify(allUsers, teams, { assignedTeams = [], emails = [] }) {
  const managerEmails = new Set<string>();
  allUsers.forEach(u => {
    if (u.role === 'super_admin' || u.role === 'admin') managerEmails.add(u.email);
  });
  const relevantTeams = teams.filter(t =>
    assignedTeams.includes(t.id) || t.member_emails?.some(e => emails.includes(e))
  );
  relevantTeams.forEach(team => {
    allUsers
      .filter(u => u.role === 'manager' && team.member_emails?.includes(u.email))
      .forEach(m => managerEmails.add(m.email));
  });
  return managerEmails;
}

// A checklist with every item checked that is still "in progress" was never submitted (the
// submit step failed or the page was closed). After 24 hours, alert the managers and admins once.
async function alertUnsubmittedChecklists(base44, allUsers, teams) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const inProgress = await base44.asServiceRole.entities.ChecklistCompletion.filter(
    { status: 'in_progress' }, '-updated_date', 500
  );

  let alerted = 0;
  for (const completion of inProgress) {
    const items = completion.completed_items || [];
    if (items.length === 0 || !items.every(i => i.checked)) continue;

    const lastTouched = new Date(completion.updated_date || completion.created_date).getTime();
    if (!(lastTouched < cutoff)) continue;

    const already = await base44.asServiceRole.entities.ChecklistNotification.filter({
      checklist_completion_id: completion.id,
      type: 'unsubmitted_24h'
    });
    if (already.length > 0) continue;

    let template = null;
    try {
      template = await base44.asServiceRole.entities.ChecklistTemplate.get(completion.checklist_template_id);
    } catch (_) { /* template may have been deleted */ }

    const emails = [
      ...(completion.completed_by ? [completion.completed_by] : []),
      ...(template?.assigned_to_emails || []),
    ];
    const managerEmails = getManagersToNotify(allUsers, teams, {
      assignedTeams: template?.assigned_teams || [],
      emails,
    });

    for (const managerEmail of managerEmails) {
      const manager = allUsers.find(u => u.email === managerEmail);
      if (!manager) continue;
      const managerTeam = teams.find(t => t.member_emails?.includes(managerEmail));
      await base44.asServiceRole.entities.ChecklistNotification.create({
        checklist_completion_id: completion.id,
        checklist_title: completion.checklist_title,
        manager_email: manager.email,
        manager_name: manager.full_name,
        incomplete_items: [],
        completed_by: completion.completed_by,
        completed_by_name: completion.completed_by_name,
        team_id: managerTeam?.id || null,
        team_name: managerTeam?.name || null,
        type: 'unsubmitted_24h',
        message: `All items on "${completion.checklist_title}" were checked off by ${completion.completed_by_name || completion.completed_by || 'a team member'}, but it has not been submitted for over 24 hours.`,
        read: false
      });
    }
    alerted++;
  }
  return alerted;
}
