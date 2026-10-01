import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { timingSafeEqual, hashPin, verifyPin, isPinHashed } from '../../shared/crypto.ts';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

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

    // Handle both hashed PINs (new) and legacy plaintext PINs (upgraded on success)
    let pinMatches: boolean;
    let upgradeToHash: string | null = null;
    if (isPinHashed(storedPin)) {
      pinMatches = await verifyPin(pin, user.email, storedPin);
    } else {
      pinMatches = storedPin.length === 6 && timingSafeEqual(storedPin, pin);
      if (pinMatches) {
        // Upgrade legacy plaintext PIN to hashed form
        upgradeToHash = await hashPin(pin, user.email);
      }
    }

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

    // Success — clear attempts, lockout, server-side session lock, and upgrade PIN to hash if needed
    const successUpdates: Record<string, unknown> = {
      pin_failed_attempts: 0,
      pin_locked_until: '',
      session_locked_at: '',
    };
    if (upgradeToHash) {
      successUpdates.pin = upgradeToHash;
    }
    await base44.asServiceRole.entities.User.update(user.id, successUpdates);

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