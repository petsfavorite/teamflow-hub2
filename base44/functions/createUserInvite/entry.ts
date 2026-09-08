import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Secure invite flow — replaces frontend PendingInvite creation.
// Only admins/super_admins can call this. Validates email, checks for
// duplicate invites, ensures PIN uniqueness, sends platform invite + email.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { email, firstName, lastName, pin, role, team_ids } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return Response.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Generate or validate PIN, ensure uniqueness across Users and PendingInvites
    let finalPin = pin;
    if (!finalPin) {
      // Auto-generate a unique 6-digit PIN
      const [allUsers, allInvites] = await Promise.all([
        base44.asServiceRole.entities.User.list('created_date', 5000),
        base44.asServiceRole.entities.PendingInvite.list('-created_date', 500),
      ]);
      const existingPins = new Set([
        ...allUsers.map(u => u.pin).filter(Boolean),
        ...allInvites.map(i => i.pin).filter(Boolean),
      ]);
      let attempts = 0;
      do {
        finalPin = Math.floor(100000 + Math.random() * 900000).toString();
        attempts++;
      } while (existingPins.has(finalPin) && attempts < 100);
      if (existingPins.has(finalPin)) {
        return Response.json({ error: 'Could not generate unique PIN' }, { status: 500 });
      }
    } else {
      // Validate provided PIN is unique (exclude this email's own records)
      const [pinUsers, pinInvites] = await Promise.all([
        base44.asServiceRole.entities.User.filter({ pin: finalPin }),
        base44.asServiceRole.entities.PendingInvite.filter({ pin: finalPin }),
      ]);
      const conflict = pinUsers.some(u => u.email !== email) || pinInvites.some(i => i.email !== email);
      if (conflict) {
        return Response.json({ error: 'PIN already in use by another user' }, { status: 400 });
      }
    }

    // Check for duplicate PendingInvite — update if exists, create if not
    const existing = await base44.asServiceRole.entities.PendingInvite.filter({ email });
    const inviteData = {
      email,
      first_name: firstName || '',
      last_name: lastName || '',
      role: role || 'user',
      pin: finalPin,
      team_ids: team_ids || [],
      invited_by: user.email,
      invited_by_name: user.full_name || user.email,
      last_sent_at: new Date().toISOString(),
    };

    if (existing.length > 0) {
      await base44.asServiceRole.entities.PendingInvite.update(existing[0].id, inviteData);
    } else {
      await base44.asServiceRole.entities.PendingInvite.create(inviteData);
    }

    // Try platform invite — don't block if it fails (user may already exist)
    const platformRole = ['admin', 'super_admin'].includes(role) ? 'admin' : 'user';
    try {
      await base44.users.inviteUser(email, platformRole);
    } catch (_platformErr) {
      // User may already exist on the platform — that's OK
    }

    // Send custom email with PIN
    try {
      await base44.integrations.Core.SendEmail({
        to: email,
        subject: "You're invited to join our team!",
        body: `Hello${firstName ? ' ' + firstName : ''},\n\nYou've been invited to join our team. Here are your login details:\n\nEmail: ${email}\nPIN: ${finalPin}\n\nPlease use these credentials to access the application.\n\nWelcome aboard!`,
        from_name: "Pet's Favorite Hub",
      });
    } catch (_emailErr) {
      // Email may fail if user not yet in system — that's OK
    }

    return Response.json({ success: true, pin: finalPin });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});