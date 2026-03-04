import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import PageHeader from '../components/shared/PageHeader';
import EmptyState from '../components/shared/EmptyState';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, Pencil, UserPlus, UserMinus, Loader2, Trash2 } from 'lucide-react';
import { toast } from "sonner";

export default function Teams() {
  const { user, isAdmin, isSuperAdmin, isManager } = useCurrentUser();
  const canAdmin = isAdmin || isSuperAdmin;
  const canManageMembers = canAdmin || isManager;
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [addMemberTeam, setAddMemberTeam] = useState(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list('name', 100),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => base44.entities.User.list('full_name', 500),
    enabled: canManageMembers,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Team.create(data),
    onSuccess: () => {
      toast.success('Team created');
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setShowCreate(false);
      setNewTeamName('');
      setNewTeamDesc('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Team.update(id, data),
    onSuccess: () => {
      toast.success('Team updated');
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setEditingTeam(null);
      setAddMemberTeam(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Team.delete(id),
    onSuccess: () => {
      toast.success('Team deleted');
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });

  const addMember = (team, userToAdd) => {
    const emails = [...(team.member_emails || [])];
    const names = [...(team.member_names || [])];
    if (emails.includes(userToAdd.email)) {
      toast.info('User already in team');
      return;
    }
    emails.push(userToAdd.email);
    names.push(userToAdd.full_name || userToAdd.email);
    updateMutation.mutate({ id: team.id, data: { member_emails: emails, member_names: names } });
  };

  const removeMember = (team, email) => {
    const idx = (team.member_emails || []).indexOf(email);
    const emails = (team.member_emails || []).filter(e => e !== email);
    const names = [...(team.member_names || [])];
    if (idx >= 0) names.splice(idx, 1);
    updateMutation.mutate({ id: team.id, data: { member_emails: emails, member_names: names } });
  };

  const nonMembers = addMemberTeam
    ? allUsers.filter(u => !(addMemberTeam.member_emails || []).includes(u.email))
    : [];

  return (
    <div>
      <PageHeader
        title="Teams"
        description="View and manage team assignments"
        actions={
          canAdmin && (
            <Button onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              <Plus className="w-4 h-4" /> New Team
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Card key={i} className="border-0 shadow-sm animate-pulse"><CardContent className="p-6"><div className="h-20 bg-slate-100 rounded" /></CardContent></Card>)}</div>
      ) : teams.length === 0 ? (
        <EmptyState icon={Users} title="No teams yet" description={canAdmin ? "Create a team to get started" : "No teams have been created yet"} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map(team => (
            <Card key={team.id} className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">{team.name}</h3>
                    {team.description && <p className="text-sm text-slate-500 mt-0.5">{team.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    {canManageMembers && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAddMemberTeam(team)}>
                        <UserPlus className="w-4 h-4 text-slate-400" />
                      </Button>
                    )}
                    {canAdmin && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingTeam(team); setNewTeamName(team.name); setNewTeamDesc(team.description || ''); }}>
                        <Pencil className="w-4 h-4 text-slate-400" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-500">{(team.member_emails || []).length} member{(team.member_emails || []).length !== 1 ? 's' : ''}</span>
                </div>
                {(team.member_emails || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(team.member_emails || []).map((email, i) => (
                      <Badge key={email} variant="secondary" className="text-xs gap-1 pr-1">
                        {(team.member_names || [])[i] || email}
                        {canManageMembers && (
                          <button onClick={() => removeMember(team, email)} className="ml-0.5 hover:text-red-500">
                            ×
                          </button>
                        )}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Team Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Team</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Team Name</Label>
              <Input value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="e.g. Client Care" />
            </div>
            <div className="space-y-2">
              <Label>Description <span className="text-slate-400 text-xs">(optional)</span></Label>
              <Input value={newTeamDesc} onChange={e => setNewTeamDesc(e.target.value)} placeholder="Brief description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              disabled={!newTeamName || createMutation.isPending}
              onClick={() => createMutation.mutate({ name: newTeamName, description: newTeamDesc, member_emails: [], member_names: [] })}
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Team Dialog */}
      <Dialog open={!!editingTeam} onOpenChange={() => setEditingTeam(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Team</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Team Name</Label>
              <Input value={newTeamName} onChange={e => setNewTeamName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={newTeamDesc} onChange={e => setNewTeamDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="flex justify-between">
            <Button variant="destructive" size="sm" onClick={() => { deleteMutation.mutate(editingTeam.id); setEditingTeam(null); }}>
              <Trash2 className="w-4 h-4 mr-1" /> Delete Team
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditingTeam(null)}>Cancel</Button>
              <Button
                disabled={!newTeamName || updateMutation.isPending}
                onClick={() => updateMutation.mutate({ id: editingTeam.id, data: { name: newTeamName, description: newTeamDesc } })}
                className="bg-indigo-600 hover:bg-indigo-700 gap-2"
              >
                {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={!!addMemberTeam} onOpenChange={() => setAddMemberTeam(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Members — {addMemberTeam?.name}</DialogTitle></DialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-2">
            {nonMembers.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">All users are already members</p>
            ) : (
              nonMembers.map(u => (
                <button
                  key={u.id}
                  onClick={() => addMember(addMemberTeam, u)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-indigo-50 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">
                    {u.full_name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{u.full_name || 'No name'}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </div>
                  <UserPlus className="w-4 h-4 text-indigo-400 ml-auto" />
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberTeam(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}