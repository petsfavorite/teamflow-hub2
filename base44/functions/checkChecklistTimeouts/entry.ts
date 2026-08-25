import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import moment from 'npm:moment-timezone@0.5.45';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

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

    if (overdueTemplates.length === 0) {
      return Response.json({ processed: 0 });
    }

    const allUsers = await base44.asServiceRole.entities.User.list();
    const teams = await base44.asServiceRole.entities.Team.list();
    let processed = 0;

    for (const template of overdueTemplates) {
      // Check if already completed
      const completions = await base44.asServiceRole.entities.ChecklistCompletion.filter({
        checklist_template_id: template.id,
        status: 'completed'
      });
      if (completions.length > 0) continue;

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
          await base44.asServiceRole.entities.ChecklistNotification.create({
            checklist_completion_id: completion.id,
            checklist_title: template.title,
            manager_email: manager.email,
            manager_name: manager.full_name,
            incomplete_items: incompleteItems,
            completed_by: 'system',
            completed_by_name: 'Auto-submitted (due time reached)',
            read: false
          });
        }
      }

      processed++;
    }

    return Response.json({ success: true, processed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});