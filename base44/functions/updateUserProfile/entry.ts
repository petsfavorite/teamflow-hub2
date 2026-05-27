import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'super_admin', 'manager'].includes(user.role)) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { userId, role, pin, team_ids, first_name, last_name } = await req.json();

    const targetUser = await base44.asServiceRole.entities.User.get(userId);
    if (!targetUser) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    const targetRole = targetUser?.role || 'user';

    // Build update payload
    const updates = {};

    // Name changes — admins+ only, cannot rename other admins/super_admins
    if (first_name !== undefined || last_name !== undefined) {
      if (user.role === 'admin' && ['admin', 'super_admin'].includes(targetRole)) {
        return Response.json({ error: 'Cannot rename other admins or super admins' }, { status: 403 });
      }
      if (first_name !== undefined) updates.first_name = first_name.trim();
      if (last_name !== undefined) updates.last_name = last_name.trim();
      updates.full_name = `${(first_name || '').trim()} ${(last_name || '').trim()}`.trim();
    }

    // Role changes — admins+ only
    if (role !== undefined) {
      if (!['admin', 'super_admin'].includes(user.role)) {
        return Response.json({ error: 'Only admins can change roles' }, { status: 403 });
      }
      if (user.role === 'admin' && role === 'super_admin') {
        return Response.json({ error: 'Admins cannot assign super_admin role' }, { status: 403 });
      }
      updates.role = role;
    }

    // PIN changes — managers+ can update
    if (pin !== undefined) {
      updates.pin = pin || null;
    }

    // Team changes — managers+ can update
    if (team_ids !== undefined) {
      updates.team_ids = team_ids;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ success: true, message: 'No changes' });
    }

    await base44.asServiceRole.entities.User.update(userId, updates);

    // Recompute initials if name changed
    if (updates.full_name) {
      await base44.functions.invoke('computeUserInitials', { user_id: userId });

      // Also update the user's name in all Team.member_names arrays
      const existingTeamIds = targetUser.team_ids || [];
      if (existingTeamIds.length > 0 && team_ids === undefined) {
        const allTeams = await base44.asServiceRole.entities.Team.list('name', 500);
        await Promise.all(allTeams.filter(t => existingTeamIds.includes(t.id)).map(async (team) => {
          const idx = (team.member_emails || []).indexOf(targetUser.email);
          if (idx >= 0) {
            const newNames = [...(team.member_names || [])];
            newNames[idx] = updates.full_name;
            await base44.asServiceRole.entities.Team.update(team.id, { member_names: newNames });
          }
        }));
      }
    }

    // Sync Team.member_emails / member_names whenever team assignments change
    if (team_ids !== undefined) {
      const userEmail = updates.full_name
        ? (targetUser.email)
        : targetUser.email;
      const userName = updates.full_name || targetUser.full_name || targetUser.email || '';

      // Fetch all teams
      const allTeams = await base44.asServiceRole.entities.Team.list('name', 500);

      await Promise.all(allTeams.map(async (team) => {
        const shouldBeMember = team_ids.includes(team.id);
        const isMember = (team.member_emails || []).includes(userEmail);

        if (shouldBeMember && !isMember) {
          // Add user to team
          const newEmails = [...(team.member_emails || []), userEmail];
          const newNames = [...(team.member_names || []), userName];
          await base44.asServiceRole.entities.Team.update(team.id, {
            member_emails: newEmails,
            member_names: newNames,
          });
        } else if (!shouldBeMember && isMember) {
          // Remove user from team
          const idx = (team.member_emails || []).indexOf(userEmail);
          const newEmails = (team.member_emails || []).filter(e => e !== userEmail);
          const newNames = (team.member_names || []).filter((_, i) => i !== idx);
          await base44.asServiceRole.entities.Team.update(team.id, {
            member_emails: newEmails,
            member_names: newNames,
          });
        }
      }));
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});