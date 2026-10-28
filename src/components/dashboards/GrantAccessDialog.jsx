import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/components/hooks/useCurrentUser";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const personName = (u) => [u.first_name, u.last_name].filter(Boolean).join(" ") || u.full_name || u.email;

export default function GrantAccessDialog({ dashboard, open, onClose, onGranted }) {
  const { displayName: myName } = useCurrentUser();
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await base44.functions.invoke("listUsers", {});
      return res.data?.users || [];
    },
  });

  const access = dashboard.access || [];
  const available = users
    .filter((u) => u.email && !access.some((a) => a.email === u.email))
    .sort((a, b) => personName(a).localeCompare(personName(b)));

  const handleGrant = async () => {
    const person = users.find((u) => u.email === email);
    if (!person) return;
    setSaving(true);
    await base44.entities.Dashboard.update(dashboard.id, {
      access: [
        ...access,
        {
          email: person.email,
          name: personName(person),
          granted_at: new Date().toISOString(),
          granted_by: myName || "",
        },
      ],
    });
    setSaving(false);
    setEmail("");
    onGranted();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Grant access to {dashboard.name}</DialogTitle>
          <DialogDescription>People you grant can open this dashboard from the Dashboards page.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Person</p>
            <Select value={email} onValueChange={setEmail}>
              <SelectTrigger>
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {available.map((u) => (
                  <SelectItem key={u.id} value={u.email}>
                    {personName(u)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-700">Already has access</p>
            {access.length === 0 ? (
              <p className="text-sm text-slate-500">No one yet.</p>
            ) : (
              <ul className="max-h-40 overflow-y-auto text-sm text-slate-600 space-y-0.5">
                {access.map((a) => (
                  <li key={a.email}>{a.name || a.email}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleGrant} disabled={!email || saving}>
              {saving ? "Granting…" : "Grant Access"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}