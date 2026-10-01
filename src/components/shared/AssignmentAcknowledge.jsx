import React, { useState } from 'react';
import { getUserDisplayName } from '@/lib/utils';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { UserCheck, Loader2, CheckCircle2, UserX } from 'lucide-react';
import { toast } from "sonner";
import { formatDateTime } from '@/lib/timezone';

/**
 * Shared assignment + acknowledge section for Incident Reports and Maintenance Requests.
 *
 * Props:
 * - record: the entity record
 * - users: all users (for the assignment list)
 * - currentUser: current user object
 * - canManage: boolean — manager/admin/super_admin
 * - isSuperAdmin: boolean
 * - onUpdate: async (id, data) => Promise — updates the entity record
 * - onNotify: async (action, payload) => Promise — calls notifyIncidentMaintenance
 * - entityType: 'incident' | 'maintenance'
 * - isResolved: boolean — whether the record is resolved/completed (hides assignment)
 */
export default function AssignmentAcknowledge({
  record,
  users = [],
  currentUser,
  canManage,
  isSuperAdmin,
  onUpdate,
  onNotify,
  entityType,
  isResolved,
}) {
  const [updating, setUpdating] = useState(false);

  const assignedEmails = record.assigned_to_emails || [];
  const acknowledgements = record.acknowledgements || [];

  const myAck = acknowledgements.find((a) => a.email === currentUser?.email);
  const needsAck =
    !myAck || (record.updated_date && new Date(record.updated_date) > new Date(myAck.acknowledged_at));

  const creatorEmail = entityType === 'incident' ? record.reported_by : record.requested_by;

  const isInvolved = () => {
    if (!currentUser) return false;
    if (canManage) return true;
    return creatorEmail === currentUser.email || assignedEmails.includes(currentUser.email);
  };

  const handleToggleAssign = async (email, name) => {
    const isAssigned = assignedEmails.includes(email);
    const newEmails = isAssigned
      ? assignedEmails.filter((e) => e !== email)
      : [...assignedEmails, email];
    const newNames = newEmails.map((e) => {
      const u = users.find((u) => u.email === e);
      return getUserDisplayName(u) || e;
    });

    setUpdating(true);
    try {
      const updateData = {
        assigned_to_emails: newEmails,
        assigned_to_names: newNames,
        assigned_to: newEmails[0] || null,
      };
      await onUpdate(record.id, updateData);

      // Notify newly assigned users
      if (!isAssigned) {
        await onNotify('assign', { newAssigneeEmails: [email] });
      }

      toast.success(isAssigned ? 'User unassigned' : 'User assigned');
    } catch (e) {
      toast.error('Failed to update assignment');
    }
    setUpdating(false);
  };

  const handleRemoveMe = async () => {
    if (!currentUser) return;
    setUpdating(true);
    try {
      const newEmails = assignedEmails.filter((e) => e !== currentUser.email);
      const newNames = newEmails.map((e) => {
        const u = users.find((u) => u.email === e);
        return getUserDisplayName(u) || e;
      });
      await onUpdate(record.id, {
        assigned_to_emails: newEmails,
        assigned_to_names: newNames,
        assigned_to: newEmails[0] || null,
      });
      toast.success('You have been removed from this assignment');
    } catch (e) {
      toast.error('Failed to remove');
    }
    setUpdating(false);
  };

  const handleAcknowledge = async () => {
    if (!currentUser) return;
    setUpdating(true);
    try {
      const existing = acknowledgements.filter((a) => a.email !== currentUser.email);
      const newAcks = [
        ...existing,
        {
          email: currentUser.email,
          name: getUserDisplayName(currentUser),
          acknowledged_at: new Date().toISOString(),
        },
      ];
      await onUpdate(record.id, { acknowledgements: newAcks });
      toast.success('Acknowledged');
    } catch (e) {
      toast.error('Failed to acknowledge');
    }
    setUpdating(false);
  };

  return (
    <>
      {/* Acknowledge button */}
      {isInvolved() && needsAck && !isResolved && (
        <div className="border-t pt-4">
          <Button
            onClick={handleAcknowledge}
            disabled={updating}
            className="w-full bg-blue-600 hover:bg-blue-700 gap-2"
          >
            {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Acknowledge
          </Button>
        </div>
      )}

      {/* Acknowledgements list */}
      {acknowledgements.length > 0 && (
        <div className="border-t pt-4">
          <p className="text-sm font-medium text-slate-900 mb-2 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-600" /> Acknowledged By
          </p>
          <div className="space-y-1.5">
            {acknowledgements.map((a, i) => (
              <div key={i} className="text-xs flex items-center justify-between bg-emerald-50 rounded px-2 py-1.5">
                <span className="font-medium text-emerald-800">{a.name}</span>
                <span className="text-emerald-600">{a.acknowledged_at ? formatDateTime(a.acknowledged_at, 'MMM D, hh:mm A') : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assignment section — managers/admins only, hidden when resolved */}
      {canManage && !isResolved && (
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-slate-900">Assign To</p>
            {isSuperAdmin && assignedEmails.includes(currentUser?.email) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemoveMe}
                disabled={updating}
                className="gap-1 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
              >
                {updating ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserX className="w-3 h-3" />}
                Remove me
              </Button>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2 bg-slate-50">
            {users.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-2">No users available</p>
            )}
            {users.map((u) => {
              const email = u.email;
              if (!email) return null;
              const isAssigned = assignedEmails.includes(email);
              const isUserSuperAdmin = u.role === 'super_admin';
              // Non-super-admins cannot unassign a super admin
              const checkboxDisabled = updating || (isUserSuperAdmin && !isSuperAdmin && isAssigned);
              return (
                <label
                  key={u.id || email}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white transition-colors ${checkboxDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <Checkbox
                    checked={isAssigned}
                    disabled={checkboxDisabled}
                    onCheckedChange={() => handleToggleAssign(email, getUserDisplayName(u))}
                  />
                  <span className="text-sm flex-1">{getUserDisplayName(u) || email}</span>
                  {isUserSuperAdmin && (
                    <span className="text-[10px] text-slate-400 font-medium">SUPER ADMIN</span>
                  )}
                </label>
              );
            })}
          </div>
          {assignedEmails.length > 0 && (
            <p className="text-xs text-slate-400 mt-1">
              {assignedEmails.length} assigned • Super admins can only self-remove
            </p>
          )}
        </div>
      )}
    </>
  );
}