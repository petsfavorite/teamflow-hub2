import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allowedRoles = ['admin', 'super_admin', 'manager'];
  if (!allowedRoles.includes(user.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const users = await base44.asServiceRole.entities.User.list('full_name', 5000);

  // Strip PIN from response for managers — only admins/super_admins can see PINs
  const canSeePins = user.role === 'admin' || user.role === 'super_admin';
  const safeUsers = users.map(u => {
    if (canSeePins) return u;
    const { pin, ...rest } = u;
    return rest;
  });

  return Response.json({ users: safeUsers });
});