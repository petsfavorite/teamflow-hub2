import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { task_id, status } = body;
    if (!task_id || !status) {
      return Response.json({ error: 'task_id and status are required' }, { status: 400 });
    }
    if (!['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return Response.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Fetch the task (service role so we can read it regardless of RLS)
    const task = await base44.asServiceRole.entities.Task.get(task_id);
    if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

    // Authorization: creator, assigned by email, on an assigned team, or manager/admin
    const isCreator = task.created_by_id === user.id;
    const isAssignedByEmail = (task.assigned_to_emails || []).includes(user.email);
    const isManagerOrAdmin = ['manager', 'admin', 'super_admin'].includes(user.role);

    let isOnAssignedTeam = false;
    if (task.assigned_teams?.length) {
      const teams = await base44.asServiceRole.entities.Team.list();
      isOnAssignedTeam = task.assigned_teams.some(teamId => {
        const team = teams.find(t => t.id === teamId);
        return team?.member_emails?.includes(user.email);
      });
    }

    if (!isCreator && !isAssignedByEmail && !isOnAssignedTeam && !isManagerOrAdmin) {
      return Response.json({ error: 'You are not authorized to update this task' }, { status: 403 });
    }

    // Update the task status
    await base44.asServiceRole.entities.Task.update(task_id, { status });

    // Record history when closing a task
    if (status === 'completed' || status === 'cancelled') {
      const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email;
      await base44.asServiceRole.entities.TaskHistory.create({
        task_id: task.id,
        task_title: task.title,
        task_description: task.description || null,
        priority: task.priority || 'medium',
        due_date: task.due_date || null,
        assigned_to_emails: task.assigned_to_emails || [],
        assigned_to_names: task.assigned_to_names || [],
        assigned_teams: task.assigned_teams || [],
        outcome: status,
        closed_by: user.email,
        closed_by_name: displayName,
        closed_at: new Date().toISOString(),
        completion_notes: task.completion_notes || null,
      });
    }

    return Response.json({ ok: true, task_id, status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}