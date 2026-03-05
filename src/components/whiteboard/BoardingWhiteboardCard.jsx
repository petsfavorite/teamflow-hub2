import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
    Dog, Cat, Utensils, Pill, Camera, CheckCircle2, 
    AlertCircle, ChevronRight, Sparkles
} from "lucide-react";
import { motion } from "framer-motion";
import moment from "moment";

export default function BoardingWhiteboardCard({ pet, visit, onViewVisit }) {
    const hasMedications = pet.medications && pet.medications.length > 0;
    const isCat = pet.species === 'Cat';
    const now = moment();
    const checkInTime = moment(visit.check_in_time);

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

    // Check if any task is overdue
    const hasOverdue = sortedTasks.some(task => {
        if (task.completed) return false;
        const taskTime = moment(task.time, 'h:mm A');
        return now.isAfter(taskTime);
    });

    // Check if picture needs to be sent
    const needsPicture = pet.daily_picture && !visit.picture_sent;

    // Check if fecal sample has been collected
     const hasUncompletedFeces = !visit.fecal_collected;

     const cardColor = (hasOverdue || hasUncompletedFeces) ? 'border-rose-400 bg-rose-50' : 'border-stone-200 bg-white';

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
                                {hasOverdue && (
                                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center animate-pulse">
                                        <AlertCircle className="w-3 h-3 text-white" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-base text-stone-800">{pet.name}</h3>
                                <p className="text-xs text-stone-500">{visit.location || 'Lobby'}</p>
                                <div className="flex items-center gap-1 mt-1">
                                    <Badge className="bg-blue-100 text-blue-700 border-0 text-xs px-2 py-0">
                                        Boarding
                                    </Badge>
                                    {visit.play_sessions && visit.play_sessions.length > 0 && (
                                        <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs px-2 py-0">
                                            <Sparkles className="w-2 h-2 mr-1" />
                                            Play
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
                                            </span>
                                        </div>
                                    );
                                })}

                                {/* Play Sessions */}
                                {visit.play_sessions?.map((session, idx) => {
                                    const today = moment().format('YYYY-MM-DD');
                                    const completedToday = session.completed && session.completed_date === today;
                                    return (
                                        <div 
                                            key={`play-${idx}`}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
                                                completedToday
                                                    ? 'bg-emerald-50 border-emerald-200' 
                                                    : 'bg-purple-50 border-purple-200'
                                            }`}
                                        >
                                            {completedToday ? (
                                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                            ) : (
                                                <div className="w-3 h-3 rounded-full border-2 border-purple-400" />
                                            )}
                                            <span className={`text-xs font-medium ${
                                                completedToday ? 'text-emerald-700' : 'text-purple-700'
                                            }`}>
                                                Play {session.session_number}
                                            </span>
                                        </div>
                                    );
                                })}

                                {/* Daily Picture */}
                                {hasUncompletedFeces && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-rose-100 border-rose-300 animate-pulse">
                                        <AlertCircle className="w-3 h-3 text-rose-600" />
                                        <span className="text-xs font-medium text-rose-700">Need Feces</span>
                                    </div>
                                )}

                                {needsPicture && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-blue-50 border-blue-200">
                                        <Camera className="w-3 h-3 text-blue-600" />
                                        <span className="text-xs font-medium text-blue-700">Picture</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right: Special Needs & Action */}
                        <div className="flex items-center gap-3 p-4 border-l border-stone-200 min-w-[180px]">
                            {pet.special_needs ? (
                                <div className="flex-1">
                                    <p className="text-xs font-medium text-amber-700 mb-1">⚠️ Special</p>
                                    <p className="text-xs text-stone-600 line-clamp-2">{pet.special_needs}</p>
                                </div>
                            ) : (
                                <div className="flex-1 text-xs text-stone-400">
                                    No special needs
                                </div>
                            )}
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