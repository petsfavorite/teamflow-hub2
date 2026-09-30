import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'super_admin') {
      return Response.json({ error: 'Only super admins can update all user timezones' }, { status: 403 });
    }
    const { timezone } = await req.json();
    if (!timezone || typeof timezone !== 'string') {
      return Response.json({ error: 'Timezone is required' }, { status: 400 });
    }
    const users = await base44.asServiceRole.entities.User.list();
    await Promise.all(users.map(u =>
      base44.asServiceRole.entities.User.update(u.id, { timezone })
    ));
    return Response.json({ success: true, count: users.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}