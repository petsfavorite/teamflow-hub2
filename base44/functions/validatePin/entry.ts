import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { pin } = await req.json();

    if (!pin || !/^\d{6}$/.test(pin)) {
      return Response.json({ valid: false, error: 'PIN must be exactly 6 digits' });
    }

    // Fetch the current user's full record to get their PIN and persisted lockout state
    const fullUser = await base44.asServiceRole.entities.User.get(user.id);

    // Check server-side lockout — persisted in the User entity so it survives across isolates
    const lockedUntilStr = fullUser?.pin_locked_until;
    if (lockedUntilStr) {
      const lockedUntil = new Date(lockedUntilStr).getTime();
      if (lockedUntil > Date.now()) {
        const remainingSec = Math.ceil((lockedUntil - Date.now()) / 1000);
        return Response.json({
          valid: false,
          error: `Too many failed attempts. Try again in ${remainingSec} seconds.`
        });
      }
    }

    const attemptStart = Date.now();
    const storedPin = fullUser?.pin || '';
    const pinMatches = storedPin.length === 6 && timingSafeEqual(storedPin, pin);

    if (!pinMatches) {
      // Track failed attempt — persisted in User entity so lockout survives across isolates
      const currentCount = (fullUser?.pin_failed_attempts || 0) + 1;
      const updates: Record<string, unknown> = {};
      if (currentCount >= MAX_ATTEMPTS) {
        updates.pin_failed_attempts = 0;
        updates.pin_locked_until = new Date(Date.now() + LOCKOUT_MS).toISOString();
      } else {
        updates.pin_failed_attempts = currentCount;
      }
      await base44.asServiceRole.entities.User.update(user.id, updates);

      const elapsed = Date.now() - attemptStart;
      const minDelay = 1500;
      if (elapsed < minDelay) {
        await new Promise(r => setTimeout(r, minDelay - elapsed));
      }
      return Response.json({ valid: false });
    }

    // Success — clear attempts and lockout
    if (fullUser?.pin_failed_attempts || fullUser?.pin_locked_until) {
      await base44.asServiceRole.entities.User.update(user.id, {
        pin_failed_attempts: 0,
        pin_locked_until: '',
      });
    }

    return Response.json({
      valid: true,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});