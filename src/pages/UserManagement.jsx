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
import { Users, UserPlus, Pencil, Loader2, Trash2, Hash, Plus, Clock, RotateCcw, Archive, ArchiveRestore } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatDate } from '@/lib/timezone';

export default function UserManagement() {
  const { user, isSuperAdmin, isAdmin, isManager, canManage } = useCurrentUser();
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [invitePin, setInvitePin] = useState('');
  const [inviteTeamIds, setInviteTeamIds] = useState([]);
  const [editRole, setEditRole] = useState('user');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPin, setEditPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [reassignDialog, setReassignDialog] = useState(null); // { user, candidates, count }
  const [selectedReassignEmail, setSelectedReassignEmail] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['all-users'],
    queryFn: async () => {
      const res = await base44.functions.invoke('listUsers', {});
      return res.data?.users || [];
    },
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams-mgmt'],
    queryFn: () => base44.entities.Team.list('name', 100),
  });

  const { data: pendingInvites = [] } = useQuery({
    queryKey: ['pending-invites', isSuperAdmin, isAdmin],
    queryFn: () => base44.entities.PendingInvite.list('-created_date', 100),
    enabled: !!(isAdmin || isSuperAdmin),
  });

  const [showTeamDialog, setShowTeamDialog] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [activeTab, setActiveTab] = useState('users');

  const deleteUserMutation = useMutation({
    mutationFn: async ({ u, reassignToEmail }) => {
      // Reassign open items to the chosen person (or auto-pick if none chosen) before deleting
      await base44.functions.invoke('reassignOnDelete', {
        deleted_user_email: u.email,
        deleted_user_role: u.role || 'user',
        team_ids: u.team_ids || [],
        reassign_to_email: reassignToEmail || null,
      });
      return base44.entities.User.delete(u.id);
    },
    onSuccess: () => {
      toast.success('User deleted and items reassigned');
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      setReassignDialog(null);
      setSelectedReassignEmail('');
    },
    onError: (e) => {
      toast.error(e?.response?.data?.error || e?.message || 'Failed to delete user');
    },
  });

  // First confirm the delete, then check for active assignments. If any exist,
  // ask who they should be reassigned to before actually deleting.
  const handleDeleteConfirm = async (u) => {
    setDeleteLoading(true);
    try {
      const res = await base44.functions.invoke('reassignOnDelete', {
        deleted_user_email: u.email,
        deleted_user_role: u.role || 'user',
        team_ids: u.team_ids || [],
        preview: true,
      });
      const data = res.data || res;
      if (data.count > 0 && (data.candidates || []).length > 0) {
        setReassignDialog({ user: u, candidates: data.candidates, count: data.count });
        setSelectedReassignEmail(data.candidates[0].email);
      } else {
        deleteUserMutation.mutate({ u });
      }
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.message || 'Could not check assignments');
    } finally {
      setDeleteLoading(false);
    }
  };

  const archiveUserMutation = useMutation({
    mutationFn: async ({ userId, is_archived }) => {
      return base44.functions.invoke('updateUserProfile', { userId, is_archived });
    },
    onSuccess: (_, variables) => {
      toast.success(variables.is_archived ? 'User archived — they can no longer log in' : 'User restored — they can log in again');
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
    },
    onError: (e) => {
      toast.error(e?.response?.data?.error || e?.message || 'Failed to update archive status');
    },
  });

  const canDelete = (u) => {
    if (u.id === user?.id) return false;
    if (u.role === 'super_admin') return false;
    if (isSuperAdmin) return true;
    if (isAdmin && (u.role === 'manager' || u.role === 'user' || !u.role)) return true;
    return false;
  };

  const canArchive = (u) => {
    if (u.id === user?.id) return false;
    if (u.role === 'super_admin') return false;
    if (isSuperAdmin) return true;
    if (isAdmin && (u.role === 'manager' || u.role === 'user' || !u.role)) return true;
    return false;
  };

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
  
  const generatePin = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleInvite = async () => {
    setInviting(true);
    try {
      await base44.functions.invoke('createUserInvite', {
        email: inviteEmail,
        firstName: inviteFirstName,
        lastName: inviteLastName,
        pin: invitePin,
        role: inviteRole,
        team_ids: inviteTeamIds,
      });

      toast.success(`Invitation sent to ${inviteEmail}`);
      setShowInvite(false);
      setInviteEmail('');
      setInviteFirstName('');
      setInviteLastName('');
      setInvitePin('');
      setInviteTeamIds([]);
      setInviteRole('user');
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      queryClient.invalidateQueries({ queryKey: ['pending-invites'] });
    } catch (e) {
      const errMsg = e?.response?.data?.error || e?.message || 'Unknown error';
      toast.error(`Failed to send invitation: ${errMsg}`);
    } finally {
      setInviting(false);
    }
  };

  const handleResendInvite = async (invite) => {
    try {
      await base44.functions.invoke('createUserInvite', {
        email: invite.email,
        firstName: invite.first_name,
        lastName: invite.last_name,
        pin: invite.pin || '',
        role: invite.role,
        team_ids: invite.team_ids || [],
      });
      toast.success(`Invitation resent to ${invite.email}`);
      queryClient.invalidateQueries({ queryKey: ['pending-invites'] });
    } catch (e) {
      const errMsg = e?.response?.data?.error || e?.message || 'Unknown error';
      toast.error(`Failed to resend: ${errMsg}`);
    }
  };

  const handleDeleteInvite = async (invite) => {
    try {
      await base44.entities.PendingInvite.delete(invite.id);
      toast.success(`Invite for ${invite.email} deleted`);
      queryClient.invalidateQueries({ queryKey: ['pending-invites'] });
    } catch (e) {
      toast.error('Failed to delete invite');
    }
  };

  const activeUsers = users.filter(u => !u.is_archived);
  const archivedUsers = users.filter(u => u.is_archived);

  const renderUserCard = (u) => (
    <Card key={u.id} className={`border-0 shadow-sm ${u.is_archived ? 'opacity-60' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 flex-shrink-0">
              {u.initials || u.full_name?.charAt(0) || u.email?.charAt(0) || '?'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-slate-900 truncate">
                  {(u.first_name || u.last_name) ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : (u.full_name || 'No name set')}
                </p>
                {u.is_archived && (
                  <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded flex-shrink-0">Archived</span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate">{u.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {canArchive(u) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => archiveUserMutation.mutate({ userId: u.id, is_archived: !u.is_archived })}
                title={u.is_archived ? 'Unarchive user' : 'Archive user'}
              >
                {u.is_archived
                  ? <ArchiveRestore className="w-4 h-4 text-emerald-500" />
                  : <Archive className="w-4 h-4 text-slate-400" />}
              </Button>
            )}
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
                if (isSuperAdmin && u.role !== 'super_admin') return '';
                if (isAdmin && !['admin', 'super_admin'].includes(u.role)) return '';
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
                      Are you sure you want to delete {u.full_name || u.email}? This cannot be undone. Any active items assigned to them will be reassigned.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDeleteConfirm(u)}
                      disabled={deleteLoading}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center flex-wrap gap-2 pl-13">
          <RoleBadge role={u.role || 'user'} />
          {u.team_ids?.length > 0 && teams.length > 0 && (
            <>
              {u.team_ids.map(teamId => {
                const team = teams.find(t => t.id === teamId);
                return team ? (
                  <span key={teamId} className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                    {team.name}
                  </span>
                ) : null;
              })}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (!canManage) {
    return <div className="text-center py-20"><p className="text-slate-500">Access restricted to managers and admins</p></div>;
  }

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Manage team members, roles, and teams"
        actions={
          (isAdmin || isSuperAdmin) && (
            <Button onClick={() => setShowInvite(true)} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              <UserPlus className="w-4 h-4" /> Invite User
            </Button>
          )
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

      {activeTab === 'users' && (
        <>
          {/* Pending Invites */}
          {(isAdmin || isSuperAdmin) && pendingInvites.length > 0 && (
            <div className="space-y-3 mb-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Invites</h3>
              {pendingInvites.map(invite => (
                <Card key={invite.id} className="border-0 shadow-sm border-l-4 border-l-amber-400">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                          <Clock className="w-5 h-5 text-amber-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-slate-900 truncate">
                              {(invite.first_name || invite.last_name) ? `${invite.first_name || ''} ${invite.last_name || ''}`.trim() : invite.email}
                            </p>
                            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded flex-shrink-0">Pending User</span>
                          </div>
                          <p className="text-xs text-slate-400 truncate">{invite.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResendInvite(invite)}
                          className="text-xs text-slate-500 hover:text-indigo-600 gap-1"
                          title="Resend Invite"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Resend</span>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" title="Delete Invite">
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Invite</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete the invite for {invite.email}? They will no longer be able to accept it.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteInvite(invite)} className="bg-red-600 hover:bg-red-700">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    <div className="mt-2 pl-13">
                      <span className="text-xs text-slate-400 capitalize">{invite.role}</span>
                      {invite.last_sent_at && (
                        <span className="text-xs text-slate-400 ml-2">· Sent {formatDate(invite.last_sent_at)}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {(isAdmin || isSuperAdmin) && pendingInvites.length > 0 && (
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Active Users</h3>
          )}
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <Card key={i} className="border-0 shadow-sm animate-pulse"><CardContent className="p-4"><div className="h-14 bg-slate-100 rounded" /></CardContent></Card>)}</div>
          ) : users.length === 0 ? (
            <EmptyState icon={Users} title="No users yet" description="Invite team members to get started" />
          ) : (
            <>
              <div className="space-y-3">
                {activeUsers.map(renderUserCard)}
              </div>
              {archivedUsers.length > 0 && (
                <>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-6 mb-3">Archived Users</h3>
                  <div className="space-y-3">
                    {archivedUsers.map(renderUserCard)}
                  </div>
                </>
              )}
            </>
          )}
          </>
          )}

          {activeTab === 'teams' && (
          <div className="space-y-4">
          <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-900">Team Management</h2>
          <Button onClick={() => setShowTeamDialog(true)} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
          <Plus className="w-4 h-4" /> Create Team
          </Button>
          </div>
          {teams.length === 0 ? (
          <EmptyState icon={Users} title="No teams yet" description="Create your first team" />
          ) : (
          <div className="space-y-3">
          {teams.map(team => (
           <Card key={team.id} className="border-0 shadow-sm">
             <CardContent className="p-4">
               <div className="flex items-center justify-between">
                 <div>
                   <p className="font-medium text-slate-900">{team.name}</p>
                   <p className="text-sm text-slate-400">{team.member_emails?.length || 0} members</p>
                 </div>
                 <AlertDialog>
                   <AlertDialogTrigger asChild>
                     <Button variant="ghost" size="sm">
                       <Trash2 className="w-4 h-4 text-red-400" />
                     </Button>
                   </AlertDialogTrigger>
                   <AlertDialogContent>
                     <AlertDialogHeader>
                       <AlertDialogTitle>Delete Team</AlertDialogTitle>
                       <AlertDialogDescription>
                         Are you sure you want to delete "{team.name}"? This cannot be undone.
                       </AlertDialogDescription>
                     </AlertDialogHeader>
                     <AlertDialogFooter>
                       <AlertDialogCancel>Cancel</AlertDialogCancel>
                       <AlertDialogAction
                         onClick={() => deleteTeamMutation.mutate(team.id)}
                         className="bg-red-600 hover:bg-red-700"
                       >
                         Delete
                       </AlertDialogAction>
                     </AlertDialogFooter>
                   </AlertDialogContent>
                 </AlertDialog>
               </div>
             </CardContent>
           </Card>
          ))}
          </div>
          )}
          </div>
          )}

      {/* Invite Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="max-h-[90vh] overflow-y-auto w-full max-w-lg mx-4 sm:mx-auto">
          <DialogHeader><DialogTitle>Invite User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input value={inviteFirstName} onChange={e => setInviteFirstName(e.target.value)} placeholder="John" />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input value={inviteLastName} onChange={e => setInviteLastName(e.target.value)} placeholder="Doe" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="user@company.com" type="email" />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" /> 6-Digit PIN
              </Label>
              <div className="flex gap-2">
                <Input
                  value={invitePin}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setInvitePin(v);
                  }}
                  placeholder="Leave blank to auto-generate"
                  maxLength={6}
                  inputMode="numeric"
                  className="font-mono tracking-widest text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setInvitePin(generatePin())}
                  className="text-sm"
                >
                  Generate
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            {teams.length > 0 && inviteRole !== 'general_account' && (
              <div className="space-y-2">
                <Label>Teams (Optional)</Label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {teams.map(team => (
                    <label key={team.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={inviteTeamIds.includes(team.id)}
                        onCheckedChange={checked => {
                          const updated = checked
                            ? [...inviteTeamIds, team.id]
                            : inviteTeamIds.filter(id => id !== team.id);
                          setInviteTeamIds(updated);
                        }}
                      />
                      <span className="text-sm text-slate-700">{team.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
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
            await base44.functions.invoke('updateUserProfile', { userId: editingUser.id, first_name: editFirstName, last_name: editLastName });
            queryClient.invalidateQueries({ queryKey: ['all-users'] });
            return;
          }
        }
        setEditingUser(null);
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto w-full max-w-lg mx-4 sm:mx-auto">
          <DialogHeader><DialogTitle className="text-sm break-all">Edit User — {editingUser?.email}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Name editing: managers+ can edit name */}
            {(isSuperAdmin || isAdmin || isManager) && (
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
            {/* PIN assignment — managers+ can set PIN */}
            {editingUser?.role !== 'general_account' && (isSuperAdmin || isAdmin || isManager) && (
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

            {/* Role: only admins+ can change roles */}
            {(isSuperAdmin || isAdmin) && (
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(isSuperAdmin || isAdmin || isManager) && teams.length > 0 && (
              <div className="space-y-2">
                <Label>Teams</Label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {teams.map(team => (
                    <label key={team.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={(editingUser?.team_ids || []).includes(team.id)}
                        onCheckedChange={checked => {
                          const current = editingUser?.team_ids || [];
                          const updated = checked ? [...current, team.id] : current.filter(id => id !== team.id);
                          setEditingUser({ ...editingUser, team_ids: updated });
                        }}
                      />
                      <span className="text-sm text-slate-700">{team.name}</span>
                    </label>
                  ))}
                </div>
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

                // Managers can only edit regular users — not other managers or above
                if (isManager && !isAdmin && !isSuperAdmin && ['admin', 'super_admin', 'manager'].includes(editingUser?.role)) {
                  toast.error('You can only edit regular users');
                  setEditingUser(null);
                  return;
                }

                const payload = { userId: editingUser.id };
                let hasChanges = false;

                const nameChanged = editFirstName !== (editingUser.first_name || '') || editLastName !== (editingUser.last_name || '');
                if (nameChanged) {
                  payload.first_name = editFirstName;
                  payload.last_name = editLastName;
                  hasChanges = true;
                }

                const roleChanged = editRole !== (editingUser?.role || 'user');
                if (roleChanged && (isSuperAdmin || isAdmin)) {
                  payload.role = editRole;
                  hasChanges = true;
                }

                const currentPin = editingUser?.pin || '';
                if (editPin !== currentPin) {
                  payload.pin = editPin || '';
                  hasChanges = true;
                }

                const originalUser = users.find(u => u.id === editingUser.id);
                const teamsChanged = JSON.stringify(originalUser?.team_ids || []) !== JSON.stringify(editingUser?.team_ids || []);
                if (teamsChanged) {
                  payload.team_ids = editingUser?.team_ids || [];
                  hasChanges = true;
                }

                if (hasChanges) {
                  await base44.functions.invoke('updateUserProfile', payload);
                  queryClient.invalidateQueries({ queryKey: ['all-users'] });
                  // Invalidate team queries so other pages (e.g. Checklists) reflect
                  // the membership change immediately without needing a remount.
                  queryClient.invalidateQueries({ queryKey: ['teams-list'] });
                  queryClient.invalidateQueries({ queryKey: ['teams'] });
                  queryClient.invalidateQueries({ queryKey: ['teams-mgmt'] });
                  toast.success('User updated');
                }
                setEditingUser(null);
              }}
              disabled={!!pinError}
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
              >
              {updateNameMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes
              </Button>
          </DialogFooter>
        </DialogContent>
        </Dialog>

        {/* Create Team Dialog */}
        <Dialog open={showTeamDialog} onOpenChange={setShowTeamDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Team</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Team Name</Label>
              <Input value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="e.g. Night Shift, Daytime Staff" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTeamDialog(false)}>Cancel</Button>
            <Button onClick={() => createTeamMutation.mutate(newTeamName)} disabled={createTeamMutation.isPending || !newTeamName.trim()} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              {createTeamMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Create Team
            </Button>
          </DialogFooter>
        </DialogContent>
        </Dialog>

        {/* Reassign active items before deleting */}
        <Dialog open={!!reassignDialog} onOpenChange={(open) => { if (!open) { setReassignDialog(null); setSelectedReassignEmail(''); } }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Reassign active items</DialogTitle></DialogHeader>
            <p className="text-sm text-slate-600">
              {reassignDialog?.user?.full_name || reassignDialog?.user?.email} has <strong>{reassignDialog?.count}</strong> active item(s) assigned (tasks, maintenance requests, incident reports, checklists). Who should they be reassigned to?
            </p>
            <Select value={selectedReassignEmail} onValueChange={setSelectedReassignEmail}>
              <SelectTrigger><SelectValue placeholder="Choose a person" /></SelectTrigger>
              <SelectContent>
                {(reassignDialog?.candidates || []).map(c => (
                  <SelectItem key={c.email} value={c.email}>{c.name} ({c.role})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setReassignDialog(null); setSelectedReassignEmail(''); }}>Cancel</Button>
              <Button
                className="bg-red-600 hover:bg-red-700"
                disabled={!selectedReassignEmail || deleteUserMutation.isPending}
                onClick={() => deleteUserMutation.mutate({ u: reassignDialog.user, reassignToEmail: selectedReassignEmail })}
              >
                {deleteUserMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reassign & Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
        );
        }