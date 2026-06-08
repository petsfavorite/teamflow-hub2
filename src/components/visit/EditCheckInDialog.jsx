import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import BoardingCheckIn from '@/components/checkin/BoardingCheckIn';

/**
 * Wraps BoardingCheckIn in a dialog so staff can edit check-in options
 * for a pet that's already checked in. When confirmed, merges into the
 * existing visit — preserving completed tasks but replacing template tasks.
 */
export default function EditCheckInDialog({ pet, visit, open, onClose, onSave }) {
    const [saving, setSaving] = useState(false);

    const handleConfirm = async (newData) => {
        if (saving) return;
        setSaving(true);

        // Keep any tasks that are NOT templates (custom tasks added mid-stay)
        // and any already-completed template tasks (so history is preserved).
        const existingNonTemplateTasks = (visit.scheduled_tasks || []).filter(t =>
            !t.is_template || t.completed
        );

        // Merge: new template tasks from the re-check-in form + existing non-template/completed
        const mergedTasks = [
            ...existingNonTemplateTasks,
            ...(newData.scheduled_tasks || [])
        ];

        await onSave({
            scheduled_checkout_date: newData.scheduled_checkout_date,
            feeding_frequency: newData.feeding_frequency,
            what_was_brought: newData.what_was_brought,
            visit_medications: newData.visit_medications,
            play_camp_duration: newData.play_camp_duration,
            scheduled_tasks: mergedTasks
        });

        setSaving(false);
        onClose();
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