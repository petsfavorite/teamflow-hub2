import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { requireUser } from '../../shared/auth.ts';

const MAX_LOCK_MINUTES = 60;

// Server-side gate for the PIN session lock.
// 'lock' sets session_locked_at; 'check' reads it and auto-clears if expired.
// The client can never clear session_locked_at directly — only validatePin (correct PIN)
// or this function's auto-expiry can clear it.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { error, user } = await requireUser(base44);
    if (error) return error;

    const body = await req.json();
    const action = body?.action;

    if (action === 'lock') {
      const now = new Date().toISOString();
      await base44.asServiceRole.entities.User.update(user.id, { session_locked_at: now });
      return Response.json({ success: true, lockedAt: now });
    }

    if (action === 'check') {
      const fullUser = await base44.asServiceRole.entities.User.get(user.id);
      const lockedAtStr = fullUser?.session_locked_at;
      if (!lockedAtStr) {
        return Response.json({ locked: false });
      }
      const lockedAt = new Date(lockedAtStr).getTime();
      const elapsedMin = (Date.now() - lockedAt) / 60000;
      if (elapsedMin >= MAX_LOCK_MINUTES) {
        await base44.asServiceRole.entities.User.update(user.id, { session_locked_at: '' });
        return Response.json({ locked: false, expired: true });
      }
      return Response.json({ locked: true, lockedAt: lockedAtStr });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});