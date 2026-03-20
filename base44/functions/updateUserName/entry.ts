import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'super_admin', 'manager'].includes(user.role)) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { userId, full_name } = await req.json();

    // Fetch the target user to check their role
    const targetUser = await base44.asServiceRole.entities.User.get(userId);
    const targetRole = targetUser?.role || 'user';

    // Admins can only rename non-admin users (user, manager)
    if (user.role === 'admin' && ['admin', 'super_admin'].includes(targetRole)) {
      return Response.json({ error: 'Admins cannot rename other admins or super admins' }, { status: 403 });
    }
    // Managers cannot rename anyone (only admins+ can)
    if (user.role === 'manager') {
      return Response.json({ error: 'Managers cannot rename users' }, { status: 403 });
    }

    await base44.asServiceRole.entities.User.update(userId, { full_name });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});