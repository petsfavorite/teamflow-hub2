import React, { useState, useEffect, useRef } from 'react';
import PreliminaryReportDialog from './PreliminaryReportDialog';
import EditCheckInDialog from './EditCheckInDialog';
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { 
    Dog, Cat, MapPin, Clock, Utensils, Pill, 
    CheckCircle2, Plus, X, FileText, Camera, ChevronLeft, AlertCircle, Sparkles, Pencil
} from "lucide-react";
import moment from "moment";

export default function VisitPanel({ pet, visit, onUpdateVisit, onClose, onCheckout, selectedDate, queryClient }) {
     const [currentUser, setCurrentUser] = useState(null);
     const [newActivity, setNewActivity] = useState('');
     const [newNotes, setNewNotes] = useState('');
     const [isSaving, setIsSaving] = useState(false);
     const [dismissingAlert, setDismissingAlert] = useState(false);

    useEffect(() => {
        base44.auth.me().then(setCurrentUser).catch(() => {});
    }, []);

    const handleDismissEmergencyAlert = async () => {
        if (dismissingAlert) return;
        setDismissingAlert(true);
        try {
            const dismissUntil = new Date();
            dismissUntil.setHours(dismissUntil.getHours() + 24);

            await onUpdateVisit({
                ...visit,
                emergency_alert_active: false,
                emergency_alert_dismissed_until: dismissUntil.toISOString()
            });
        } finally {
            setDismissingAlert(false);
        }
    };

    const canDismissAlert = currentUser && ['admin', 'manager', 'super_admin'].includes(currentUser.role);
    const [locationInput, setLocationInput] = useState(visit?.location || '');
    useEffect(() => { setLocationInput(visit?.location || ''); }, [visit?.location]);
    const [addingTask, setAddingTask] = useState(false);
    const [newTaskType, setNewTaskType] = useState('');
    const [newTaskTime, setNewTaskTime] = useState('');
    const [newTaskNotes, setNewTaskNotes] = useState('');
    const viewDate = selectedDate || moment().format('YYYY-MM-DD');
    const [newTaskDate, setNewTaskDate] = useState(viewDate);
    const [showPrelimReport, setShowPrelimReport] = useState(false);
    const [editingTaskIdx, setEditingTaskIdx] = useState(null);
    const [confirmUndoTaskIdx, setConfirmUndoTaskIdx] = useState(null);
    const [confirmUndoLogIdx, setConfirmUndoLogIdx] = useState(null);
    const [cancelTaskIdx, setCancelTaskIdx] = useState(null);
    const [cancelTaskNote, setCancelTaskNote] = useState('');
    const [addingPlayCamp, setAddingPlayCamp] = useState(false);
    const [playCampDuration, setPlayCampDuration] = useState('half_day');
    const [editCheckInOpen, setEditCheckInOpen] = useState(false);
    const editFormRef = useRef(null);

    const [recurrenceType, setRecurrenceType] = useState('none');
    const [customTaskType, setCustomTaskType] = useState('');
    const isBoarding = visit.visit_type === 'boarding';

    const today = moment().format('YYYY-MM-DD');
    // Task completion (marking done) is locked after 9 PM on the same day
    const isAfter9PM = moment().isAfter(moment('9:00 PM', 'h:mm A'));

    const isCat = pet.species === 'Cat';
    const isPlayCamp = visit.visit_type === 'play_camp';
    
    // Get tasks for the current viewing date
     const getTasksForDate = (date) => {
         let tasks = visit.scheduled_tasks?.filter(task => {
             // "As Needed" tasks always show on their date (never completed, just logged)
             if (task.is_as_needed) {
                 return task.date === date;
             }

             // For completed tasks, only show if completed on this date (so Undo is accessible)
             if (task.completed) {
                 return task.completed_date === date;
             }

             if (task.date) {
                 // If task has an explicit date, only show if it matches
                 return task.date === date;
             }
             if (task.is_template) {
                 const visitStart = moment(visit.check_in_date);
                 const visitEnd = visit.scheduled_checkout_date ? moment(visit.scheduled_checkout_date) : moment().add(30, 'days');
                 const currentDate = moment(date);

                 if (currentDate.isBetween(visitStart, visitEnd, 'day', '[]')) {
                     if (task.is_daily_observation) {
                         const completedToday = task.completed && task.completed_date === date;
                         return !completedToday;
                     }
                     // Always show template tasks on or after their start date
                     return true;
                 }
             }
             return false;
         }) || [];

         return tasks;
     };
    
    const tasksForDate = getTasksForDate(viewDate).sort((a, b) => {
        // Tasks without time come first
        if (!a.time && b.time) return -1;
        if (a.time && !b.time) return 1;
        if (!a.time && !b.time) return 0;
        // Then sort by time
        const timeA = moment(a.time, 'h:mm A');
        const timeB = moment(b.time, 'h:mm A');
        return timeA.diff(timeB);
    });



    const handleLocationChange = (location) => {
        const trimmed = location.slice(0, 10);
        setLocationInput(trimmed);
    };

    const handleLocationBlur = () => {
        onUpdateVisit({ ...visit, location: locationInput });
    };

    const handleCompleteTask = (taskIndex) => {
        const task = visit.scheduled_tasks[taskIndex];
        const today = moment().format('YYYY-MM-DD');

        // Derive initials from current user's name (use stored initials if available)
        const name = currentUser?.full_name || '';
        const initials = currentUser?.initials || name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase() || '?';
        const timestamp = moment().format('h:mm A');

        // "As Needed" tasks: just log the administration, never mark as completed
        if (task.is_as_needed) {
            const careLog = [...(visit.care_log || []), {
                time: timestamp,
                date: today,
                activity: task.medication_name ? `${task.medication_name} (As Needed)` : 'Medication (As Needed)',
                notes: task.notes || '',
                staff: initials
            }];
            onUpdateVisit({ ...visit, care_log: careLog });
            return;
        }

        // If already completed today, toggle it back to incomplete
        if (task.completed) {
            const updatedTasks = [...visit.scheduled_tasks];
            updatedTasks[taskIndex] = {
                ...updatedTasks[taskIndex],
                completed: false,
                completed_at: null,
                completed_by: null,
                completed_date: null,
                completed_iso: null
            };
            onUpdateVisit({ ...visit, scheduled_tasks: updatedTasks });
            return;
        }



        const updatedTasks = [...visit.scheduled_tasks];
        updatedTasks[taskIndex] = {
            ...updatedTasks[taskIndex],
            completed: true,
            completed_at: timestamp,
            completed_iso: new Date().toISOString(),
            completed_by: initials,
            completed_date: today
        };

        const careLog = [...(visit.care_log || []), {
            time: timestamp,
            date: today,
            activity: updatedTasks[taskIndex].type,
            notes: updatedTasks[taskIndex].medication_name 
                ? `Gave ${updatedTasks[taskIndex].medication_name}` 
                : '',
            staff: initials
        }];

        // Check if this task resolves the emergency alert
        let updateObj = { ...visit, scheduled_tasks: updatedTasks, care_log: careLog };
        if (visit.emergency_alert_active && (task.type === 'Need Feces' || task.type === 'Need Urine' || task.type === 'Collect Feces' || task.type === 'Collect Urine')) {
            updateObj.emergency_alert_active = false;
            updateObj.emergency_alert_type = null;
            updateObj.emergency_alert_dismissed_until = null;
        }

        // If this is a "Need Feces" task, mark it as completed and it persists
         if (task.type === 'Need Feces') {
             updatedTasks[taskIndex].completed = true;
             updatedTasks[taskIndex].completed_at = timestamp;
             updatedTasks[taskIndex].completed_by = initials;
             onUpdateVisit(updateObj);
             return;
         }

        // If this is a "Collect Urine" task, mark it as collected
         if (task.type === 'Collect Urine') {
             updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], completed: true, completed_at: timestamp, completed_by: initials };
             const filteredTasks = updatedTasks.filter(t => t.type !== 'Collect Urine' || t === updatedTasks[taskIndex]);
             onUpdateVisit({ ...updateObj, scheduled_tasks: filteredTasks });
             return;
         }

        // If this is a "Collect Feces" task, mark it as collected and update visit status
         if (task.type === 'Collect Feces') {
             // Mark as completed and don't add more instances for remaining days
             updatedTasks[taskIndex] = {
                 ...updatedTasks[taskIndex],
                 completed: true,
                 completed_at: timestamp,
                 completed_by: initials
             };
             // Remove all future "Collect Feces" tasks since fecal collection is done
             const filteredTasks = updatedTasks.filter(t => {
                 if (t.type === 'Collect Feces' && t !== updatedTasks[taskIndex]) {
                     return false; // Remove future feces tasks
                 }
                 return true;
             });
             onUpdateVisit({ ...updateObj, scheduled_tasks: filteredTasks, fecal_collected: true });
             return;
         }

        // If this is a Play Session task, auto-complete nearby Walk tasks (within 60 min)
        if (task.type && task.type.toLowerCase().includes('play')) {
            const taskMoment = task.time ? moment(task.time, 'h:mm A') : moment();
            const taskDate = task.date || today;
            updatedTasks.forEach((t, i) => {
                if (t.completed) return;
                if (!t.type?.toLowerCase().includes('walk')) return;
                if ((t.date || taskDate) !== taskDate) return;
                const walkTime = t.time ? moment(t.time, 'h:mm A') : null;
                if (!walkTime) return;
                const diffMins = Math.abs(walkTime.diff(taskMoment, 'minutes'));
                if (diffMins <= 60) {
                    updatedTasks[i] = {
                        ...updatedTasks[i],
                        completed: true,
                        completed_at: timestamp,
                        completed_iso: new Date().toISOString(),
                        completed_by: initials,
                        completed_date: today
                    };
                    updateObj.care_log = [...(updateObj.care_log || careLog), {
                        time: timestamp,
                        date: today,
                        activity: updatedTasks[i].type,
                        notes: 'Auto-completed with play session',
                        staff: initials
                    }];
                }
            });
            updateObj.scheduled_tasks = updatedTasks;
        }

        // Optimistic update
        onUpdateVisit(updateObj);
    };



    const handleUndoActivityLog = async (index) => {
         if (isSaving) return;
         setIsSaving(true);

         try {
             const logEntry = visit.care_log[index];
             const updatedCareLog = visit.care_log.filter((_, idx) => idx !== index);
             const updatedSessions = [...(visit.play_sessions || [])];

             // If it's a play session, restore it
             if (logEntry.type === 'play_session') {
                 updatedSessions.push({
                     session_number: logEntry.session_number,
                     completed: false,
                     completed_at: null,
                     completed_date: null
                 });
             }

             await onUpdateVisit({ ...visit, play_sessions: updatedSessions, care_log: updatedCareLog });
         } finally {
             setIsSaving(false);
         }
     };

    const handleAddActivity = () => {
        if (!newNotes) return;
        const initials = currentUser?.initials || currentUser?.full_name?.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase() || '?';
        const careLog = [...(visit.care_log || []), {
            time: moment().format('h:mm A'),
            activity: 'Note',
            notes: newNotes,
            staff: initials
        }];

        // Check if this activity mentions feces, urine, or ate, and clear alert if resolved
        let updateObj = { ...visit, care_log: careLog };
        if (visit.emergency_alert_active) {
            const notesLower = newNotes.toLowerCase();
            const alertTypes = visit.emergency_alert_type?.split(',') || [];
            const remaining = alertTypes.filter(t => {
                if (t === 'feces') return !notesLower.includes('feces');
                if (t === 'urine') return !notesLower.includes('urine');
                if (t === 'ate') return !notesLower.includes('ate');
                return true;
            });
            if (remaining.length === 0) {
                updateObj.emergency_alert_active = false;
                updateObj.emergency_alert_type = null;
                updateObj.emergency_alert_dismissed_until = null;
            } else if (remaining.length < alertTypes.length) {
                updateObj.emergency_alert_type = remaining.join(',');
            }
        }

        onUpdateVisit(updateObj);
        setNewActivity('');
        setNewNotes('');
    };



    const pictureSentDates = visit.picture_sent_dates || [];
    const isPictureSentToday = pictureSentDates.includes(viewDate);
    const pictureTakenDates = visit.picture_taken_dates || [];
    const pictureTakenToday = pictureTakenDates.find(p => p.date === viewDate);

    const handleTakePicture = () => {
        const initials = currentUser?.initials || currentUser?.full_name?.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase() || '?';
        const careLog = [...(visit.care_log || []), {
            time: moment().format('h:mm A'),
            date: viewDate,
            activity: 'Picture Taken',
            notes: '',
            staff: initials
        }];
        const newTaken = [...pictureTakenDates.filter(p => p.date !== viewDate), { date: viewDate, initials }];
        onUpdateVisit({ ...visit, picture_taken_dates: newTaken, care_log: careLog });
    };

    const handleSendPicture = () => {
        const initials = currentUser?.initials || currentUser?.full_name?.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase() || '?';
        const careLog = [...(visit.care_log || []), {
            time: moment().format('h:mm A'),
            date: viewDate,
            activity: 'Daily Picture',
            notes: 'Picture sent to owner',
            staff: initials
        }];
        const newDates = [...pictureSentDates, viewDate];
        onUpdateVisit({ ...visit, picture_sent_dates: newDates, picture_sent: true, care_log: careLog });
    };

    const handleUndoSendPicture = () => {
        const newDates = pictureSentDates.filter(d => d !== viewDate);
        onUpdateVisit({ ...visit, picture_sent_dates: newDates, picture_sent: newDates.length > 0 });
    };
    
    const handleAddTask = () => {
         const effectiveTaskType = newTaskType === 'Other' ? customTaskType.trim() : newTaskType;
         if (!effectiveTaskType) return;

         // Expand recurring tasks into individual dated instances
         const stayStart = moment(newTaskDate);
         const stayEnd = visit.scheduled_checkout_date
             ? moment(visit.scheduled_checkout_date)
             : moment(visit.check_in_date).add(30, 'days');

         let dates = [];
         if (recurrenceType === 'none') {
             dates = [newTaskDate];
         } else if (recurrenceType === 'daily') {
             let d = stayStart.clone();
             while (d.isSameOrBefore(stayEnd, 'day')) {
                 dates.push(d.format('YYYY-MM-DD'));
                 d.add(1, 'day');
             }
         } else if (recurrenceType === 'every_other_day') {
             let d = stayStart.clone();
             while (d.isSameOrBefore(stayEnd, 'day')) {
                 dates.push(d.format('YYYY-MM-DD'));
                 d.add(2, 'days');
             }
         } else if (recurrenceType === 'every_3_days') {
             let d = stayStart.clone();
             while (d.isSameOrBefore(stayEnd, 'day')) {
                 dates.push(d.format('YYYY-MM-DD'));
                 d.add(3, 'days');
             }
         }

         const newInstances = dates.map(date => ({
             type: effectiveTaskType,
             time: newTaskTime,
             date,
             is_template: false,
             completed: false,
             completed_at: null,
             notes: newTaskNotes,
             recurrence_type: 'none', // each instance is a standalone one-time task
         }));

         if (editingTaskIdx !== null) {
             const updatedTasks = [...visit.scheduled_tasks];
             updatedTasks[editingTaskIdx] = { ...updatedTasks[editingTaskIdx], ...newInstances[0] };
             onUpdateVisit({ ...visit, scheduled_tasks: updatedTasks });
             setEditingTaskIdx(null);
         } else {
             const updatedTasks = [...(visit.scheduled_tasks || []), ...newInstances];
             onUpdateVisit({ ...visit, scheduled_tasks: updatedTasks });
         }

         setNewTaskType('');
         setCustomTaskType('');
         setNewTaskTime('');
         setNewTaskNotes('');
         setNewTaskDate(viewDate);
         setRecurrenceType('none');
         setAddingTask(false);
     };

     const EDITABLE_TASK_TYPES = ['Collect Feces', 'Collect Urine', 'Bath', 'Extra walk', 'Nail trim'];

     const handleEditTask = (idx) => {
         const task = visit.scheduled_tasks[idx];
         if (!task) return;
         setEditingTaskIdx(idx);
         // If the task type isn't in the dropdown, use "Other" and pre-fill the custom type
         if (EDITABLE_TASK_TYPES.includes(task.type)) {
             setNewTaskType(task.type);
             setCustomTaskType('');
         } else {
             setNewTaskType('Other');
             setCustomTaskType(task.type);
         }
         setNewTaskTime(task.time || '');
         setNewTaskNotes(task.notes || '');
         setNewTaskDate(task.date || viewDate);
         setRecurrenceType('none'); // editing a single instance, no recurrence expansion
         setAddingTask(true);
         // Scroll the edit form into view after it renders
         setTimeout(() => {
             editFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
         }, 100);
     };

     const handleCancelEdit = () => {
         setEditingTaskIdx(null);
         setNewTaskType('');
         setCustomTaskType('');
         setNewTaskTime('');
         setNewTaskNotes('');
         setNewTaskDate(viewDate);
         setRecurrenceType('none');
         setAddingTask(false);
         };

    const handleAddPlayCamp = () => {
        const today = moment().format('YYYY-MM-DD');
        const totalSessions = playCampDuration === 'half_day' ? 2 : 4;
        const newSessionTasks = Array.from({ length: totalSessions }, (_, i) => ({
            type: 'Play Session',
            time: '',
            date: today,
            is_template: false,
            completed: false,
            completed_at: null,
            completed_by: null,
            notes: `Session ${i + 1}`
        }));
        onUpdateVisit({
            ...visit,
            play_camp_duration: playCampDuration,
            scheduled_tasks: [...(visit.scheduled_tasks || []), ...newSessionTasks]
        });
        setAddingPlayCamp(false);
    };

    const handleCancelTask = (taskIndex) => {
        if (!cancelTaskNote.trim()) return;
        const task = visit.scheduled_tasks[taskIndex];
        const initials = currentUser?.initials || currentUser?.full_name?.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase() || '?';
        const timestamp = moment().format('h:mm A');
        const taskLabel = task.type === 'Medication' ? task.medication_name : task.type;

        // Log cancellation to care log
        const careLog = [...(visit.care_log || []), {
            time: timestamp,
            date: today,
            activity: `${taskLabel} — Not Done`,
            notes: cancelTaskNote.trim(),
            staff: initials
        }];

        // Mark task as cancelled by removing it from scheduled_tasks (day-specific) or flagging it
        const updatedTasks = [...visit.scheduled_tasks];
        updatedTasks[taskIndex] = {
            ...updatedTasks[taskIndex],
            completed: true,
            cancelled: true,
            completed_at: timestamp,
            completed_by: initials,
            completed_date: today,
            cancel_note: cancelTaskNote.trim()
        };

        onUpdateVisit({ ...visit, scheduled_tasks: updatedTasks, care_log: careLog });
        setCancelTaskIdx(null);
        setCancelTaskNote('');
    };

    return (
        <>
        <PreliminaryReportDialog
            pet={pet}
            visit={visit}
            open={showPrelimReport}
            onClose={() => setShowPrelimReport(false)}
        />
        {isBoarding && (
            <EditCheckInDialog
                pet={pet}
                visit={visit}
                open={editCheckInOpen}
                onClose={() => setEditCheckInOpen(false)}
                onSave={onUpdateVisit}
            />
        )}
        <div className="h-screen flex flex-col max-h-screen overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-stone-100 flex-shrink-0" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl md:hidden">
                        <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex items-center gap-3">
                        {pet.photo_url ? (
                            <img src={pet.photo_url} alt={pet.name} className="w-10 h-10 rounded-xl object-cover" />
                        ) : (
                            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                                {pet.species === 'Cat' ? (
                                    <Cat className="w-5 h-5 text-amber-600" />
                                ) : (
                                    <Dog className="w-5 h-5 text-amber-600" />
                                )}
                            </div>
                        )}
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="font-bold text-lg text-stone-800">{pet.name}</h2>
                                {visit.emergency_alert_active && (
                                    <AlertCircle className="w-5 h-5 text-yellow-600" title={`Emergency: Missing ${visit.emergency_alert_type}`} />
                                )}
                            </div>
                            <p className="text-sm text-stone-500">
                                Checked in {moment(visit.check_in_time).format('h:mm A')}
                            </p>
                        </div>
                    </div>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl hidden md:flex">
                    <X className="w-5 h-5" />
                </Button>
            </div>

            <ScrollArea className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-4 pb-6">
                    {/* Emergency Alert */}
                    {visit.emergency_alert_active && (
                        <Card className="border-2 border-red-500 bg-red-100">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm flex items-center gap-2 text-red-900">
                                    <AlertCircle className="w-5 h-5 text-red-700" />
                                    EMERGENCY ALERT
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <p className="text-sm text-red-800">
                                                                    {(() => {
                                                                        const types = visit.emergency_alert_type?.split(',') || [];
                                                                        const labels = { feces: 'feces', urine: 'urine', ate: 'eating' };
                                                                        const missing = types.map(t => labels[t] || t).join(', ');
                                                                        return `No ${missing} observed in the last 48 hours`;
                                                                    })()}
                                                                </p>
                                {canDismissAlert && (
                                    <Button
                                        onClick={handleDismissEmergencyAlert}
                                        disabled={dismissingAlert}
                                        className="w-full rounded-xl bg-red-600 hover:bg-red-700"
                                    >
                                        {dismissingAlert ? 'Dismissing...' : 'Not an Emergency (24h)'}
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    )}
                    {/* Feeding & Medication Instructions */}
                    {(pet.feeding_instructions || pet.medications?.length > 0) && (
                        <Card className="border-0 shadow-sm rounded-2xl bg-blue-50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-blue-900">Care Instructions</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {pet.feeding_instructions && (
                                    <div>
                                        <p className="text-xs font-semibold text-blue-900 mb-1">Feeding:</p>
                                        <p className="text-sm text-blue-800">{pet.feeding_instructions}</p>
                                    </div>
                                )}
                                {(visit.visit_medications?.length > 0 || pet.medication_notes) && (
                                    <div>
                                        <p className="text-xs font-semibold text-blue-900 mb-1">Medications:</p>
                                        {pet.medication_notes && (
                                            <p className="text-xs text-blue-700 italic mb-1">{pet.medication_notes}</p>
                                        )}
                                        {visit.visit_medications?.map((med, idx) => (
                                            <div key={idx} className="text-sm text-blue-800 mb-1">
                                                • <strong>{med.name}</strong> - {med.dosage} ({med.frequency})
                                                {med.instructions && <span className="block ml-3 text-xs">{med.instructions}</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Location */}
                    <Card className="border-0 shadow-sm rounded-2xl">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-stone-400" />
                                Current Location
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Input
                                value={locationInput}
                                onChange={(e) => handleLocationChange(e.target.value)}
                                onBlur={handleLocationBlur}
                                placeholder="e.g., Yard 2"
                                maxLength={10}
                                className="rounded-xl"
                            />
                            <p className="text-xs text-stone-400 mt-1">Max 10 characters</p>
                        </CardContent>
                    </Card>

                    {/* Scheduled Tasks */}
                    {tasksForDate.length > 0 && (
                        <Card className="border-0 shadow-sm rounded-2xl">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-stone-400" />
                                    Schedule for {moment(viewDate).format('MMM D')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {tasksForDate.map((task, idx) => {
                                         const taskTime = task.time ? moment(task.time, 'h:mm A') : moment('9:00 PM', 'h:mm A');
                                         // Overdue: only on the task's own day, only before 9 PM lock
                                         const taskIsToday = viewDate === today;
                                         const isLocked = taskIsToday && isAfter9PM;
                                         const isOverdue = taskIsToday && !task.completed && !isAfter9PM && moment().isAfter(taskTime);
                                        const actualIdx = visit.scheduled_tasks?.findIndex(t => t === task);
                                        const recurrenceLabel = '';
                                        
                                        return (
                                            <React.Fragment key={idx}>
                                            <div 
                                               className={`flex items-center justify-between p-2 rounded-xl border ${
                                                   task.is_as_needed
                                                       ? 'bg-purple-50 border-purple-200'
                                                       : task.cancelled
                                                       ? 'bg-stone-50 border-stone-200 opacity-60'
                                                       : task.completed 
                                                       ? 'bg-emerald-50 border-emerald-200' 
                                                       : isOverdue 
                                                       ? 'bg-rose-50 border-rose-200' 
                                                       : 'bg-white border-stone-200'
                                               }`}
                                            >
                                                <div className="flex-1">
                                                    <p className={`text-sm font-medium ${
                                                         task.is_as_needed
                                                             ? 'text-purple-700'
                                                             : task.cancelled
                                                             ? 'line-through text-stone-400'
                                                             : task.completed 
                                                             ? 'text-emerald-700' 
                                                             : isOverdue 
                                                             ? 'text-rose-700' 
                                                             : 'text-stone-700'
                                                     }`}>
                                                        {task.time ? `${task.time} - ` : ''}{task.type === 'Medication' ? task.medication_name : task.type}
                                                        {task.is_as_needed && <span className="text-xs ml-1 text-purple-500">(as needed)</span>}
                                                        {!task.is_as_needed && !task.is_template && <span className="text-xs ml-1">(custom)</span>}
                                                        {recurrenceLabel && <span className="text-xs text-stone-500 ml-1">{recurrenceLabel}</span>}
                                                    </p>
                                                    {task.type === 'Medication' && (() => {
                                                        const med = visit.visit_medications?.find(m => m.name === task.medication_name);
                                                        const parts = [med?.dosage, med?.instructions].filter(Boolean);
                                                        return parts.length > 0 ? (
                                                            <p className="text-xs text-purple-700 font-medium">{parts.join(' — ')}</p>
                                                        ) : null;
                                                    })()}
                                                    {task.notes && (
                                                        <p className="text-xs text-stone-500">{task.notes}</p>
                                                    )}
                                                    {task.completed && !task.cancelled && (
                                                        <p className="text-xs text-emerald-600">
                                                            Done at {task.completed_at} by {task.completed_by || '?'}
                                                        </p>
                                                    )}
                                                    {task.cancelled && (
                                                        <p className="text-xs text-stone-400">Not done — {task.cancel_note}</p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 ml-2">
                                                    {!task.cancelled && (
                                                        <Button 
                                                            size="sm" 
                                                            variant="ghost"
                                                            onClick={() => handleEditTask(actualIdx)}
                                                            className="rounded-xl h-7 text-xs text-stone-600 hover:bg-stone-100"
                                                        >
                                                            Edit
                                                        </Button>
                                                    )}
                                                    {task.is_as_needed && taskIsToday && (
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleCompleteTask(actualIdx)}
                                                            className="rounded-xl h-7 text-xs bg-purple-600 hover:bg-purple-700"
                                                        >
                                                            Give
                                                        </Button>
                                                    )}
                                                    {!task.is_as_needed && !task.cancelled && taskIsToday && !isLocked && (
                                                       task.completed && confirmUndoTaskIdx === actualIdx ? (
                                                           <div className="flex items-center gap-1">
                                                               <span className="text-xs text-stone-500">Sure?</span>
                                                               <Button size="sm" onClick={() => { handleCompleteTask(actualIdx); setConfirmUndoTaskIdx(null); }} className="rounded-xl h-7 text-xs bg-rose-500 hover:bg-rose-600">Yes</Button>
                                                               <Button size="sm" variant="outline" onClick={() => setConfirmUndoTaskIdx(null)} className="rounded-xl h-7 text-xs">No</Button>
                                                           </div>
                                                       ) : (
                                                           <>
                                                           <Button 
                                                               size="sm" 
                                                               onClick={() => task.completed ? setConfirmUndoTaskIdx(actualIdx) : handleCompleteTask(actualIdx)}
                                                               variant={task.completed ? "outline" : "default"}
                                                               className={`rounded-xl h-7 text-xs ${
                                                                   task.completed
                                                                       ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                                                                       : isOverdue 
                                                                       ? 'bg-rose-500 hover:bg-rose-600' 
                                                                       : 'bg-stone-700 hover:bg-stone-800'
                                                               }`}
                                                           >
                                                               {task.completed ? 'Undo' : 'Complete'}
                                                           </Button>
                                                           {!task.completed && (
                                                               <Button
                                                                   size="sm"
                                                                   variant="ghost"
                                                                   onClick={() => { setCancelTaskIdx(actualIdx); setCancelTaskNote(''); }}
                                                                   className="rounded-xl h-7 text-xs text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                                                               >
                                                                   Cancel
                                                               </Button>
                                                           )}
                                                           </>
                                                       )
                                                    )}
                                                    {!task.is_as_needed && !task.cancelled && taskIsToday && isLocked && (
                                                        <span className="text-xs text-stone-400 italic">Locked</span>
                                                    )}
                                                </div>
                                            </div>
                                            {cancelTaskIdx === actualIdx && (
                                                <div className="mt-1 p-2 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                                                    <p className="text-xs font-medium text-rose-700">Why is this task not being done?</p>
                                                    <Textarea
                                                        autoFocus
                                                        placeholder="Enter reason..."
                                                        value={cancelTaskNote}
                                                        onChange={(e) => setCancelTaskNote(e.target.value)}
                                                        className="rounded-xl text-xs"
                                                        rows={2}
                                                    />
                                                    <div className="flex gap-2">
                                                        <Button size="sm" variant="outline" onClick={() => { setCancelTaskIdx(null); setCancelTaskNote(''); }} className="flex-1 rounded-xl h-7 text-xs">
                                                            Back
                                                        </Button>
                                                        <Button size="sm" onClick={() => handleCancelTask(actualIdx)} disabled={!cancelTaskNote.trim()} className="flex-1 rounded-xl h-7 text-xs bg-rose-500 hover:bg-rose-600">
                                                            Confirm
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                            </React.Fragment>
                                            );
                                            })}
                                            </CardContent>
                                            </Card>
                                            )}

                                            {/* Add Play Camp — only for boarding pets without play camp */}
                                            {isBoarding && !visit.play_camp_duration && (
                                            <Card className="border-0 shadow-sm rounded-2xl border-2 border-dashed border-emerald-400/50">
                                            <CardHeader className="pb-2">
                                            <CardTitle className="text-sm flex items-center gap-2">
                                            <Sparkles className="w-4 h-4 text-emerald-500" />
                                            Add Play Camp
                                            </CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-2">
                                            {!addingPlayCamp ? (
                                            <Button
                                            size="sm"
                                            onClick={() => setAddingPlayCamp(true)}
                                            variant="outline"
                                            className="w-full rounded-xl border-emerald-400/50 text-emerald-600 hover:bg-emerald-50"
                                            >
                                            <Sparkles className="w-4 h-4 mr-2" />
                                            Add Play Camp Today
                                            </Button>
                                            ) : (
                                            <>
                                            <Select value={playCampDuration} onValueChange={setPlayCampDuration}>
                                            <SelectTrigger className="rounded-xl">
                                               <SelectValue placeholder="Select duration" />
                                            </SelectTrigger>
                                            <SelectContent>
                                               <SelectItem value="half_day">Half Day (2 sessions)</SelectItem>
                                               <SelectItem value="full_day">Full Day (4 sessions)</SelectItem>
                                            </SelectContent>
                                            </Select>
                                            <div className="flex gap-2">
                                            <Button size="sm" variant="outline" onClick={() => setAddingPlayCamp(false)} className="flex-1 rounded-xl">
                                               Cancel
                                            </Button>
                                            <Button size="sm" onClick={handleAddPlayCamp} className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700">
                                               Confirm
                                            </Button>
                                            </div>
                                            </>
                                            )}
                                            </CardContent>
                                            </Card>
                                            )}

                                            {/* Add Custom Task */}
                                            <Card ref={editFormRef} className={`border-0 shadow-sm rounded-2xl border-2 border-dashed ${editingTaskIdx !== null ? 'border-[#82bb32]' : 'border-[#82bb32]/40'}`}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Plus className="w-4 h-4 text-[#82bb32]" />
                                {editingTaskIdx !== null ? 'Edit Task' : `Add Task to ${moment(viewDate).format('MMM D')}`}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {!addingTask ? (
                                <Button 
                                    size="sm" 
                                    onClick={() => setAddingTask(true)}
                                    variant="outline"
                                    className="w-full rounded-xl border-[#82bb32]/40 text-[#82bb32] hover:bg-[#82bb32]/10"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Custom Task
                                </Button>
                            ) : (
                                <>
                                    <div>
                                        <Label className="text-xs text-stone-600 mb-1 block">Date *</Label>
                                        <Input
                                            type="date"
                                            value={newTaskDate}
                                            onChange={(e) => setNewTaskDate(e.target.value)}
                                            min={moment(visit.check_in_date).format('YYYY-MM-DD')}
                                            max={visit.scheduled_checkout_date}
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <Select value={newTaskType} onValueChange={setNewTaskType}>
                                       <SelectTrigger className="rounded-xl">
                                             <SelectValue placeholder="Select task type" />
                                         </SelectTrigger>
                                         <SelectContent>
                                             <SelectItem value="Collect Feces">Collect Feces</SelectItem>
                                         <SelectItem value="Collect Urine">Collect Urine</SelectItem>
                                             <SelectItem value="Bath">Bath</SelectItem>
                                             <SelectItem value="Extra walk">Extra walk</SelectItem>
                                             <SelectItem value="Nail trim">Nail trim</SelectItem>
                                             <SelectItem value="Other">Other (type below)</SelectItem>
                                         </SelectContent>
                                      </Select>
                                    {newTaskType === 'Other' && (
                                       <Input
                                             placeholder="Enter custom task type"
                                             value={customTaskType}
                                             onChange={(e) => setCustomTaskType(e.target.value)}
                                             className="rounded-xl"
                                         />
                                      )}
                                    {newTaskType !== 'Collect Feces' && (
                                         <Input
                                              placeholder="Time (optional, e.g., 2:00 PM)"
                                              value={newTaskTime}
                                              onChange={(e) => setNewTaskTime(e.target.value)}
                                              className="rounded-xl"
                                          />
                                      )}
                                    <Textarea
                                        placeholder="Notes (optional)"
                                        value={newTaskNotes}
                                        onChange={(e) => setNewTaskNotes(e.target.value)}
                                        className="rounded-xl"
                                        rows={2}
                                    />
                                    <div className="space-y-2 pt-2 border-t border-stone-200">
                                        <Label className="text-xs text-stone-600">Repeat (optional)</Label>
                                        <Select value={recurrenceType} onValueChange={setRecurrenceType}>
                                            <SelectTrigger className="rounded-xl">
                                                <SelectValue placeholder="No repeat" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">No repeat (one day only)</SelectItem>
                                                <SelectItem value="daily">Daily (every day of stay)</SelectItem>
                                                <SelectItem value="every_other_day">Every other day</SelectItem>
                                                <SelectItem value="every_3_days">Every 3 days</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex gap-2">
                                         <Button 
                                              size="sm" 
                                              variant="outline"
                                              onClick={handleCancelEdit}
                                              className="flex-1 rounded-xl"
                                          >
                                              Cancel
                                          </Button>
                                          <Button 
                                              size="sm" 
                                              onClick={handleAddTask}
                                              disabled={!newTaskType || (newTaskType === 'Other' && !customTaskType.trim())}
                                              className="flex-1 rounded-xl bg-[#82bb32] hover:bg-[#82bb32]/90"
                                          >
                                              {editingTaskIdx !== null ? 'Save Changes' : 'Add'}
                                          </Button>
                                      </div>
                                  </>
                            )}
                        </CardContent>
                    </Card>



                    {/* Daily Picture — only show for today, only if pet wants pictures */}
                     {viewDate === today && pet.daily_picture && (
                     <Card className="border-0 shadow-sm rounded-2xl">
                         <CardHeader className="pb-2">
                             <CardTitle className="text-sm flex items-center gap-2">
                                 <Camera className="w-4 h-4 text-blue-500" />
                                 Daily Picture
                             </CardTitle>
                         </CardHeader>
                         <CardContent className="space-y-2">
                             {/* Picture Taken row */}
                             {pictureTakenToday ? (
                                 <div className="flex items-center gap-2 text-sky-700 bg-sky-50 p-2 rounded-lg">
                                     <CheckCircle2 className="w-4 h-4" />
                                     <span className="text-sm font-medium">Picture Taken — {pictureTakenToday.initials}</span>
                                 </div>
                             ) : (
                                 <Button
                                     size="sm"
                                     onClick={handleTakePicture}
                                     className="w-full rounded-xl bg-sky-500 hover:bg-sky-600 h-8 text-xs"
                                 >
                                     Picture Taken
                                 </Button>
                             )}
                             {/* Photo Sent row */}
                             {isPictureSentToday ? (
                                 <div className="flex items-center justify-between gap-3">
                                     <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 p-2 rounded-lg flex-1">
                                         <CheckCircle2 className="w-4 h-4" />
                                         <span className="text-sm font-medium">Photo Sent to {pet.owner_name}</span>
                                     </div>
                                     <Button 
                                         size="sm" 
                                         variant="outline"
                                         onClick={handleUndoSendPicture}
                                         className="rounded-xl h-8 text-xs text-stone-600 hover:bg-stone-100"
                                     >
                                         Undo
                                     </Button>
                                 </div>
                             ) : (
                                 <Button 
                                     size="sm" 
                                     onClick={handleSendPicture}
                                     className="w-full rounded-xl bg-blue-500 hover:bg-blue-600 h-8 text-xs"
                                 >
                                     Photo Sent
                                 </Button>
                             )}
                         </CardContent>
                     </Card>
                     )}

                    {/* Ate Meal Notes */}
                    {(() => {
                        const ateMealTasks = tasksForDate.filter(t => t.type === 'Ate Meal');
                        return ateMealTasks.length > 0 ? (
                            <Card className="border-0 shadow-sm rounded-2xl">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm flex items-center gap-2">
                                        <Plus className="w-4 h-4 text-stone-400" />
                                        Meal Notes
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {ateMealTasks.map((task, idx) => (
                                        <div key={idx} className="space-y-1">
                                            <Label className="text-xs text-stone-600">{task.time}</Label>
                                            <Textarea
                                                placeholder={`Notes for meal at ${task.time}`}
                                                value={task.notes || ''}
                                                onChange={(e) => {
                                                     const updated = [...visit.scheduled_tasks];
                                                     const taskIdx = updated.findIndex(t => t === task);
                                                     if (taskIdx >= 0) updated[taskIdx].notes = e.target.value;
                                                     onUpdateVisit({ ...visit, scheduled_tasks: updated });
                                                 }}
                                                className="rounded-xl text-xs"
                                                rows={2}
                                            />
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        ) : null;
                    })()}

                    {/* Add Activity */}
                    <Card className="border-0 shadow-sm rounded-2xl">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Plus className="w-4 h-4 text-stone-400" />
                                Log Activity
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Textarea
                                placeholder="Notes"
                                value={newNotes}
                                onChange={(e) => setNewNotes(e.target.value)}
                                className="rounded-xl"
                                rows={2}
                            />
                            <Button 
                                onClick={handleAddActivity}
                                disabled={!newNotes}
                                className="w-full rounded-xl bg-stone-800 hover:bg-stone-900"
                            >
                                Add Activity
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Care Log */}
                    {visit.care_log?.length > 0 && (
                        <Card className="border-0 shadow-sm rounded-2xl">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-stone-400" />
                                    Activity Log
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {[...visit.care_log].reverse().map((log, i) => {
                                        const actualIdx = visit.care_log.length - 1 - i;
                                        return (
                                            <div key={i} className="flex gap-3 text-sm items-start group">
                                                 <div className="flex flex-col shrink-0 w-16">
                                                     {log.date && <span className="text-stone-400 text-xs">{moment(log.date).format('MMM D')}</span>}
                                                     <span className="text-stone-400 text-xs">{log.time}</span>
                                                 </div>
                                                 <div className="flex-1">
                                                     <span className="font-medium text-stone-700">{log.activity}</span>
                                                     {log.notes && (
                                                         <p className="text-xs text-stone-500">{log.notes}</p>
                                                     )}
                                                 </div>
                                                 <div className="flex items-center gap-2">
                                                     {log.staff && (
                                                         <span className="text-stone-500 text-xs font-semibold bg-stone-100 px-2 py-1 rounded">{log.staff}</span>
                                                     )}
                                                     {confirmUndoLogIdx === actualIdx ? (
                                                         <div className="flex items-center gap-1">
                                                             <span className="text-xs text-stone-500">Sure?</span>
                                                             <Button size="sm" onClick={() => { handleUndoActivityLog(actualIdx); setConfirmUndoLogIdx(null); }} disabled={isSaving} className="rounded-xl h-6 text-xs bg-rose-500 hover:bg-rose-600 text-white">Yes</Button>
                                                             <Button size="sm" variant="outline" onClick={() => setConfirmUndoLogIdx(null)} className="rounded-xl h-6 text-xs">No</Button>
                                                         </div>
                                                     ) : (
                                                         <Button
                                                             size="sm"
                                                             variant="ghost"
                                                             onClick={() => setConfirmUndoLogIdx(actualIdx)}
                                                             disabled={isSaving}
                                                             className="rounded-xl h-6 text-xs text-stone-400 hover:text-stone-600 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                                                         >
                                                             Undo
                                                         </Button>
                                                     )}
                                                 </div>
                                             </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-4 border-t border-stone-100 flex-shrink-0 bg-white space-y-2" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                {isBoarding && (
                    <Button
                        variant="outline"
                        onClick={() => setEditCheckInOpen(true)}
                        className="w-full rounded-xl h-10 border-stone-200 text-stone-600 hover:bg-stone-50"
                    >
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit Check-In Options
                    </Button>
                )}
                <Button 
                    variant="outline"
                    onClick={() => setShowPrelimReport(true)}
                    className="w-full rounded-xl h-10 border-blue-200 text-blue-600 hover:bg-blue-50"
                >
                    <FileText className="w-4 h-4 mr-2" />
                    View Preliminary Report
                </Button>
                <Button 
                    onClick={onCheckout}
                    className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 h-12"
                >
                    <FileText className="w-4 h-4 mr-2" />
                    Check Out & Generate Report
                </Button>
            </div>
        </div>
        </>
    );
}