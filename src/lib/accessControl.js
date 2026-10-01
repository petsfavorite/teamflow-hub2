import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export const ACCESS_ROLES = ['user', 'manager', 'admin', 'super_admin'];
export const SUPER_ADMIN = 'super_admin';

export const ROLE_LABELS = {
  user: 'User',
  manager: 'Manager',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

export function useAccessSettings() {
  return useQuery({
    queryKey: ['access-control-settings'],
    queryFn: async () => {
      const { items } = await base44.entities.AccessControlSetting.filter({}, { limit: 500 });
      return items;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function canAccess(settings, actionKey, userRole) {
  if (userRole === SUPER_ADMIN) return true;
  if (!settings) return false;
  const setting = settings.find(s => s.action_key === actionKey);
  if (!setting) return false;
  return (setting.allowed_roles || []).includes(userRole);
}