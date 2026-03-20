import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Session must still be valid (we don't actually log out on inactivity)
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { pin } = await req.json();

    if (!pin || !/^\d{6}$/.test(pin)) {
      return Response.json({ valid: false, error: 'PIN must be exactly 6 digits' });
    }

    // Look up which user has this PIN using service role
    const users = await base44.asServiceRole.entities.User.filter({ pin });

    if (users.length === 0) {
      return Response.json({ valid: false });
    }

    const matched = users[0];
    return Response.json({
      valid: true,
      user: {
        id: matched.id,
        full_name: matched.full_name,
        email: matched.email,
        role: matched.role
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});