import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Called right after a user logs in. It does two things:
// 1. If a PendingInvite exists for this user's email (created when an admin
//    invited them), apply the invite's role / team_ids / pin to the actual user
//    record, mark the user as `invited`, sync team memberships, and delete the
//    PendingInvite so it no longer shows as a "Pending User".
// 2. Decide whether this login is authorized: only users who were invited
//    (invited flag set, or a pending invite just consumed) or admins may
//    access the app. Anyone who self-registered (e.g. via Google with an
//    uninvited email) is denied.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ applied: false, authorized: false });

    const pending = await base44.asServiceRole.entities.PendingInvite.filter({ email: user.email });
    const invite = pending && pending.length > 0 ? pending[0] : null;

    // Admins/super_admins are always authorized (safety net so they can't lock
    // themselves out).
    const adminBypass = user.role === 'admin' || user.role === 'super_admin';

    if (invite) {
      const updates = { invited: true };
      if (invite.role) updates.role = invite.role;
      if (invite.pin) updates.pin = invite.pin;
      if (invite.team_ids && invite.team_ids.length) updates.team_ids = invite.team_ids;

      // Only fill in the name from the invite if the user has none yet.
      const hasName = (user.full_name && user.full_name.trim()) || (user.first_name && user.first_name.trim());
      if (!hasName && (invite.first_name || invite.last_name)) {
        updates.first_name = invite.first_name || '';
        updates.last_name = invite.last_name || '';
        updates.full_name = `${invite.first_name || ''} ${invite.last_name || ''}`.trim();
      }

      await base44.asServiceRole.entities.User.update(user.id, updates);

      // Add the user to each assigned team's member roster.
      if (invite.team_ids && invite.team_ids.length) {
        const allTeams = await base44.asServiceRole.entities.Team.list('name', 500);
        const userName = updates.full_name || user.full_name || user.email;
        await Promise.all(allTeams.map(async (team) => {
          if (invite.team_ids.includes(team.id) && !(team.member_emails || []).includes(user.email)) {
            await base44.asServiceRole.entities.Team.update(team.id, {
              member_emails: [...(team.member_emails || []), user.email],
              member_names: [...(team.member_names || []), userName],
            });
          }
        }));
      }

      await base44.asServiceRole.entities.PendingInvite.delete(invite.id);
      return Response.json({ applied: true, authorized: true });
    }

    // No pending invite: authorized only if already marked invited or admin.
    const authorized = adminBypass || user.invited === true;
    return Response.json({ applied: false, authorized });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});