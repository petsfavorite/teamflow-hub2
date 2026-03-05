import React, { useState } from 'react';
import PreliminaryReportDialog from './PreliminaryReportDialog';
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
    CheckCircle2, Plus, X, FileText, Camera, Sparkles, ChevronLeft
} from "lucide-react";
import moment from "moment";

export default function VisitPanel({ pet, visit, onUpdateVisit, onClose, onCheckout, selectedDate, queryClient }) {
    const [newActivity, setNewActivity] = useState('');
    const [newNotes, setNewNotes] = useState('');
    const [locationInput, setLocationInput] = useState(visit?.location || '');
    const [addingPlayCamp, setAddingPlayCamp] = useState(false);
    const [playCampDuration, setPlayCampDuration] = useState('full_day');
    const [addingTask, setAddingTask] = useState(false);
    const [newTaskType, setNewTaskType] = useState('');
    const [newTaskTime, setNewTaskTime] = useState('');
    const [newTaskNotes, setNewTaskNotes] = useState('');
    const viewDate = selectedDate || moment().format('YYYY-MM-DD');
    const [newTaskDate, setNewTaskDate] = useState(viewDate);
    const [showPrelimReport, setShowPrelimReport] = useState(false);
    const isBoarding = visit.visit_type === 'boarding';

    const isCat = pet.species === 'Cat';
    const isPlayCamp = visit.visit_type === 'play_camp';
    
    // Get tasks for the current viewing date
    const getTasksForDate = (date) => {
        const isCheckInDay = moment(visit.check_in_date).format('YYYY-MM-DD') === date;
        const checkInTime = moment(visit.check_in_time);
        
        // Check if there's an uncompleted "Collect Feces" from yesterday
        const yesterday = moment(date).subtract(1, 'day').format('YYYY-MM-DD');
        const yesterdayTasks = visit.scheduled_tasks?.filter(task => {
            if (task.type !== 'Collect Feces') return false;
            if (task.date) return task.date === yesterday;
            if (task.is_template) {
                const visitStart = moment(visit.check_in_date);
                const visitEnd = visit.scheduled_checkout_date ? moment(visit.scheduled_checkout_date) : moment().add(30, 'days');
                const yesterdayDate = moment(yesterday);
                return yesterdayDate.isBetween(visitStart, visitEnd, 'day', '[]');
            }
            return false;
        }) || [];
        
        const hasUncompletedFecesFromYesterday = yesterdayTasks.some(task => !task.completed || !task.collected);
        
        let tasks = visit.scheduled_tasks?.filter(task => {
            // Date-specific tasks
            if (task.date) {
                return task.date === date;
            }
            // Template tasks appear every day the pet is staying
            if (task.is_template) {
                const visitStart = moment(visit.check_in_date);
                const visitEnd = visit.scheduled_checkout_date ? moment(visit.scheduled_checkout_date) : moment().add(30, 'days');
                const currentDate = moment(date);
                
                if (currentDate.isBetween(visitStart, visitEnd, 'day', '[]')) {
                    // On check-in day, only show tasks after check-in time
                    if (isCheckInDay) {
                        const taskTime = moment(task.time, 'h:mm A');
                        return taskTime.isAfter(checkInTime);
                    }
                    return true;
                }
            }
            return false;
        }) || [];
        
        // Add rolled-over "Collect Feces" from yesterday if needed
        if (hasUncompletedFecesFromYesterday && date === moment().format('YYYY-MM-DD')) {
            const alreadyHasCollectFeces = tasks.some(t => t.type === 'Collect Feces');
            if (!alreadyHasCollectFeces) {
                tasks.push({
                    type: 'Collect Feces',
                    time: '',
                    is_template: true,
                    completed: false,
                    completed_at: null,
                    collected: false,
                    rolled_over: true
                });
            }
        }
        
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
        onUpdateVisit({ ...visit, location: trimmed });
    };

    const handleCompleteTask = (taskIndex) => {
        const task = visit.scheduled_tasks[taskIndex];
        
        // If already completed, toggle it back to incomplete
        if (task.completed) {
            const updatedTasks = [...visit.scheduled_tasks];
            updatedTasks[taskIndex] = {
                ...updatedTasks[taskIndex],
                completed: false,
                completed_at: null,
                completed_by: null
            };
            // Optimistic update
            onUpdateVisit({ ...visit, scheduled_tasks: updatedTasks });
            return;
        }
        
        // Ask for initials
        const initials = prompt('Enter your initials:');
        if (!initials) return;
        
        // Ask for notes if this is "Observed feces"
        let fecesNotes = '';
        if (task.type === 'Observed feces') {
            fecesNotes = prompt('Any notes about feces? (optional)') || '';
        }
        
        const updatedTasks = [...visit.scheduled_tasks];
        updatedTasks[taskIndex] = {
            ...updatedTasks[taskIndex],
            completed: true,
            completed_at: moment().format('h:mm A'),
            completed_iso: new Date().toISOString(),
            completed_by: initials.toUpperCase(),
            notes: fecesNotes || updatedTasks[taskIndex].notes
        };
        
        const careLog = [...(visit.care_log || []), {
            time: moment().format('h:mm A'),
            activity: updatedTasks[taskIndex].type,
            notes: updatedTasks[taskIndex].medication_name 
                ? `Gave ${updatedTasks[taskIndex].medication_name} (${initials.toUpperCase()})` 
                : fecesNotes 
                ? `${fecesNotes} (${initials.toUpperCase()})` 
                : `Completed (${initials.toUpperCase()})`
        }];
        
        // If this is a "Collect Feces" task, mark it as collected so it doesn't carry over
        if (task.type === 'Collect Feces') {
            updatedTasks[taskIndex].collected = true;
        }
        
        // Optimistic update
        onUpdateVisit({ ...visit, scheduled_tasks: updatedTasks, care_log: careLog });
    };

    const handleCompletePlaySession = (sessionIndex) => {
        const updatedSessions = [...visit.play_sessions];
        updatedSessions[sessionIndex] = {
            ...updatedSessions[sessionIndex],
            completed: true,
            completed_at: moment().format('h:mm A'),
            completed_date: moment().format('YYYY-MM-DD')
        };
        
        const careLog = [...(visit.care_log || []), {
            time: moment().format('h:mm A'),
            activity: `Play Session ${updatedSessions[sessionIndex].session_number}`,
            notes: 'Completed play session',
            staff: ''
        }];
        
        onUpdateVisit({ ...visit, play_sessions: updatedSessions, care_log: careLog });
    };

    const handleAddPlayCampToBoarding = () => {
        const playSessions = Array.from(
            { length: playCampDuration === 'half_day' ? 2 : 4 }, 
            (_, i) => ({
                session_number: i + 1,
                completed: false,
                completed_at: null
            })
        );
        
        onUpdateVisit({ 
            ...visit, 
            play_sessions: playSessions,
            play_camp_duration: playCampDuration
        });
        setAddingPlayCamp(false);
    };

    const handleAddActivity = () => {
        if (!newNotes) return;
        const careLog = [...(visit.care_log || []), {
            time: moment().format('h:mm A'),
            activity: 'Note',
            notes: newNotes,
            staff: ''
        }];
        onUpdateVisit({ ...visit, care_log: careLog });
        setNewActivity('');
        setNewNotes('');
    };



    const handleSendPicture = () => {
        const careLog = [...(visit.care_log || []), {
            time: moment().format('h:mm A'),
            activity: 'Daily Picture',
            notes: 'Picture sent to owner',
            staff: ''
        }];
        onUpdateVisit({ ...visit, picture_sent: true, care_log: careLog });
    };
    
    const handleAddTask = () => {
        if (!newTaskType) return;
        
        const newTask = {
            type: newTaskType,
            time: newTaskTime,
            date: newTaskDate,
            is_template: false,
            completed: false,
            completed_at: null,
            notes: newTaskNotes,
            collected: false
        };
        
        const updatedTasks = [...(visit.scheduled_tasks || []), newTask];
        onUpdateVisit({ ...visit, scheduled_tasks: updatedTasks });
        
        setNewTaskType('');
        setNewTaskTime('');
        setNewTaskNotes('');
        setNewTaskDate(viewDate);
        setAddingTask(false);
    };

    return (
        <>
        <PreliminaryReportDialog
            pet={pet}
            visit={visit}
            open={showPrelimReport}
            onClose={() => setShowPrelimReport(false)}
        />
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
                            <h2 className="font-bold text-lg text-stone-800">{pet.name}</h2>
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
                                        const taskTime = moment(task.time, 'h:mm A');
                                        const isOverdue = viewDate === moment().format('YYYY-MM-DD') && !task.completed && moment().isAfter(taskTime);
                                        const actualIdx = visit.scheduled_tasks?.findIndex(t => t === task);
                                        
                                        return (
                                            <div 
                                                key={idx}
                                                className={`flex items-center justify-between p-2 rounded-xl border ${
                                                    task.completed 
                                                        ? 'bg-emerald-50 border-emerald-200' 
                                                        : isOverdue 
                                                        ? 'bg-rose-50 border-rose-200' 
                                                        : 'bg-stone-50 border-stone-200'
                                                }`}
                                            >
                                                <div>
                                                    <p className={`text-sm font-medium ${
                                                        task.completed 
                                                            ? 'text-emerald-700' 
                                                            : isOverdue 
                                                            ? 'text-rose-700' 
                                                            : 'text-stone-700'
                                                    }`}>
                                                        {task.time ? `${task.time} - ` : ''}{task.type === 'Medication' ? task.medication_name : task.type}
                                                        {!task.is_template && <span className="text-xs ml-1">(custom)</span>}
                                                    </p>
                                                    {task.notes && (
                                                        <p className="text-xs text-stone-500">{task.notes}</p>
                                                    )}
                                                    {task.completed && (
                                                        <p className="text-xs text-emerald-600">
                                                            Done at {task.completed_at} by {task.completed_by || '?'}
                                                        </p>
                                                    )}
                                                </div>
                                                {viewDate === moment().format('YYYY-MM-DD') && (
                                                    <Button 
                                                        size="sm" 
                                                        onClick={() => handleCompleteTask(actualIdx)}
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
                                                )}
                                            </div>
                                        );
                                    })}
                            </CardContent>
                        </Card>
                    )}
                    
                    {/* Add Custom Task */}
                    <Card className="border-0 shadow-sm rounded-2xl border-2 border-dashed border-[#82bb32]/40">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Plus className="w-4 h-4 text-[#82bb32]" />
                                Add Task to {moment(viewDate).format('MMM D')}
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
                                            <SelectItem value="Bath">Bath</SelectItem>
                                            <SelectItem value="Extra walk">Extra walk</SelectItem>
                                            <SelectItem value="Nail trim">Nail trim</SelectItem>
                                            <SelectItem value="Other">Other (type below)</SelectItem>
                                        </SelectContent>
                                     </Select>
                                    {newTaskType === 'Other' && (
                                       <Input
                                            placeholder="Enter custom task type"
                                            onChange={(e) => setNewTaskType(e.target.value)}
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
                                    <div className="flex gap-2">
                                         <Button 
                                             size="sm" 
                                             variant="outline"
                                             onClick={() => setAddingTask(false)}
                                             className="flex-1 rounded-xl"
                                         >
                                             Cancel
                                         </Button>
                                         <Button 
                                             size="sm" 
                                             onClick={handleAddTask}
                                             disabled={!newTaskType}
                                             className="flex-1 rounded-xl bg-[#82bb32] hover:bg-[#82bb32]/90"
                                         >
                                             Add
                                         </Button>
                                     </div>
                                 </>
                            )}
                        </CardContent>
                    </Card>

                    {/* Play Sessions */}
                    {visit.play_sessions && visit.play_sessions.length > 0 && (
                        <Card className="border-0 shadow-sm rounded-2xl">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-emerald-500" />
                                    Play Sessions
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {visit.play_sessions.map((session, idx) => {
                                     const completedToday = session.completed && session.completed_date === moment().format('YYYY-MM-DD');
                                     return (
                                         <div 
                                             key={idx}
                                             className={`flex items-center justify-between p-2 rounded-xl border ${
                                                 completedToday 
                                                     ? 'bg-emerald-50 border-emerald-200' 
                                                     : 'bg-purple-50 border-purple-200'
                                             }`}
                                         >
                                             <div className="flex items-center gap-2">
                                                 <Checkbox 
                                                     checked={completedToday}
                                                     onCheckedChange={() => !completedToday && handleCompletePlaySession(idx)}
                                                 />
                                                 <p className={`text-sm font-medium ${
                                                     completedToday ? 'text-emerald-700' : 'text-purple-700'
                                                 }`}>
                                                     Play Session {session.session_number}
                                                 </p>
                                             </div>
                                             {completedToday && (
                                                 <p className="text-xs text-emerald-600">
                                                     {session.completed_at}
                                                 </p>
                                             )}
                                         </div>
                                     );
                                 })}
                            </CardContent>
                        </Card>
                    )}

                    {/* Add Play Camp to Boarding */}
                    {isBoarding && (!visit.play_sessions || visit.play_sessions.length === 0) && (
                        <Card className="border-0 shadow-sm rounded-2xl border-2 border-dashed border-emerald-300">
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
                                        className="w-full rounded-xl border-emerald-300 text-emerald-600 hover:bg-emerald-50"
                                    >
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add Play Camp Template
                                    </Button>
                                ) : (
                                    <>
                                        <Select value={playCampDuration} onValueChange={setPlayCampDuration}>
                                            <SelectTrigger className="rounded-xl">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="half_day">Half Day (2 sessions)</SelectItem>
                                                <SelectItem value="full_day">Full Day (4 sessions)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <div className="flex gap-2">
                                            <Button 
                                                size="sm" 
                                                variant="outline"
                                                onClick={() => setAddingPlayCamp(false)}
                                                className="flex-1 rounded-xl"
                                            >
                                                Cancel
                                            </Button>
                                            <Button 
                                                size="sm" 
                                                onClick={handleAddPlayCampToBoarding}
                                                className="flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-600"
                                            >
                                                Add
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Daily Picture */}
                    {pet.daily_picture && (
                        <Card className="border-0 shadow-sm rounded-2xl">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <Camera className="w-4 h-4 text-blue-500" />
                                    Daily Picture
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {visit.picture_sent ? (
                                    <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 p-2 rounded-lg">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span className="text-sm font-medium">Picture sent to {pet.owner_name}</span>
                                    </div>
                                ) : (
                                    <Button 
                                        size="sm" 
                                        onClick={handleSendPicture}
                                        className="w-full rounded-xl bg-blue-500 hover:bg-blue-600 h-8 text-xs"
                                    >
                                        Mark Picture as Sent
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    )}

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
                                    {[...visit.care_log].reverse().map((log, i) => (
                                        <div key={i} className="flex gap-3 text-sm">
                                            <span className="text-stone-400 text-xs w-16 shrink-0">{log.time}</span>
                                            <div>
                                                <span className="font-medium text-stone-700">{log.activity}</span>
                                                {log.notes && (
                                                    <p className="text-xs text-stone-500">{log.notes}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-4 border-t border-stone-100 flex-shrink-0 bg-white space-y-2" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
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