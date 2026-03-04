import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all checklist templates with time limits assigned to users or teams
    const templates = await base44.asServiceRole.entities.ChecklistTemplate.filter({ status: 'published' });
    
    const templatesWithTimeouts = templates.filter(t => t.time_limit_hours && (t.assigned_to_emails?.length > 0 || t.assigned_teams?.length > 0));

    // Get all users
    const allUsers = await base44.asServiceRole.entities.User.list();
    const adminUsers = allUsers.filter(u => u.role === 'admin' || u.role === 'super_admin');

    const now = new Date();
    const notificationsToCreate = [];

    for (const template of templatesWithTimeouts) {
      // Get recent completions for this template
      const recentCompletions = await base44.asServiceRole.entities.ChecklistCompletion.filter(
        { checklist_template_id: template.id },
        '-created_date',
        10
      );

      const timeoutMs = (template.time_limit_hours || 0) * 60 * 60 * 1000;

      // Check each assigned user
      if (template.assigned_to_emails?.length > 0) {
        for (const email of template.assigned_to_emails) {
          const user = allUsers.find(u => u.email === email);
          if (!user) continue;

          // Check if there's a recent completion by this user
          const userCompletion = recentCompletions.find(c => c.completed_by === email);
          const lastCompletionTime = userCompletion ? new Date(userCompletion.created_date) : null;

          // Check if timeout has passed
          if (!lastCompletionTime || (now - lastCompletionTime) > timeoutMs) {
            // Create notification for the assigned manager
            notificationsToCreate.push({
              checklist_template_id: template.id,
              checklist_title: template.title,
              assigned_to_email: email,
              assigned_to_name: user.full_name,
              manager_email: email,
              manager_name: user.full_name,
              is_admin_notification: false,
              timeout_date: new Date().toISOString()
            });

            // Create notifications for all admins
            for (const admin of adminUsers) {
              notificationsToCreate.push({
                checklist_template_id: template.id,
                checklist_title: template.title,
                assigned_to_email: email,
                assigned_to_name: user.full_name,
                manager_email: admin.email,
                manager_name: admin.full_name,
                is_admin_notification: true,
                timeout_date: new Date().toISOString()
              });
            }
          }
        }
      }

      // Check each assigned team
      if (template.assigned_teams?.length > 0) {
        const teams = await base44.asServiceRole.entities.Team.filter({ id: { $in: template.assigned_teams } });
        
        for (const team of teams) {
          if (!team.member_emails?.length) continue;

          for (const email of team.member_emails) {
            const user = allUsers.find(u => u.email === email);
            if (!user || (user.role !== 'manager' && user.role !== 'admin' && user.role !== 'super_admin')) continue;

            // Check if there's a recent completion by this user
            const userCompletion = recentCompletions.find(c => c.completed_by === email);
            const lastCompletionTime = userCompletion ? new Date(userCompletion.created_date) : null;

            // Check if timeout has passed
            if (!lastCompletionTime || (now - lastCompletionTime) > timeoutMs) {
              // Create notification for the team member
              notificationsToCreate.push({
                checklist_template_id: template.id,
                checklist_title: template.title,
                assigned_to_email: email,
                assigned_to_name: user.full_name,
                manager_email: email,
                manager_name: user.full_name,
                is_admin_notification: false,
                timeout_date: new Date().toISOString()
              });

              // Create notifications for all admins
              for (const admin of adminUsers) {
                notificationsToCreate.push({
                  checklist_template_id: template.id,
                  checklist_title: template.title,
                  assigned_to_email: email,
                  assigned_to_name: user.full_name,
                  manager_email: admin.email,
                  manager_name: admin.full_name,
                  is_admin_notification: true,
                  timeout_date: new Date().toISOString()
                });
              }
            }
          }
        }
      }
    }

    // Create notifications, avoiding duplicates
    if (notificationsToCreate.length > 0) {
      // Check for existing notifications to avoid duplicates
      const existingNotifications = await base44.asServiceRole.entities.ChecklistTimeoutNotification.list();
      
      for (const notification of notificationsToCreate) {
        const exists = existingNotifications.some(n => 
          n.checklist_template_id === notification.checklist_template_id &&
          n.manager_email === notification.manager_email &&
          n.assigned_to_email === notification.assigned_to_email
        );
        
        if (!exists) {
          await base44.asServiceRole.entities.ChecklistTimeoutNotification.create(notification);
        }
      }
    }

    return Response.json({ notifications: notificationsToCreate.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});