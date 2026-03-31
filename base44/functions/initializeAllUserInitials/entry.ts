import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'super_admin') {
      return Response.json({ error: 'Super admin access required' }, { status: 403 });
    }

    // Get all users
    const allUsers = await base44.asServiceRole.entities.User.list('created_date', 500);
    let updated = 0;

    for (const u of allUsers) {
      if (!u.first_name || !u.last_name) continue;

      const firstName = u.first_name || '';
      const lastName = u.last_name || '';
      const baseInitials = (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();

      // Find all users with the same initials
      const usersWithSameInitials = allUsers.filter(candidate => {
        const cFirst = candidate.first_name || '';
        const cLast = candidate.last_name || '';
        const cInitials = (cFirst.charAt(0) + cLast.charAt(0)).toUpperCase();
        return cInitials === baseInitials;
      }).sort((a, b) => {
        const dateA = new Date(a.created_date || 0);
        const dateB = new Date(b.created_date || 0);
        return dateA - dateB;
      });

      const version = usersWithSameInitials.findIndex(candidate => candidate.id === u.id) + 1;
      const initials = `${baseInitials}${version}`;

      if (u.initials !== initials) {
        await base44.asServiceRole.entities.User.update(u.id, { initials });
        updated++;
      }
    }

    return Response.json({ success: true, updated, total: allUsers.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});