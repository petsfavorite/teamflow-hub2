import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';

export const ACCESS_ROLES = ['user', 'manager', 'admin', 'super_admin'];
export const SUPER_ADMIN = 'super_admin';

export const ROLE_LABELS = {
  user: 'User',
  manager: 'Manager',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

// Factory defaults — mirror the seeded AccessControlSetting records. Used as a
// fallback while the settings query is still loading (so the app never locks
// everyone out on first paint) and as the baseline an admin's changes override.
export const DEFAULT_PERMISSIONS = {
  'sop.create': ['admin', 'super_admin'],
  'sop.update': ['admin', 'super_admin'],
  'sop.delete': ['admin', 'super_admin'],
  'sop.submit_review': ['manager', 'admin', 'super_admin'],
  'sop.approve': ['admin', 'super_admin'],
  'sop.verify': ['manager', 'admin', 'super_admin'],
  'sop.archive': ['admin', 'super_admin'],
  'checklist.create': ['manager', 'admin', 'super_admin'],
  'checklist.update': ['manager', 'admin', 'super_admin'],
  'checklist.delete': ['manager', 'admin', 'super_admin'],
  'checklist.publish': ['admin', 'super_admin'],
  'checklist.verify': ['manager', 'admin', 'super_admin'],
  'checklist.send_back': ['admin', 'super_admin'],
  'task.create': ['manager', 'admin', 'super_admin'],
  'task.update': ['manager', 'admin', 'super_admin'],
  'task.delete': ['manager', 'admin', 'super_admin'],
  'pet.create': ['user', 'manager', 'admin', 'super_admin'],
  'pet.update': ['user', 'manager', 'admin', 'super_admin'],
  'pet.delete': ['manager', 'admin', 'super_admin'],
  'visit.create': ['user', 'manager', 'admin', 'super_admin'],
  'visit.update': ['user', 'manager', 'admin', 'super_admin'],
  'visit.delete': ['manager', 'admin', 'super_admin'],
  'visit.checkout': ['user', 'manager', 'admin', 'super_admin'],
  'maintenance.create': ['user', 'manager', 'admin', 'super_admin'],
  'maintenance.update': ['user', 'manager', 'admin', 'super_admin'],
  'maintenance.delete': ['manager', 'admin', 'super_admin'],
  'asset.create': ['manager', 'admin', 'super_admin'],
  'asset.update': ['manager', 'admin', 'super_admin'],
  'asset.delete': ['manager', 'admin', 'super_admin'],
  'team.create': ['manager', 'admin', 'super_admin'],
  'team.update': ['manager', 'admin', 'super_admin'],
  'team.delete': ['manager', 'admin', 'super_admin'],
  'tag.create': ['manager', 'admin', 'super_admin'],
  'tag.update': ['manager', 'admin', 'super_admin'],
  'tag.delete': ['manager', 'admin', 'super_admin'],
  'link.create': ['manager', 'admin', 'super_admin'],
  'link.update': ['manager', 'admin', 'super_admin'],
  'link.delete': ['manager', 'admin', 'super_admin'],
  'manual.create': ['admin', 'super_admin'],
  'manual.update': ['admin', 'super_admin'],
  'manual.delete': ['admin', 'super_admin'],
  'incident.create': ['user', 'manager', 'admin', 'super_admin'],
  'incident.update': ['manager', 'admin', 'super_admin'],
  'incident.delete': ['manager', 'admin', 'super_admin'],
  'report.create': ['user', 'manager', 'admin', 'super_admin'],
  'report.delete': ['manager', 'admin', 'super_admin'],
  'user.view': ['admin', 'super_admin'],
  'user.invite': ['admin', 'super_admin'],
  'user.update_role': ['admin', 'super_admin'],
  'user.delete': ['admin', 'super_admin'],
  'calls.view': ['manager', 'admin', 'super_admin'],
  'calls.fetch': ['super_admin'],
  'calls.manage_settings': ['admin', 'super_admin'],
  'settings.update': ['admin', 'super_admin'],
  'data.export': ['super_admin'],
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

// Resolve whether a role may perform an action. Super Admin always passes.
// Uses the admin's saved settings when available, falling back to the factory
// defaults above while settings are still loading (or if a row is missing).
export function canAccess(settings, actionKey, userRole) {
  if (userRole === SUPER_ADMIN) return true;
  if (!userRole) return false;
  let roles;
  if (settings) {
    const setting = settings.find(s => s.action_key === actionKey);
    if (setting) roles = setting.allowed_roles;
  }
  if (!roles) roles = DEFAULT_PERMISSIONS[actionKey];
  return !!roles && roles.includes(userRole);
}

// Convenience hook: combines the current user's role with the live access
// settings and returns a stable `can(actionKey)` function plus a settings map
// for callers that need to check several keys at once.
export function usePermissions() {
  const { data: settings } = useAccessSettings();
  const can = useCallback(
    (actionKey, role) => canAccess(settings, actionKey, role),
    [settings]
  );
  return { can, settings, permissionsLoaded: !!settings };
}

// Helper for callers that already hold the role string (avoids re-reading user).
export function makeCan(settings) {
  return (actionKey, role) => canAccess(settings, actionKey, role);
}