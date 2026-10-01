import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Lets any authenticated user update their OWN first name and last name.
// base44.auth.updateMe cannot override the built-in full_name field, so this
// function writes first_name, last_name, and the derived full_name together
// using the service role. Also recomputes initials so the new name shows
// everywhere immediately.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { first_name, last_name } = await req.json();
    if (!first_name?.trim() || !last_name?.trim()) {
      return Response.json({ error: 'First name and last name are required' }, { status: 400 });
    }

    const fullName = `${first_name.trim()} ${last_name.trim()}`.trim();
    await base44.asServiceRole.entities.User.update(user.id, {
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      full_name: fullName,
    });

    // Recompute initials so the new name is reflected everywhere
    await base44.functions.invoke('computeUserInitials', { user_id: user.id });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});