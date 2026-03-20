import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

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

  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const isUser = user?.role === 'user';
  const canManage = isSuperAdmin || isAdmin || isManager;

  // Initials: first letter of first_name + first letter of last_name
  const initials = user
    ? ((user.first_name?.[0] || '') + (user.last_name?.[0] || '')).toUpperCase() || user.full_name?.[0]?.toUpperCase() || '?'
    : '?';

  // Display name: prefer first+last, fall back to full_name
  const displayName = user
    ? (user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.full_name || '')
    : '';

  return { user, loading, isSuperAdmin, isAdmin, isManager, isUser, canManage, initials, displayName };
}