import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { user_id } = await req.json();

    if (!user_id) {
      return Response.json({ error: 'user_id required' }, { status: 400 });
    }

    // Get the user being updated
    const targetUser = await base44.asServiceRole.entities.User.get(user_id);
    if (!targetUser) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const firstName = targetUser.first_name || '';
    const lastName = targetUser.last_name || '';
    const baseInitials = (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();

    // Get all users
    const allUsers = await base44.asServiceRole.entities.User.list('created_date', 500);

    // Find all users with the same initials
    const usersWithSameInitials = allUsers.filter(u => {
      if (u.id === user_id) return true; // Include the target user
      const uFirst = u.first_name || '';
      const uLast = u.last_name || '';
      const uInitials = (uFirst.charAt(0) + uLast.charAt(0)).toUpperCase();
      return uInitials === baseInitials;
    });

    // Sort by created_date to determine version numbers
    usersWithSameInitials.sort((a, b) => {
      const dateA = new Date(a.created_date || 0);
      const dateB = new Date(b.created_date || 0);
      return dateA - dateB;
    });

    // Find the version number for the target user
    const targetIndex = usersWithSameInitials.findIndex(u => u.id === user_id);
    const version = targetIndex + 1;
    const initials = `${baseInitials}${version}`;

    // Update the user with their initials
    await base44.asServiceRole.entities.User.update(user_id, { initials });

    return Response.json({ initials, version });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});