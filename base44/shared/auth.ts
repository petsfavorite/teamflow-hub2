// Shared auth helpers for backend functions.
// Usage: const user = await requireAdmin(base44); // returns user or throws (sends 401/403 Response)

export async function requireAdmin(base44) {
  const user = await base44.auth.me().catch(() => null);
  if (!user) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }), user: null };
  }
  if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'manager') {
    return { error: Response.json({ error: 'Forbidden' }, { status: 403 }), user: null };
  }
  return { error: null, user };
}

export async function requireUser(base44) {
  const user = await base44.auth.me().catch(() => null);
  if (!user) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }), user: null };
  }
  return { error: null, user };
}