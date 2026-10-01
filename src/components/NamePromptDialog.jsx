import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from 'lucide-react';
import { toast } from "sonner";

// Blocks the app until the current user has both a first name and a last name.
// Shown automatically on first login when the admin didn't enter a name at
// invite time. The user can change it later in Settings.
export default function NamePromptDialog() {
  const { user, isLoadingAuth, checkAppState } = useAuth();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isLoadingAuth) return;
    if (user && (!user.first_name?.trim() || !user.last_name?.trim())) {
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [user, isLoadingAuth]);

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error('Please enter both your first and last name');
      return;
    }
    setSaving(true);
    try {
      await base44.functions.invoke('updateOwnName', {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      toast.success('Name saved!');
      setOpen(false);
      await checkAppState();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to save name');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Welcome! Please enter your name</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-500 mb-2">
          Your first and last name are required so your team knows who you are. You can change this later in Settings.
        </p>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>First Name <span className="text-red-500">*</span></Label>
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && firstName.trim() && lastName.trim()) handleSave(); }}
            />
          </div>
          <div className="space-y-2">
            <Label>Last Name <span className="text-red-500">*</span></Label>
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              onKeyDown={(e) => { if (e.key === 'Enter' && firstName.trim() && lastName.trim()) handleSave(); }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={saving || !firstName.trim() || !lastName.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}