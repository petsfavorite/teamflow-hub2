import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useAccessSettings, canAccess } from '@/lib/accessControl';

export function useCurrentUser() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      try {
        const me = await base44.auth.me();
        setUser(me);
      } catch (e) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, []);

  // Live access-control settings. Falls back to factory defaults while loading
  // (see canAccess), so `can` is safe to use before the query resolves.
  const { data: accessSettings } = useAccessSettings();

  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const isUser = user?.role === 'user';
  const canManage = isSuperAdmin || isAdmin || isManager;

  // Permission check against the Access Control settings. Super Admin always
  // passes; everyone else is checked against the saved allowed_roles for the
  // action (with factory defaults as a fallback while settings load).
  const can = useCallback(
    (actionKey) => canAccess(accessSettings, actionKey, user?.role),
    [accessSettings, user?.role]
  );

  // Initials: first letter of first_name + first letter of last_name
  const initials = user
    ? ((user.first_name?.[0] || '') + (user.last_name?.[0] || '')).toUpperCase() || user.full_name?.[0]?.toUpperCase() || '?'
    : '?';

  // Display name: prefer first+last, fall back to full_name
  const displayName = user
    ? (user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.full_name || '')
    : '';

  return { user, loading, isSuperAdmin, isAdmin, isManager, isUser, canManage, can, initials, displayName };
}