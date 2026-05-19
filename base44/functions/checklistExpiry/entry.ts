import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    // Get all active checklists
    const activeChecklists = await base44.asServiceRole.entities.ChecklistTemplate.filter({ status: 'active' });

    for (const checklist of activeChecklists) {
      const dueTime = checklist.due_time || '21:00';
      
      // Skip checklists with no due date (e.g. template checklists)
      if (!checklist.due_date) continue;

      // Check if checklist has expired
      if (checklist.due_date < today || (checklist.due_date === today && currentTime >= dueTime)) {
        // Archive the checklist
        await base44.asServiceRole.entities.ChecklistTemplate.update(checklist.id, { status: 'archived' });

        // Find incomplete items in the latest completion
        const completions = await base44.asServiceRole.entities.ChecklistCompletion.filter({
          checklist_template_id: checklist.id,
          status: 'in_progress'
        });

        if (completions.length > 0) {
          const completion = completions[0];
          const incompleteItems = (completion.completed_items || []).filter(item => !item.checked);

          if (incompleteItems.length > 0) {
            // Get managers from assigned teams
            const managers = new Set();
            const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
            const superAdmins = await base44.asServiceRole.entities.User.filter({ role: 'super_admin' });

            if (checklist.assigned_teams?.length > 0) {
              const teams = await base44.asServiceRole.entities.Team.filter({ id: { $in: checklist.assigned_teams } });
              for (const team of teams) {
                // Get managers from this team
                const teamMembers = await base44.asServiceRole.entities.User.filter({
                  email: { $in: team.member_emails || [] },
                  role: 'manager'
                });
                teamMembers.forEach(m => managers.add(m.email));
              }
            }

            // Notify all managers and admins
            const notifyList = [
              ...Array.from(managers),
              ...admins.map(a => a.email),
              ...superAdmins.map(a => a.email)
            ];

            for (const email of notifyList) {
              const user = await base44.asServiceRole.entities.User.filter({ email });
              if (user.length > 0) {
                await base44.asServiceRole.entities.ChecklistNotification.create({
                  checklist_completion_id: completion.id,
                  checklist_title: checklist.title,
                  manager_email: email,
                  manager_name: user[0].full_name,
                  incomplete_items: incompleteItems,
                  completed_by: completion.completed_by,
                  completed_by_name: completion.completed_by_name,
                  team_id: checklist.assigned_teams?.[0],
                  team_name: 'Unknown'
                });
              }
            }
          }
        }
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});