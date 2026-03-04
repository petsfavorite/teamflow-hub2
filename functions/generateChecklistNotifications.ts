import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { checklist_completion_id } = await req.json();

    if (!checklist_completion_id) {
      return Response.json({ error: 'Missing checklist_completion_id' }, { status: 400 });
    }

    // Fetch the completion
    const completion = await base44.asServiceRole.entities.ChecklistCompletion.get(checklist_completion_id);
    if (!completion) {
      return Response.json({ error: 'Completion not found' }, { status: 404 });
    }

    // Find unchecked items
    const incompleteItems = completion.completed_items?.filter(item => !item.checked) || [];
    if (incompleteItems.length === 0) {
      return Response.json({ notifications: [] });
    }

    // Fetch the template to get team info
    const template = await base44.asServiceRole.entities.ChecklistTemplate.get(completion.checklist_template_id);
    if (!template) {
      return Response.json({ error: 'Template not found' }, { status: 404 });
    }

    // Get teams the checklist is assigned to
    const teamIds = template.assigned_teams || [];
    const teams = teamIds.length > 0 
      ? await base44.asServiceRole.entities.Team.filter({ id: { $in: teamIds } })
      : [];

    // Collect all managers from assigned teams
    const managerEmails = new Set();
    for (const team of teams) {
      if (team.member_emails) {
        team.member_emails.forEach(email => managerEmails.add(email));
      }
    }

    // Fetch all users to get manager roles and names
    const allUsers = await base44.asServiceRole.entities.User.list();
    const managers = allUsers.filter(u => 
      (u.role === 'manager' || u.role === 'admin' || u.role === 'super_admin') &&
      managerEmails.has(u.email)
    );

    // Create notifications for each manager
    const notifications = [];
    for (const manager of managers) {
      for (const team of teams) {
        if (team.member_emails?.includes(manager.email)) {
          const notification = {
            checklist_completion_id,
            checklist_title: completion.checklist_title,
            manager_email: manager.email,
            manager_name: manager.full_name,
            incomplete_items: incompleteItems,
            completed_by: completion.completed_by,
            completed_by_name: completion.completed_by_name,
            team_id: team.id,
            team_name: team.name,
            read: false
          };
          notifications.push(notification);
        }
      }
    }

    // Create notifications in database
    if (notifications.length > 0) {
      await base44.asServiceRole.entities.ChecklistNotification.bulkCreate(notifications);
    }

    return Response.json({ notifications });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});