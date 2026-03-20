import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get all tasks and checklists
    const [tasks, checklists, teams, allUsers] = await Promise.all([
      base44.asServiceRole.entities.Task.list(),
      base44.asServiceRole.entities.ChecklistTemplate.list(),
      base44.asServiceRole.entities.Team.list(),
      base44.asServiceRole.entities.User.list()
    ]);

    const today = new Date().toISOString().split('T')[0];
    const overdueTasks = tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'completed' && t.status !== 'cancelled');
    const overdueChecklists = checklists.filter(c => c.due_date && c.due_date < today && c.status !== 'completed');

    // Get managers and admins
    const managersAndAdmins = allUsers.filter(u => ['manager', 'admin', 'super_admin'].includes(u.role));
    
    // Build map of team members for faster lookup
    const teamMemberMap = {};
    teams.forEach(t => {
      if (t.member_emails) {
        t.member_emails.forEach(email => {
          if (!teamMemberMap[email]) teamMemberMap[email] = [];
          teamMemberMap[email].push(t.id);
        });
      }
    });

    // Send notifications to managers/admins
    for (const manager of managersAndAdmins) {
      const managerTeamIds = teams.filter(t => t.member_emails?.includes(manager.email)).map(t => t.id);
      
      // Find overdue items assigned to this manager or their teams
      const relevantTasks = overdueTasks.filter(t => {
        const assignedToMe = t.assigned_to_emails?.includes(manager.email);
        const assignedToMyTeam = t.assigned_teams?.some(tid => managerTeamIds.includes(tid));
        return assignedToMe || assignedToMyTeam;
      });

      const relevantChecklists = overdueChecklists.filter(c => {
        const assignedToMe = c.assigned_to_emails?.includes(manager.email);
        const assignedToMyTeam = c.assigned_teams?.some(tid => managerTeamIds.includes(tid));
        return assignedToMe || assignedToMyTeam;
      });

      if (relevantTasks.length === 0 && relevantChecklists.length === 0) continue;

      const taskList = relevantTasks.map(t => `• ${t.title} (Due: ${t.due_date})`).join('\n');
      const checklistList = relevantChecklists.map(c => `• ${c.title} (Due: ${c.due_date})`).join('\n');

      const body = `
Overdue Items Report

${relevantTasks.length > 0 ? `Overdue Tasks:\n${taskList}\n\n` : ''}${relevantChecklists.length > 0 ? `Overdue Checklists:\n${checklistList}\n\n` : ''}Please follow up with the assigned team members.
      `;

      await base44.integrations.Core.SendEmail({
        to: manager.email,
        subject: `Overdue Items: ${relevantTasks.length} tasks, ${relevantChecklists.length} checklists`,
        body
      });
    }

    return Response.json({ 
      success: true, 
      message: `Notifications sent to ${managersAndAdmins.length} managers/admins` 
    });
  } catch (error) {
    console.error('Error notifying overdue items:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});