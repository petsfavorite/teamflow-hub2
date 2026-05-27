import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Admin-only utility: rebuilds all Team.member_emails/member_names from User.team_ids
// This is a one-time fix to correct any stale team membership data.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Load all users and all teams
    const allUsers = await base44.asServiceRole.entities.User.list('email', 500);
    const allTeams = await base44.asServiceRole.entities.Team.list('name', 500);

    // Build a map: teamId -> { emails: [], names: [] }
    const teamMemberMap = {};
    for (const team of allTeams) {
      teamMemberMap[team.id] = { emails: [], names: [] };
    }

    for (const u of allUsers) {
      const teamIds = u.team_ids || [];
      for (const teamId of teamIds) {
        if (teamMemberMap[teamId]) {
          teamMemberMap[teamId].emails.push(u.email);
          teamMemberMap[teamId].names.push(u.full_name || u.email || '');
        }
      }
    }

    // Update each team
    let updated = 0;
    await Promise.all(allTeams.map(async (team) => {
      const newEmails = teamMemberMap[team.id]?.emails || [];
      const newNames = teamMemberMap[team.id]?.names || [];

      const emailsMatch = JSON.stringify([...(team.member_emails || [])].sort()) === JSON.stringify([...newEmails].sort());
      if (!emailsMatch) {
        await base44.asServiceRole.entities.Team.update(team.id, {
          member_emails: newEmails,
          member_names: newNames,
        });
        updated++;
      }
    }));

    return Response.json({ success: true, teams_updated: updated, total_teams: allTeams.length, total_users: allUsers.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});