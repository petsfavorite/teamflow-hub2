import { hashPin, isPinHashed, timingSafeEqual } from './crypto.ts';

// PINs are stored as PBKDF2 hashes salted with each owner's email, so two users
// with the same PIN hold different hashes and we can't simply filter on the raw
// value. To enforce uniqueness we re-derive the candidate PIN's hash under each
// existing owner's salt and compare in constant time.
//
// Checks both registered users and pending invites (reserved PINs for users who
// have not accepted their invitation yet). Returns the owner record if the PIN
// is already taken, or null if it is available.
export async function findPinOwner(base44, pin: string, excludeEmail?: string) {
  // Registered users
  const users = await base44.asServiceRole.entities.User.list('first_name', 5000);
  const userCandidates = users.filter(u => u.pin && (!excludeEmail || u.email !== excludeEmail));
  const userResults = await Promise.all(userCandidates.map(async (u) => {
    const stored = u.pin;
    const matches = isPinHashed(stored)
      ? timingSafeEqual(await hashPin(pin, u.email), stored)
      : (stored.length === 6 && timingSafeEqual(stored, pin));
    return matches ? { email: u.email, name: u.full_name || u.email, kind: 'user' as const } : null;
  }));
  const userHit = userResults.find(Boolean);
  if (userHit) return userHit;

  // Pending invites (reserved PINs for not-yet-accepted users)
  try {
    const invites = await base44.asServiceRole.entities.PendingInvite.list('-created_date', 500);
    const inviteCandidates = invites.filter(i => i.pin && (!excludeEmail || i.email !== excludeEmail));
    const inviteResults = await Promise.all(inviteCandidates.map(async (inv) => {
      const stored = inv.pin;
      const matches = isPinHashed(stored)
        ? timingSafeEqual(await hashPin(pin, inv.email), stored)
        : (stored.length === 6 && timingSafeEqual(stored, pin));
      return matches ? { email: inv.email, name: inv.first_name || inv.email, kind: 'invite' as const } : null;
    }));
    const inviteHit = inviteResults.find(Boolean);
    if (inviteHit) return inviteHit;
  } catch {
    // PendingInvite entity may not exist — ignore
  }

  return null;
}