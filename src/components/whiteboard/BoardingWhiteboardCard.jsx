import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
    Dog, Cat, Utensils, Pill, Camera, CheckCircle2, 
    AlertCircle, ChevronRight, Sparkles, Cake
} from "lucide-react";

const getPetAge = (birthday) => {
    if (!birthday) return null;
    const birth = moment(birthday);
    const now = moment();
    const years = now.diff(birth, 'years');
    const months = now.diff(birth.clone().add(years, 'years'), 'months');
    if (years === 0) return `${months}mo`;
    if (months === 0) return `${years}yr`;
    return `${years}yr ${months}mo`;
};
import { motion } from "framer-motion";
import moment from "moment";

const OVERDUE_EXEMPT_TYPES = ['Collect Feces', 'Collect Urine', 'Feces Observed', 'Ate', 'Urine Observed'];

const ownerLastName = (pet) => {
    if (!pet.owner_name) return '';
    const parts = pet.owner_name.trim().split(/\s+/);
    return parts.length > 1 ? ` (${parts[parts.length - 1]})` : '';
};

export default function BoardingWhiteboardCard({ pet, visit, onViewVisit }) {
    const hasMedications = pet.medications && pet.medications.length > 0;
    const isCat = pet.species === 'Cat';
    const [nowTick, setNowTick] = useState(() => moment());
    const now = nowTick;
    const checkInTime = moment(visit.check_in_time);

    useEffect(() => {
        const interval = setInterval(() => setNowTick(moment()), 15 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    // Get tasks that should be shown (only if checked in before the task time)
    const relevantTasks = (visit.scheduled_tasks || []).filter(task => {
        const taskTime = moment(task.time, 'h:mm A');
        // Show task if check-in was before the task time OR it's already completed
        return checkInTime.isBefore(taskTime) || task.completed;
    });

    // Sort tasks by time
    const sortedTasks = [...relevantTasks].sort((a, b) => {
        const timeA = moment(a.time, 'h:mm A');
        const timeB = moment(b.time, 'h:mm A');
        return timeA.diff(timeB);
    });

    const today = nowTick.format('YYYY-MM-DD');

    // Check if picture needs to be sent
    const needsPicture = pet.daily_picture && !visit.picture_sent;
    const pictureTakenToday = (visit.picture_taken_dates || []).find(p => p.date === today);
    const isPictureSentToday = (visit.picture_sent_dates || []).includes(today);
    const hasPendingFeces = (visit.scheduled_tasks || []).some(t => t.type === 'Collect Feces' && t.date === today && !t.completed);
    const hasPendingUrine = (visit.scheduled_tasks || []).some(t => t.type === 'Collect Urine' && t.date === today && !t.completed);

    const cutoff1930 = nowTick.clone().hour(19).minute(30).second(0);
    const hasOverdue = (visit.scheduled_tasks || []).some(task => {
        if (task.completed) return false;
        if (OVERDUE_EXEMPT_TYPES.includes(task.type)) return false;
        if (task.date && task.date !== today) return false;
        if (task.time) {
            const taskMoment = nowTick.clone().startOf('day').add(moment(task.time, 'h:mm A').diff(moment(task.time, 'h:mm A').clone().startOf('day')));
            return nowTick.isAfter(taskMoment);
        }
        return nowTick.isAfter(cutoff1930);
    });

    const cardColor = visit.emergency_alert_active 
        ? 'border-red-500 bg-red-200' 
        : hasPendingFeces
        ? 'border-amber-800 bg-amber-100'
        : hasPendingUrine
        ? 'border-yellow-400 bg-yellow-100'
        : hasOverdue
        ? 'border-purple-500 bg-purple-100'
        : 'border-stone-200 bg-stone-50';

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            layout
            className="w-full"
        >
            <Card className={`overflow-hidden border-2 transition-all duration-300 rounded-2xl hover:shadow-lg ${cardColor}`}>
                <CardContent className="p-0">
                    <div className="flex items-center">
                        {/* Left: Photo and Basic Info */}
                        <div className="flex items-center gap-3 p-4 border-r border-stone-200 min-w-[200px]">
                            <div className="relative">
                                {pet.photo_url ? (
                                    <img 
                                        src={pet.photo_url} 
                                        alt={pet.name}
                                        className="w-14 h-14 rounded-xl object-cover"
                                    />
                                ) : (
                                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                                        {isCat ? (
                                            <Cat className="w-7 h-7 text-blue-600" />
                                        ) : (
                                            <Dog className="w-7 h-7 text-blue-600" />
                                        )}
                                    </div>
                                )}

                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-base text-stone-800">{pet.name}{ownerLastName(pet)}</h3>
                                    {visit.emergency_alert_active && (
                                        <AlertCircle className="w-5 h-5 text-red-700 flex-shrink-0" title={`Emergency: Missing ${visit.emergency_alert_type?.split(',').join(', ')}`} />
                                    )}
                                </div>
                                {pet.special_needs && (
                                    <p className="text-xs text-amber-600 mb-1">⚠️ {pet.special_needs}</p>
                                )}
                                <p className="text-xs text-stone-500">
                                    {visit.location || 'Lobby'}
                                    {pet.birthday && <span className="ml-2 text-stone-400">· {getPetAge(pet.birthday)}</span>}
                                </p>
                                <div className="flex items-center gap-1 mt-1">
                                    <Badge className="bg-blue-100 text-blue-700 border-0 text-xs px-2 py-0">
                                        Boarding
                                    </Badge>
                                    {(visit.scheduled_tasks || []).some(t => t.type === 'Play Session' && t.date === moment().format('YYYY-MM-DD')) && (
                                        <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs px-2 py-0">
                                            <Sparkles className="w-2 h-2 mr-1" />
                                            Play
                                        </Badge>
                                    )}
                                    {hasPendingUrine && (
                                        <Badge className="bg-yellow-200 text-yellow-800 border-yellow-400 text-xs px-2 py-0">
                                            Need Urine Sample
                                        </Badge>
                                    )}
                                    {hasPendingFeces && (
                                        <Badge className="bg-amber-200 text-amber-800 border-amber-400 text-xs px-2 py-0">
                                            Need Fecal Sample
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Middle: Timeline Tasks */}
                        <div className="flex-1 p-4">
                            <div className="flex items-center gap-3 flex-wrap">
                                {sortedTasks.map((task, idx) => {
                                    const taskTime = moment(task.time, 'h:mm A');
                                    const isOverdue = !task.completed && now.isAfter(taskTime);
                                    const isCompleted = task.completed;

                                    return (
                                        <div 
                                            key={idx}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                                                isCompleted 
                                                    ? 'bg-emerald-50 border-emerald-200' 
                                                    : isOverdue 
                                                    ? 'bg-rose-100 border-rose-300' 
                                                    : 'bg-stone-50 border-stone-200'
                                            }`}
                                        >
                                            {isCompleted ? (
                                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                            ) : (
                                                <div className={`w-3 h-3 rounded-full border-2 ${
                                                    isOverdue ? 'border-rose-500 bg-rose-200' : 'border-stone-400'
                                                }`} />
                                            )}
                                            <span className={`text-xs font-medium ${
                                                isCompleted 
                                                    ? 'text-emerald-700' 
                                                    : isOverdue 
                                                    ? 'text-rose-700' 
                                                    : 'text-stone-700'
                                            }`}>
                                                {task.time} {task.type === 'Medication' ? task.medication_name : task.type}
                                                {isCompleted && task.completed_by && (
                                                    <span className="ml-1 font-bold">[{task.completed_by}]</span>
                                                )}
                                            </span>
                                        </div>
                                    );
                                })}



                                {/* Daily Picture */}
                                {pet.daily_picture && !isPictureSentToday && pictureTakenToday && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-sky-50 border-sky-200">
                                        <Camera className="w-3 h-3 text-sky-600" />
                                        <span className="text-xs font-medium text-sky-700">Photo Taken - {pictureTakenToday.initials}</span>
                                    </div>
                                )}
                                {pet.daily_picture && !isPictureSentToday && !pictureTakenToday && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-blue-50 border-blue-200">
                                        <Camera className="w-3 h-3 text-blue-600" />
                                        <span className="text-xs font-medium text-blue-700">Photo Not Taken</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right: Play Sessions Count */}
                         <div className="flex items-center gap-3 p-4 border-l border-stone-200 min-w-[180px]">
                             <div className="flex-1">
                                 {(() => {
                                     const today = moment().format('YYYY-MM-DD');
                                     const playSessions = (visit.scheduled_tasks || []).filter(t => t.type === 'Play Session' && t.date === today);
                                     if (playSessions.length === 0) return <div className="text-xs text-stone-400">No play sessions</div>;
                                     const remaining = playSessions.filter(s => !s.completed).length;
                                     return <div className="text-xs font-medium text-purple-700">{remaining}/{playSessions.length} Sessions Left</div>;
                                 })()}
                             </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onViewVisit(visit, pet)}
                                className="rounded-xl shrink-0"
                            >
                                <ChevronRight className="w-5 h-5 text-stone-400" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}