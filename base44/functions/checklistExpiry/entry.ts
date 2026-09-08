import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    const tz = settings[0]?.global_timezone || 'America/New_York';
    const today = now.toLocaleDateString('en-CA', { timeZone: tz });
    const currentTime = now.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });

    // Get all published checklists (not templates - those with due_date set)
    const publishedChecklists = await base44.asServiceRole.entities.ChecklistTemplate.filter({ status: 'published' });

    // Fetch users and teams ONCE before the loop (avoid N+1 queries)
    const allUsers = await base44.asServiceRole.entities.User.list();
    const teams = await base44.asServiceRole.entities.Team.list();

    for (const checklist of publishedChecklists) {
      const dueTime = checklist.due_time || '21:00';

      // Skip checklists with no due date (pure unassigned templates)
      if (!checklist.due_date) continue;

      // Check if checklist has expired
      const isPastDue = checklist.due_date < today || (checklist.due_date === today && currentTime >= dueTime);
      if (!isPastDue) continue;

      // Archive the checklist and clear assignments (consistent with finalizeChecklistAssignment)
      await base44.asServiceRole.entities.ChecklistTemplate.update(checklist.id, {
        status: 'archived',
        assigned_to_emails: [],
        assigned_to_names: [],
        assigned_teams: []
      });

      // Find any in-progress completion — finalize it as completed
      const completions = await base44.asServiceRole.entities.ChecklistCompletion.filter({
        checklist_template_id: checklist.id,
        status: 'in_progress'
      });

      let completionId = null;
      let incompleteItems = [];

      if (completions.length > 0) {
        const completion = completions[0];
        incompleteItems = (completion.completed_items || []).filter(item => !item.checked);

        // Finalize the in-progress completion as completed (auto-closed)
        await base44.asServiceRole.entities.ChecklistCompletion.update(completion.id, {
          status: 'completed',
          completion_date: today,
          completed_by: 'system',
          completed_by_name: 'Auto-closed (past due)'
        });
        completionId = completion.id;
      } else {
        // No completion started at all — create a completed record for history
        const newCompletion = await base44.asServiceRole.entities.ChecklistCompletion.create({
          checklist_template_id: checklist.id,
          checklist_title: checklist.title,
          recurring_checklist_id: checklist.recurring_checklist_id || null,
          completed_by: 'system',
          completed_by_name: 'Auto-closed (past due)',
          completed_items: (checklist.items || []).map(item => ({ ...item, checked: false })),
          completion_date: today,
          status: 'completed',
        });
        completionId = newCompletion.id;
        incompleteItems = checklist.items || [];
      }

      // Only notify if there are incomplete items
      if (incompleteItems.length === 0) continue;

      // Gather managers to notify (consistent with checkChecklistTimeouts format)
      const managerEmails = new Set();
      const managerTeamMap = new Map(); // email -> { teamId, teamName }

      // Add all admins and super_admins
      allUsers.forEach(u => {
        if (u.role === 'super_admin' || u.role === 'admin') {
          managerEmails.add(u.email);
          managerTeamMap.set(u.email, { teamId: null, teamName: null });
        }
      });

      // Add managers from assigned teams
      if (checklist.assigned_teams?.length > 0) {
        const assignedTeams = teams.filter(t => checklist.assigned_teams.includes(t.id));
        assignedTeams.forEach(team => {
          allUsers
            .filter(u => u.role === 'manager' && team.member_emails?.includes(u.email))
            .forEach(m => {
              managerEmails.add(m.email);
              managerTeamMap.set(m.email, { teamId: team.id, teamName: team.name });
            });
        });
      }

      // Add managers from teams of assigned users
      if (checklist.assigned_to_emails?.length > 0) {
        const relevantTeams = teams.filter(t =>
          t.member_emails?.some(email => checklist.assigned_to_emails.includes(email))
        );
        relevantTeams.forEach(team => {
          allUsers
            .filter(u => u.role === 'manager' && team.member_emails?.includes(u.email))
            .forEach(m => {
              managerEmails.add(m.email);
              managerTeamMap.set(m.email, { teamId: team.id, teamName: team.name });
            });
        });
      }

      for (const managerEmail of managerEmails) {
        const manager = allUsers.find(u => u.email === managerEmail);
        if (!manager) continue;
        const teamInfo = managerTeamMap.get(managerEmail) || { teamId: null, teamName: null };
        await base44.asServiceRole.entities.ChecklistNotification.create({
          checklist_completion_id: completionId,
          checklist_title: checklist.title,
          manager_email: manager.email,
          manager_name: manager.full_name,
          incomplete_items: incompleteItems,
          completed_by: 'system',
          completed_by_name: 'Auto-closed (past due)',
          team_id: teamInfo.teamId,
          team_name: teamInfo.teamName,
          read: false
        });
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});