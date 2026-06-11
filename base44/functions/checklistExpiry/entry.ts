import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    // Get all published checklists (not templates - those with due_date set)
    const publishedChecklists = await base44.asServiceRole.entities.ChecklistTemplate.filter({ status: 'published' });

    for (const checklist of publishedChecklists) {
      const dueTime = checklist.due_time || '21:00';

      // Skip checklists with no due date (pure unassigned templates)
      if (!checklist.due_date) continue;

      // Check if checklist has expired
      const isPastDue = checklist.due_date < today || (checklist.due_date === today && currentTime >= dueTime);
      if (!isPastDue) continue;

      // Archive the checklist
      await base44.asServiceRole.entities.ChecklistTemplate.update(checklist.id, { status: 'archived' });

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
        });
        completionId = completion.id;
      } else {
        // No completion started at all — create a completed record for history
        const newCompletion = await base44.asServiceRole.entities.ChecklistCompletion.create({
          checklist_template_id: checklist.id,
          checklist_title: checklist.title,
          completed_by: null,
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

      // Gather managers on assigned teams + all admins/super_admins
      const managers = new Map(); // email -> user

      if (checklist.assigned_teams?.length > 0) {
        const teams = await base44.asServiceRole.entities.Team.filter({ id: { $in: checklist.assigned_teams } });
        for (const team of teams) {
          if (!team.member_emails?.length) continue;
          const teamManagers = await base44.asServiceRole.entities.User.filter({
            email: { $in: team.member_emails },
            role: { $in: ['manager', 'admin', 'super_admin'] }
          });
          for (const m of teamManagers) managers.set(m.email, { user: m, teamId: team.id, teamName: team.name });
        }
      }

      // Also notify all admins/super_admins not already in the list
      const allPrivileged = await base44.asServiceRole.entities.User.filter({
        role: { $in: ['admin', 'super_admin'] }
      });
      for (const u of allPrivileged) {
        if (!managers.has(u.email)) {
          managers.set(u.email, { user: u, teamId: null, teamName: null });
        }
      }

      for (const [, { user, teamId, teamName }] of managers) {
        await base44.asServiceRole.entities.ChecklistNotification.create({
          checklist_completion_id: completionId,
          checklist_title: checklist.title,
          manager_email: user.email,
          manager_name: user.full_name,
          incomplete_items: incompleteItems,
          completed_by: null,
          completed_by_name: 'Auto-closed (past due)',
          team_id: teamId,
          team_name: teamName || 'Unknown',
          read: false
        });
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});