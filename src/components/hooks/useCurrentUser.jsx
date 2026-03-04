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

  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin' || isSuperAdmin;
  const isManager = user?.role === 'manager';
  const isUser = user?.role === 'user';
  const canManage = isAdmin || isManager;

  return { user, loading, isSuperAdmin, isAdmin, isManager, isUser, canManage };
}