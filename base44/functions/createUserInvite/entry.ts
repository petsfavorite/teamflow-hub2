import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { hashPin } from '../../shared/crypto.ts';

// Secure invite flow — replaces frontend PendingInvite creation.
// Only admins/super_admins can call this. Validates email, generates a PIN,
// hashes it before storing, sends platform invite + welcome email (no PIN in email).
// The plaintext PIN is returned once so the admin can share it via a secure channel.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { email, firstName, lastName, pin, role, team_ids } = await req.json();

    // Prevent admins from inviting super_admins — mirrors updateUserProfile's rule
    if (role === 'super_admin' && user.role !== 'super_admin') {
      return Response.json({ error: 'Only super admins can invite super admins' }, { status: 403 });
    }

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return Response.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Generate or validate 6-digit PIN
    let finalPin = pin;
    if (!finalPin) {
      const randVal = crypto.getRandomValues(new Uint32Array(1))[0];
      finalPin = (100000 + (randVal % 900000)).toString();
    }
    if (!/^\d{6}$/.test(finalPin)) {
      return Response.json({ error: 'PIN must be exactly 6 digits' }, { status: 400 });
    }

    // Hash the PIN before storing — never store or transmit plaintext PINs
    const pinHash = await hashPin(finalPin, email);

    // Check for duplicate PendingInvite — update if exists, create if not
    const existing = await base44.asServiceRole.entities.PendingInvite.filter({ email });
    const inviteData = {
      email,
      first_name: firstName || '',
      last_name: lastName || '',
      role: role || 'user',
      pin: pinHash,
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

    // Send welcome email WITHOUT the PIN — admin shares the PIN via a secure channel
    try {
      await base44.integrations.Core.SendEmail({
        to: email,
        subject: "You're invited to join our team!",
        body: `Hello${firstName ? ' ' + firstName : ''},\n\nYou've been invited to join our team. Please contact your manager to receive your session PIN and complete your setup.\n\nWelcome aboard!`,
        from_name: "Pet's Favorite Hub",
      });
    } catch (_emailErr) {
      // Email may fail if user not yet in system — that's OK
    }

    // Return the plaintext PIN to the admin so they can share it once
    return Response.json({ success: true, pin: finalPin });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});