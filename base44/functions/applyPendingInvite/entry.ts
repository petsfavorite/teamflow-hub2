import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Called right after a user logs in. If there is a PendingInvite for this
// user's email (created when an admin invited them), it applies the invite's
// role / team_ids / pin to the actual user record, syncs team memberships, and
// deletes the PendingInvite so it no longer shows as a "Pending User".
//
// This makes email invites and Google SSO logins merge into one user: whoever
// accepts the invite (by any login method) gets the access the admin intended,
// and the pending card disappears.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ applied: false });

    const pending = await base44.asServiceRole.entities.PendingInvite.filter({ email: user.email });
    if (!pending || pending.length === 0) {
      return Response.json({ applied: false });
    }
    const invite = pending[0];

    const updates = {};
    if (invite.role) updates.role = invite.role;
    if (invite.pin) updates.pin = invite.pin;
    if (invite.team_ids && invite.team_ids.length) updates.team_ids = invite.team_ids;

    // Only fill in the name from the invite if the user has none yet (e.g. they
    // joined via Google but their profile name didn't populate).
    const hasName = (user.full_name && user.full_name.trim()) || (user.first_name && user.first_name.trim());
    if (!hasName && (invite.first_name || invite.last_name)) {
      updates.first_name = invite.first_name || '';
      updates.last_name = invite.last_name || '';
      updates.full_name = `${invite.first_name || ''} ${invite.last_name || ''}`.trim();
    }

    if (Object.keys(updates).length > 0) {
      await base44.asServiceRole.entities.User.update(user.id, updates);
    }

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

    // Consume the invite so it stops showing as "Pending User".
    await base44.asServiceRole.entities.PendingInvite.delete(invite.id);

    return Response.json({ applied: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});