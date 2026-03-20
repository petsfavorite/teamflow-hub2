import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import PageHeader from '../components/shared/PageHeader';
import RoleBadge from '../components/shared/RoleBadge';
import EmptyState from '../components/shared/EmptyState';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Users, UserPlus, Pencil, Loader2, Mail, Trash2, Hash, Plus } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function UserManagement() {
  const { user, isSuperAdmin, isAdmin, isManager, canManage } = useCurrentUser();
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [editRole, setEditRole] = useState('user');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPin, setEditPin] = useState('');
  const [pinError, setPinError] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => base44.entities.User.list('full_name', 500),
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams-mgmt'],
    queryFn: () => base44.entities.Team.list('name', 100),
  });

  const [showTeamDialog, setShowTeamDialog] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [activeTab, setActiveTab] = useState('users');

  const deleteUserMutation = useMutation({
    mutationFn: (id) => base44.entities.User.delete(id),
    onSuccess: () => {
      toast.success('User deleted');
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
    },
  });

  const canDelete = (u) => {
    if (u.id === user?.id) return false;
    if (u.role === 'super_admin') return false;
    if (isSuperAdmin) return true;
    if (isAdmin && (u.role === 'manager' || u.role === 'user' || !u.role)) return true;
    return false;
  };

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }) => base44.entities.User.update(id, { role }),
    onSuccess: () => {
      toast.success('User role updated');
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      setEditingUser(null);
    },
  });

  const updateTeamsMutation = useMutation({
    mutationFn: ({ id, team_ids }) => base44.entities.User.update(id, { team_ids }),
    onSuccess: () => {
      toast.success('Teams updated');
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      setEditingUser(null);
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: (name) => base44.entities.Team.create({ name, member_emails: [], member_names: [] }),
    onSuccess: () => {
      toast.success('Team created');
      queryClient.invalidateQueries({ queryKey: ['teams-mgmt'] });
      setNewTeamName('');
      setShowTeamDialog(false);
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: (id) => base44.entities.Team.delete(id),
    onSuccess: () => {
      toast.success('Team deleted');
      queryClient.invalidateQueries({ queryKey: ['teams-mgmt'] });
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
    },
  });

  const updateNameMutation = useMutation({
    mutationFn: ({ id, first_name, last_name, full_name }) => base44.functions.invoke('updateUserName', { userId: id, first_name, last_name, full_name }),
    onSuccess: () => {
      toast.success('Name updated');
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      setEditingUser(null);
    },
  });

  const [inviting, setInviting] = useState(false);
  const handleInvite = async () => {
    setInviting(true);
    try {
      await base44.users.inviteUser(inviteEmail, inviteRole === 'admin' ? 'admin' : 'user');
      // If they're a manager, update their role after invite since invite only supports admin/user
      toast.success(`Invitation sent to ${inviteEmail}`);
      setShowInvite(false);
      setInviteEmail('');
      setInviteRole('user');
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
    } catch (e) {
      toast.error('Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  if (!canManage) {
    return <div className="text-center py-20"><p className="text-slate-500">Access restricted to managers and admins</p></div>;
  }

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Manage team members, roles, and teams"
        actions={
          <Button onClick={() => setShowInvite(true)} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
            <UserPlus className="w-4 h-4" /> Invite User
          </Button>
        }
      />

      {/* Tab Navigation */}
      <div className="flex gap-4 mb-6 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 px-1 text-sm font-medium transition-colors ${
            activeTab === 'users' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Users
        </button>
        <button
          onClick={() => setActiveTab('teams')}
          className={`pb-3 px-1 text-sm font-medium transition-colors ${
            activeTab === 'teams' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Teams
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Card key={i} className="border-0 shadow-sm animate-pulse"><CardContent className="p-4"><div className="h-14 bg-slate-100 rounded" /></CardContent></Card>)}</div>
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="No users yet" description="Invite team members to get started" />
      ) : (
        <div className="space-y-3">
          {users.map(u => (
            <Card key={u.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-600">
                      {u.full_name?.charAt(0) || u.email?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{u.full_name || 'No name'}</p>
                      <p className="text-sm text-slate-400 flex items-center gap-1"><Mail className="w-3 h-3" />{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <RoleBadge role={u.role || 'user'} />
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => { 
                        setEditingUser(u); 
                        setEditRole(u.role || 'user');
                        setEditFirstName(u.first_name || '');
                        setEditLastName(u.last_name || '');
                        setEditPin(u.pin || '');
                        setPinError('');
                      }}
                      className={(() => {
                        if (u.id === user?.id) return 'invisible';
                        if (isSuperAdmin) return '';
                        if (isAdmin && u.role !== 'super_admin') return '';
                        if (isManager && (u.role === 'user' || !u.role)) return '';
                        return 'invisible';
                      })()}
                    >
                      <Pencil className="w-4 h-4 text-slate-400" />
                    </Button>
                    {canDelete(u) && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete User</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete {u.full_name || u.email}? This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteUserMutation.mutate(u.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="user@company.com" type="email" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  {(isSuperAdmin || isAdmin) && <SelectItem value="manager">Manager</SelectItem>}
                  {(isSuperAdmin || isAdmin) && <SelectItem value="admin">Admin</SelectItem>}
                  {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              {inviting && <Loader2 className="w-4 h-4 animate-spin" />} Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={async (open) => {
        if (!open && editingUser) {
          // Auto-save name if changed when closing
          const nameChanged = editFirstName !== (editingUser.first_name || '') || editLastName !== (editingUser.last_name || '');
          if (nameChanged && (editFirstName.trim() || editLastName.trim())) {
            updateNameMutation.mutate({ id: editingUser.id, first_name: editFirstName, last_name: editLastName });
            return;
          }
        }
        setEditingUser(null);
      }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User — {editingUser?.email}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Name editing: admin can rename user/manager, super_admin can also rename admin */}
            {(isSuperAdmin || (isAdmin && !['admin', 'super_admin'].includes(editingUser?.role))) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input
                    value={editFirstName}
                    onChange={e => setEditFirstName(e.target.value)}
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input
                    value={editLastName}
                    onChange={e => setEditLastName(e.target.value)}
                    placeholder="Last name"
                  />
                </div>
              </div>
            )}
            {/* PIN assignment — superadmin/admin can set any user's PIN; manager can set user-role PINs */}
            {(isSuperAdmin || isAdmin || (isManager && (editingUser?.role === 'user' || !editingUser?.role))) && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5" /> 6-Digit PIN
                </Label>
                <Input
                  value={editPin}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setEditPin(v);
                    setPinError(v && v.length < 6 ? 'PIN must be exactly 6 digits' : '');
                  }}
                  placeholder="6-digit numeric PIN"
                  maxLength={6}
                  inputMode="numeric"
                  className="font-mono tracking-widest text-center text-lg"
                />
                {pinError && <p className="text-xs text-red-500">{pinError}</p>}
                {editPin.length === 6 && !pinError && <p className="text-xs text-emerald-600">✓ PIN looks good</p>}
                <p className="text-xs text-slate-400">Leave unchanged to keep existing PIN. Set to empty to remove PIN.</p>
              </div>
            )}

            {(isSuperAdmin || isAdmin || (isManager && editingUser?.id !== user?.id && (editingUser?.role === 'user' || !editingUser?.role))) && (
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    {(isSuperAdmin || isAdmin) && <SelectItem value="manager">Manager</SelectItem>}
                    {(isSuperAdmin || isAdmin) && <SelectItem value="admin">Admin</SelectItem>}
                    {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (editPin && editPin.length !== 6) {
                  setPinError('PIN must be exactly 6 digits');
                  return;
                }

                const updates = {};
                // Save PIN if changed (including clearing it)
                const currentPin = editingUser?.pin || '';
                if (editPin !== currentPin) {
                  updates.pin = editPin || null;
                }

                if (Object.keys(updates).length > 0) {
                  await base44.entities.User.update(editingUser.id, updates);
                }

                const nameChanged = editFirstName !== (editingUser.first_name || '') || editLastName !== (editingUser.last_name || '');
                if (nameChanged) {
                  updateNameMutation.mutate({ id: editingUser.id, first_name: editFirstName, last_name: editLastName });
                  return;
                }
                if (editRole !== (editingUser?.role || 'user') && (isSuperAdmin || isAdmin || (isManager && editingUser?.id !== user?.id && (editingUser?.role === 'user' || !editingUser?.role)))) {
                  updateRoleMutation.mutate({ id: editingUser.id, role: editRole });
                  return;
                }
                if (Object.keys(updates).length > 0) {
                  toast.success('User updated');
                  queryClient.invalidateQueries({ queryKey: ['all-users'] });
                  setEditingUser(null);
                }
              }}
              disabled={updateNameMutation.isPending || updateRoleMutation.isPending || !!pinError}
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
            >
              {(updateNameMutation.isPending || updateRoleMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}