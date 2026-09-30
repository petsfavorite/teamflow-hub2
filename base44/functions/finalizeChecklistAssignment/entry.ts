import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { requireUser } from '../../shared/auth.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { error: authError, user: caller } = await requireUser(base44);
    if (authError) return authError;
    const { checklist_template_id, checklist_completion_id } = await req.json();

    if (!checklist_template_id || !checklist_completion_id) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Fetch the completion and template
    const completion = await base44.asServiceRole.entities.ChecklistCompletion.get(checklist_completion_id);
    const template = await base44.asServiceRole.entities.ChecklistTemplate.get(checklist_template_id);

    if (!completion || !template) {
      return Response.json({ error: 'Completion or template not found' }, { status: 404 });
    }

    // The completion must belong to this template.
    if (completion.checklist_template_id !== template.id) {
      return Response.json({ error: 'Completion does not belong to this checklist' }, { status: 400 });
    }

    // Managers, admins and super admins can finalize any checklist. Staff can only wrap up a
    // checklist that is assigned to them (directly or through a team) and that has actually
    // been submitted; this is what lets a submission leave their list without manager access.
    const isManagerOrAbove = ['manager', 'admin', 'super_admin'].includes(caller.role);
    if (!isManagerOrAbove) {
      const callerTeams = await base44.asServiceRole.entities.Team.list();
      const assignedDirectly = template.assigned_to_emails?.includes(caller.email);
      const assignedViaTeam = callerTeams.some(t =>
        template.assigned_teams?.includes(t.id) && t.member_emails?.includes(caller.email)
      );
      if (!assignedDirectly && !assignedViaTeam) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (completion.status !== 'completed') {
        return Response.json({ error: 'Only a submitted checklist can be finalized' }, { status: 403 });
      }
    }

    // Only archive assigned instances — never touch unassigned master templates
    const hasAssignments = (template.assigned_to_emails?.length > 0) || (template.assigned_teams?.length > 0);
    if (hasAssignments) {
      await base44.asServiceRole.entities.ChecklistTemplate.update(checklist_template_id, {
        assigned_to_emails: [],
        assigned_to_names: [],
        assigned_teams: [],
        status: 'archived'
      });
    }

    // Find incomplete items
    const incompleteItems = completion.completed_items?.filter(item => !item.checked) || [];

    // If there are incomplete items, create notifications for relevant managers
    if (incompleteItems.length > 0) {
      // Get all users
      const allUsers = await base44.asServiceRole.entities.User.list();
      const teams = await base44.asServiceRole.entities.Team.list();

      // Find managers to notify:
      // 1. All super_admin and admin users
      // 2. Managers from teams that the checklist was assigned to
      // 3. Managers in the same team as users the checklist was assigned to

      const managerEmails = new Set();

      // Add all super_admins and admins
      allUsers.forEach(u => {
        if (u.role === 'super_admin' || u.role === 'admin') {
          managerEmails.add(u.email);
        }
      });

      // Add managers from assigned teams
      if (template.assigned_teams && template.assigned_teams.length > 0) {
        const assignedTeams = teams.filter(t => template.assigned_teams.includes(t.id));
        assignedTeams.forEach(team => {
          // Get managers from this team
          const teamManagers = allUsers.filter(u => 
            u.role === 'manager' && 
            team.member_emails?.includes(u.email)
          );
          teamManagers.forEach(m => managerEmails.add(m.email));
        });
      }

      // Add managers from same teams as assigned users
      if (template.assigned_to_emails && template.assigned_to_emails.length > 0) {
        const assignedUserEmails = template.assigned_to_emails;
        const relevantTeams = teams.filter(t => 
          t.member_emails?.some(email => assignedUserEmails.includes(email))
        );
        relevantTeams.forEach(team => {
          const teamManagers = allUsers.filter(u => 
            u.role === 'manager' && 
            team.member_emails?.includes(u.email)
          );
          teamManagers.forEach(m => managerEmails.add(m.email));
        });
      }

      // Create notifications for each manager
       const notifications = [];
       for (const managerEmail of managerEmails) {
         const manager = allUsers.find(u => u.email === managerEmail);
         if (manager) {
           // Get team info if available
           const managerTeams = teams.filter(t => t.member_emails?.includes(managerEmail));
           const teamId = managerTeams.length > 0 ? managerTeams[0].id : null;
           const teamName = managerTeams.length > 0 ? managerTeams[0].name : null;

           notifications.push({
             checklist_completion_id,
             checklist_title: completion.checklist_title,
             manager_email: manager.email,
             manager_name: manager.full_name,
             incomplete_items: incompleteItems,
             completed_by: completion.completed_by,
             completed_by_name: completion.completed_by_name,
             team_id: teamId,
             team_name: teamName,
             read: false
           });
         }
       }

      // Create notifications in database
      if (notifications.length > 0) {
        await base44.asServiceRole.entities.ChecklistNotification.bulkCreate(notifications);
      }
    }

    return Response.json({ success: true, notificationsCreated: incompleteItems.length > 0 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});