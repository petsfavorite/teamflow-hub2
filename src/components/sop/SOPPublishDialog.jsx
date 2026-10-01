import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, Users, User, ShieldCheck } from 'lucide-react';

// Publish dialog: asks who (if anyone) needs to acknowledge the SOP, then calls onPublish
// with the acknowledgement settings. The 90-day verification cycle is set automatically on publish.
export default function SOPPublishDialog({ open, onOpenChange, onPublish, pending, sopTitle, teams = [], users = [] }) {
  const [ackMode, setAckMode] = useState('none');
  const [dueDays, setDueDays] = useState(3);
  const [teamIds, setTeamIds] = useState([]);
  const [emails, setEmails] = useState([]);

  // Reset to defaults each time the dialog opens
  useEffect(() => {
    if (open) {
      setAckMode('none');
      setDueDays(3);
      setTeamIds([]);
      setEmails([]);
    }
  }, [open]);

  const handlePublish = () => {
    const ackSettings = ackMode === 'none'
      ? { requires_acknowledgement: false, acknowledgement_due_days: 3, acknowledgement_assigned_emails: [], acknowledgement_assigned_teams: [] }
      : ackMode === 'all'
        ? { requires_acknowledgement: true, acknowledgement_due_days: dueDays, acknowledgement_assigned_emails: [], acknowledgement_assigned_teams: [] }
        : { requires_acknowledgement: true, acknowledgement_due_days: dueDays, acknowledgement_assigned_emails: emails, acknowledgement_assigned_teams: teamIds };

    onPublish(ackSettings);
  };

  const canPublish = ackMode === 'none' || ackMode === 'all' || teamIds.length > 0 || emails.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-indigo-600" /> Publish SOP</DialogTitle>
          <DialogDescription>
            "{sopTitle}" will go live immediately. The 90-day verification cycle starts now.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm font-semibold text-slate-800 mb-2">Who needs to acknowledge this SOP?</p>
            <div className="space-y-2">
              <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${ackMode === 'none' ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input type="radio" checked={ackMode === 'none'} onChange={() => setAckMode('none')} className="accent-indigo-600" />
                <div>
                  <p className="text-sm font-medium text-slate-800">No acknowledgement required</p>
                  <p className="text-xs text-slate-500">Staff can read it anytime; no confirmation needed.</p>
                </div>
              </label>
              <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${ackMode === 'all' ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input type="radio" checked={ackMode === 'all'} onChange={() => setAckMode('all')} className="accent-indigo-600" />
                <div>
                  <p className="text-sm font-medium text-slate-800">All staff</p>
                  <p className="text-xs text-slate-500">Every staff member must confirm they've read it.</p>
                </div>
              </label>
              <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${ackMode === 'specific' ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input type="radio" checked={ackMode === 'specific'} onChange={() => setAckMode('specific')} className="accent-indigo-600" />
                <div>
                  <p className="text-sm font-medium text-slate-800">Specific teams or individuals</p>
                  <p className="text-xs text-slate-500">Only the people you choose must acknowledge.</p>
                </div>
              </label>
            </div>
          </div>

          {ackMode === 'specific' && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              {teams.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-slate-600"><Users className="w-3.5 h-3.5" /> Teams</div>
                  <div className="flex flex-wrap gap-2">
                    {teams.map(team => (
                      <label key={team.id} className="flex items-center gap-1.5 cursor-pointer bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100">
                        <Checkbox
                          checked={teamIds.includes(team.id)}
                          onCheckedChange={checked => setTeamIds(checked ? [...teamIds, team.id] : teamIds.filter(t => t !== team.id))}
                        />
                        <span className="text-xs text-slate-700">{team.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {users.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-slate-600"><User className="w-3.5 h-3.5" /> Individuals</div>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {users.map(u => (
                      <label key={u.id} className="flex items-center gap-1.5 cursor-pointer bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100">
                        <Checkbox
                          checked={emails.includes(u.email)}
                          onCheckedChange={checked => setEmails(checked ? [...emails, u.email] : emails.filter(e => e !== u.email))}
                        />
                        <span className="text-xs text-slate-700">{u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : u.email}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {teams.length === 0 && users.length === 0 && (
                <p className="text-xs text-slate-400">No teams or users to assign. Try "All staff" instead.</p>
              )}
            </div>
          )}

          {ackMode !== 'none' && (
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <Label className="text-xs whitespace-nowrap">Days to acknowledge</Label>
              <Input type="number" min="1" value={dueDays} onChange={e => setDueDays(Math.max(1, Number(e.target.value) || 1))} className="w-20 h-8 text-sm" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePublish} disabled={pending || !canPublish} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}