import React, { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { ShieldCheck, Save, Lock, Loader2 } from 'lucide-react';
import { useCurrentUser } from '@/components/hooks/useCurrentUser';
import { ACCESS_ROLES, ROLE_LABELS, SUPER_ADMIN, useAccessSettings } from '@/lib/accessControl';

export default function AccessControl() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isSuperAdmin } = useCurrentUser();
  const [localSettings, setLocalSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data: settings, isLoading } = useAccessSettings();

  useEffect(() => {
    if (settings && !localSettings) {
      setLocalSettings(settings.map(s => ({
        id: s.id,
        action_key: s.action_key,
        category: s.category,
        label: s.label,
        allowed_roles: [...(s.allowed_roles || [SUPER_ADMIN])],
        order: s.order || 0,
      })));
    }
  }, [settings, localSettings]);

  const grouped = useMemo(() => {
    if (!localSettings) return {};
    const groups = {};
    localSettings.forEach(s => {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    });
    Object.values(groups).forEach(arr => arr.sort((a, b) => (a.order || 0) - (b.order || 0)));
    return groups;
  }, [localSettings]);

  const hasChanges = useMemo(() => {
    if (!localSettings || !settings) return false;
    return localSettings.some(ls => {
      const orig = settings.find(s => s.id === ls.id);
      if (!orig) return false;
      return [...(orig.allowed_roles || [])].sort().join(',') !== [...ls.allowed_roles].sort().join(',');
    });
  }, [localSettings, settings]);

  const toggleRole = (id, role) => {
    if (role === SUPER_ADMIN) return;
    // Only Super Admin can modify the Admin role's permissions — prevents an
    // admin from granting their own role new permissions (privilege escalation).
    if (role === 'admin' && !isSuperAdmin) return;
    setLocalSettings(prev => prev.map(s => {
      if (s.id !== id) return s;
      const roles = new Set(s.allowed_roles);
      if (roles.has(role)) roles.delete(role);
      else roles.add(role);
      return { ...s, allowed_roles: [...roles] };
    }));
  };

  const handleSave = async () => {
    if (!localSettings) return;
    setSaving(true);
    try {
      const updates = localSettings
        .filter(ls => {
          const orig = settings.find(s => s.id === ls.id);
          if (!orig) return false;
          return [...(orig.allowed_roles || [])].sort().join(',') !== [...ls.allowed_roles].sort().join(',');
        })
        .map(ls => ({
          id: ls.id,
          allowed_roles: ls.allowed_roles.includes(SUPER_ADMIN)
            ? ls.allowed_roles
            : [...ls.allowed_roles, SUPER_ADMIN],
        }));

      if (updates.length > 0) {
        await base44.entities.AccessControlSetting.bulkUpdate(updates);
      }

      await queryClient.invalidateQueries({ queryKey: ['access-control-settings'] });
      setLocalSettings(null);
      toast({ title: 'Access settings saved successfully' });
    } catch (err) {
      toast({ title: 'Failed to save settings', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !localSettings) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!['admin', 'super_admin'].includes(user?.role)) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <Lock className="w-12 h-12 text-stone-300" />
        <p className="text-stone-500 text-lg font-medium">Access Denied</p>
        <p className="text-stone-400 text-sm">You need administrator privileges to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl pb-24 sm:pb-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#82bb32]" />
            Access Control
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Manage which user roles can perform each action. Super Admin always has full access.
          </p>
        </div>
        <Button onClick={handleSave} disabled={!hasChanges || saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>

      {Object.entries(grouped).map(([category, items]) => (
        <Card key={category}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{category}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                    <th className="text-left text-sm font-medium text-stone-600 px-4 py-3">Action</th>
                    {ACCESS_ROLES.map(r => (
                      <th key={r} className="text-center text-sm font-medium text-stone-600 px-2 py-3 min-w-[90px]">
                        <div className="flex items-center justify-center gap-1">
                          {ROLE_LABELS[r]}
                          {r === SUPER_ADMIN && <Lock className="w-3 h-3 text-stone-400" />}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b border-stone-100 hover:bg-stone-50">
                      <td className="text-sm text-stone-700 px-4 py-3 font-medium">{item.label}</td>
                      {ACCESS_ROLES.map(r => {
                        const checked = item.allowed_roles.includes(r);
                        const disabled = r === SUPER_ADMIN || (r === 'admin' && !isSuperAdmin);
                        return (
                          <td key={r} className="text-center px-2 py-3">
                            <Checkbox
                              checked={checked}
                              disabled={disabled}
                              onCheckedChange={() => toggleRole(item.id, r)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}