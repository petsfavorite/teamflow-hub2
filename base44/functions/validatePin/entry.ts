import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// In-memory attempt tracking (per user, resets on success or lockout expiry)
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();
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

    // Session must still be valid (we don't actually log out on inactivity)
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { pin } = await req.json();

    if (!pin || !/^\d{6}$/.test(pin)) {
      return Response.json({ valid: false, error: 'PIN must be exactly 6 digits' });
    }

    // Check server-side lockout
    const attemptState = failedAttempts.get(user.id);
    if (attemptState && attemptState.lockedUntil > Date.now()) {
      const remainingSec = Math.ceil((attemptState.lockedUntil - Date.now()) / 1000);
      return Response.json({
        valid: false,
        error: `Too many failed attempts. Try again in ${remainingSec} seconds.`
      });
    }

    const attemptStart = Date.now();

    // Only check the PIN against the current session user's own PIN
    const fullUser = await base44.asServiceRole.entities.User.get(user.id);
    const storedPin = fullUser?.pin || '';
    const pinMatches = storedPin.length === 6 && timingSafeEqual(storedPin, pin);

    if (!pinMatches) {
      // Track failed attempt with server-side lockout
      const current = failedAttempts.get(user.id) || { count: 0, lockedUntil: 0 };
      current.count += 1;
      if (current.count >= MAX_ATTEMPTS) {
        current.lockedUntil = Date.now() + LOCKOUT_MS;
        current.count = 0;
      }
      failedAttempts.set(user.id, current);

      const elapsed = Date.now() - attemptStart;
      const minDelay = 1500;
      if (elapsed < minDelay) {
        await new Promise(r => setTimeout(r, minDelay - elapsed));
      }
      return Response.json({ valid: false });
    }

    // Success — clear attempts
    failedAttempts.delete(user.id);

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