import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import BoardingCheckIn from '@/components/checkin/BoardingCheckIn';
import { todayStr } from '@/lib/timezone';

/**
 * Wraps BoardingCheckIn in a dialog so staff can edit check-in options
 * for a pet that's already checked in. When confirmed, merges into the
 * existing visit — keeping finished and custom tasks, and adding or removing only
 * the scheduled tasks the new options change.
 */
export default function EditCheckInDialog({ pet, visit, open, onClose, onSave }) {
    const [saving, setSaving] = useState(false);

    const handleConfirm = async (newData) => {
        if (saving) return;
        setSaving(true);

        // The "Billing" task is tied to the checkout day. When the checkout day
        // changes, the regenerated schedule includes a fresh Billing task on the
        // new day — so drop any old Billing tasks here and carry over their
        // completion state (move, don't duplicate or leave the stale one).
        const oldBilling = (visit.scheduled_tasks || []).find(t => t.type === 'Billing');
        const billingWasCompleted = !!(oldBilling && oldBilling.completed);

        // Carry the old Billing task's completion state onto the new one.
        const regenerated = (newData.scheduled_tasks || []).map(t =>
            t.type === 'Billing' && billingWasCompleted
                ? { ...t, completed: true, completed_at: oldBilling.completed_at, completed_by: oldBilling.completed_by }
                : t
        );

        // Reconcile instead of replacing. The form regenerates the whole schedule from today, so
        // blindly appending it duplicated every task that already existed (completed ones got an
        // unchecked twin, play sessions went from 4 to 6, and so on). Match each existing task to a
        // regenerated slot and only add the slots nothing covers.
        const keyOf = (t) => [t.type, t.date || '', t.time || '', t.medication_name || ''].join('|');
        const pool = new Map();
        regenerated.forEach(g => pool.set(keyOf(g), [...(pool.get(keyOf(g)) || []), g]));
        const claim = (t) => {
            const slots = pool.get(keyOf(t));
            if (!slots || slots.length === 0) return false;
            slots.shift();
            return true;
        };
        const isScheduleTask = (t) => t.is_template || t.type === 'Play Session' || t.type === 'Collect Feces' || t.type === 'Collect Urine';
        const today = todayStr();
        const existing = (visit.scheduled_tasks || []).filter(t => t.type !== 'Billing'); // Billing is regenerated above

        const kept = [];
        // 1) Finished or cancelled tasks are history: always keep them, and let them use up their slot.
        existing.forEach(t => {
            if (t.completed || t.cancelled) { claim(t); kept.push(t); }
        });
        // 2) Open tasks: custom ones stay; scheduled ones stay only while the new options still want them.
        existing.forEach(t => {
            if (t.completed || t.cancelled) return;
            if (!isScheduleTask(t)) { kept.push(t); return; }
            if (claim(t)) { kept.push(t); return; }
            if ((t.date || '') < today) kept.push(t); // never rewrite past days
            // otherwise the option was turned off or the dates moved: drop it
        });
        // 3) Anything the new options need that doesn't exist yet.
        const added = [...pool.values()].flat();
        const mergedTasks = [...kept, ...added];

        try {
            await onSave({
                ...visit,
                scheduled_checkout_date: newData.scheduled_checkout_date,
                feeding_frequency: newData.feeding_frequency,
                what_was_brought: newData.what_was_brought,
                visit_medications: newData.visit_medications,
                play_camp_duration: newData.play_camp_duration,
                scheduled_tasks: mergedTasks
            });
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg w-full p-0 gap-0 max-h-[90vh] flex flex-col">
                <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
                    <DialogTitle>Edit Check-In — {pet?.name}</DialogTitle>
                </DialogHeader>
                <ScrollArea className="flex-1 overflow-y-auto px-6 pb-6">
                    <BoardingCheckIn
                        pet={pet}
                        visit={visit}
                        onConfirm={handleConfirm}
                        onCancel={onClose}
                        editMode
                    />
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}