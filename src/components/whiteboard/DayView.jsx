import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dog, Cat, ChevronRight, ChevronLeft, Calendar, Sparkles, Home, Star, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import moment from "moment";
import 'moment-timezone';
import PullToRefresh from '@/components/PullToRefresh';
import { base44 } from '@/api/base44Client';

export default function DayView({ pets, visits, selectedDate, onDateChange, onViewVisit, onUpdateLocation, onRefresh }) {
    const [editingLocation, setEditingLocation] = useState(null);
    const [locationValue, setLocationValue] = useState('');
    const [userTimezone, setUserTimezone] = useState('UTC');

    useEffect(() => {
        const fetchUserTimezone = async () => {
            try {
                const user = await base44.auth.me();
                setUserTimezone(user?.timezone || 'America/New_York');
            } catch (err) {
                setUserTimezone('America/New_York');
            }
        };
        fetchUserTimezone();
    }, []);

    const todayVisits = visits.filter(v => 
        v.status === 'checked_in' && 
        moment(v.check_in_date).format('YYYY-MM-DD') <= selectedDate &&
        (!v.scheduled_checkout_date || moment(v.scheduled_checkout_date).format('YYYY-MM-DD') >= selectedDate)
    );
    

    // Helper to get remaining tasks for a pet on a specific date
    const getRemainingTasks = (visit, date) => {
        const isCheckInDay = moment(visit.check_in_date).format('YYYY-MM-DD') === date;
        const checkInTime = moment(visit.check_in_time);
        
        // Get tasks for this date
        const dateTasks = visit.scheduled_tasks?.filter(task => {
            if (task.date) return task.date === date;
            if (task.is_template) {
                // Daily observation tasks: hide if completed today
                if (task.is_daily_observation) {
                    return !(task.completed && task.completed_date === date);
                }
                // Template tasks appear every day
                if (isCheckInDay) {
                    const taskTime = moment(task.time, 'h:mm A');
                    return taskTime.isAfter(checkInTime);
                }
                return true;
            }
            return false;
        }) || [];
        
        // Filter out completed tasks
        const remaining = dateTasks.filter(task => !task.completed);
        
        // Sort: items without time first, then by time
        return remaining.sort((a, b) => {
            if (!a.time && b.time) return -1;
            if (a.time && !b.time) return 1;
            if (!a.time && !b.time) return 0;
            const timeA = moment(a.time, 'h:mm A');
            const timeB = moment(b.time, 'h:mm A');
            return timeA.diff(timeB);
        });
    };

    // Check if pet has an incomplete "Collect Feces" task
    const hasCollectFeces = (visit) => {
        return visit.scheduled_tasks?.some(task => task.type === 'Collect Feces' && !task.completed) || false;
    };



    const petsWithVisits = todayVisits.map(visit => {
        const pet = pets.find(p => p.id === visit.pet_id);
        return { pet, visit };
    }).filter(item => item.pet).sort((a, b) => a.pet.name.localeCompare(b.pet.name));

    const handleSaveLocation = async (visit) => {
        await onUpdateLocation(visit.id, locationValue.slice(0, 10));
        setEditingLocation(null);
        setLocationValue('');
    };

    const handleLocationBlur = async (visit) => {
        // Auto-save location on blur
        if (locationValue !== visit.location) {
            await onUpdateLocation(visit.id, locationValue.slice(0, 10));
        }
        setEditingLocation(null);
        setLocationValue('');
    };

    const handlePrevDay = () => {
        onDateChange(moment(selectedDate).subtract(1, 'day').format('YYYY-MM-DD'));
    };

    const handleNextDay = () => {
        onDateChange(moment(selectedDate).add(1, 'day').format('YYYY-MM-DD'));
    };

    const handleToday = () => {
        onDateChange(moment().format('YYYY-MM-DD'));
    };

    return (
        <PullToRefresh onRefresh={onRefresh}>
            <div className="space-y-4">
            {/* Date Selector */}
            <div className="flex items-center justify-between bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <Button 
                    variant="outline" 
                    size="icon"
                    onClick={handlePrevDay}
                    className="rounded-full border-[#82bb32]/30 hover:bg-[#82bb32]/10"
                >
                    <ChevronLeft className="w-5 h-5 text-[#82bb32]" />
                </Button>
                
                <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-[#82bb32]" />
                    <h2 className="text-xl font-bold text-gray-800">
                        {moment(selectedDate).format('dddd, MMMM D, YYYY')}
                    </h2>
                    {selectedDate !== moment().format('YYYY-MM-DD') && (
                        <Button 
                            size="sm"
                            onClick={handleToday}
                            className="bg-[#82bb32] hover:bg-[#82bb32]/90 text-white rounded-lg"
                        >
                            Today
                        </Button>
                    )}
                </div>

                <Button 
                    variant="outline" 
                    size="icon"
                    onClick={handleNextDay}
                    className="rounded-full border-[#82bb32]/30 hover:bg-[#82bb32]/10"
                >
                    <ChevronRight className="w-5 h-5 text-[#82bb32]" />
                </Button>
            </div>

            {/* Pets List */}
            {petsWithVisits.length === 0 ? (
                <Card className="border-gray-100">
                    <CardContent className="py-12 text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Dog className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="text-gray-500">No pets checked in for this day</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    <AnimatePresence>
                        {petsWithVisits.map(({ pet, visit }) => {
                             const isCat = pet.species === 'Cat';
                             const isEditing = editingLocation === visit.id;
                             const needsFecesCollection = hasCollectFeces(visit);
                             const hasEmergencyAlert = visit.emergency_alert_active;

                            return (
                                <motion.div
                                    key={visit.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    layout
                                >
                                    <Card className={`hover:shadow-md transition-shadow cursor-pointer ${
                                        hasEmergencyAlert ? 'border-red-500 bg-red-200' :
                                        needsFecesCollection ? 'border-amber-900 bg-stone-300' : 'border-gray-200'
                                    }`}
                                    onClick={() => onViewVisit(visit, pet)}>
                                        <CardContent className="p-0">
                                            {/* Mobile View - Square Layout */}
                                            <div className="md:hidden p-4">
                                                <div className="flex items-center gap-3 mb-3">
                                                    {pet.photo_url ? (
                                                        <img 
                                                            src={pet.photo_url}
                                                            alt={pet.name}
                                                            className="w-16 h-16 rounded-xl object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#82bb32]/20 to-[#82bb32]/30 flex items-center justify-center">
                                                            {isCat ? (
                                                                <Cat className="w-8 h-8 text-[#82bb32]" />
                                                            ) : (
                                                                <Dog className="w-8 h-8 text-[#82bb32]" />
                                                            )}
                                                        </div>
                                                    )}
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-1">
                                                            <h3 className="font-bold text-lg text-gray-800">{pet.name}</h3>
                                                            {(pet.social_media === 'Not Approved for Social Media' || 
                                                              pet.social_media === 'No Record of Social Media Consent') && (
                                                                <Star className="w-4 h-4 fill-black text-black" />
                                                            )}
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Badge className={`text-xs px-2 py-0 ${
                                                                visit.visit_type === 'boarding' 
                                                                    ? 'bg-blue-100 text-blue-700 border-0'
                                                                    : 'bg-emerald-100 text-emerald-700 border-0'
                                                            }`}>
                                                                {visit.visit_type === 'boarding' ? (
                                                                    <><Home className="w-2 h-2 mr-1" /> Boarding</>
                                                                ) : (
                                                                    <><Sparkles className="w-2 h-2 mr-1" /> Play Camp</>
                                                                )}
                                                            </Badge>
                                                            {needsFecesCollection && (
                                                                <Badge className="text-xs px-2 py-0 bg-amber-100 text-amber-700 border-0">
                                                                    Needs Fecal
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {pet.special_needs && (
                                                    <p className="text-xs text-amber-600 mb-2">⚠️ {pet.special_needs}</p>
                                                )}
                                                
                                                <div className="flex items-center justify-between mb-2">
                                                    <div>
                                                        <p className="text-xs text-gray-500">Location</p>
                                                        <p className="text-sm font-medium text-gray-700">
                                                            {visit.location || 'Not Set'}
                                                        </p>
                                                    </div>
                                                    <p className={`text-xs ${visit.picture_sent ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                        📸 {visit.picture_sent ? 'Sent' : 'Not Sent'}
                                                    </p>
                                                </div>
                                                
                                                {visit.play_sessions && visit.play_sessions.length > 0 && (
                                                    <div className="mb-2">
                                                        <p className="text-xs text-gray-500 mb-1">Play Sessions</p>
                                                        <div className="flex items-center gap-1">
                                                            {visit.play_sessions.map((session, idx) => {
                                                                const completedToday = session.completed && session.completed_date === selectedDate;
                                                                return (
                                                                    <div 
                                                                        key={idx}
                                                                        className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
                                                                            completedToday
                                                                                ? 'bg-emerald-500 text-white' 
                                                                                : 'bg-gray-200 text-gray-400'
                                                                        }`}
                                                                    >
                                                                        {session.session_number}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                <div>
                                                    <p className="text-xs text-gray-500 mb-1">Remaining Tasks</p>
                                                    {(() => {
                                                        const remaining = getRemainingTasks(visit, selectedDate);
                                                        if (remaining.length === 0) {
                                                            return <p className="text-xs text-gray-400 italic">All tasks complete</p>;
                                                        }
                                                        return (
                                                            <div className="space-y-1">
                                                                {remaining.slice(0, 3).map((task, i) => (
                                                                    <p key={i} className="text-xs text-gray-600">
                                                                        • {task.time ? `${task.time}: ` : ''}{task.type === 'Medication' ? task.medication_name : task.type}
                                                                    </p>
                                                                ))}
                                                                {remaining.length > 3 && (
                                                                    <p className="text-xs text-gray-400">+{remaining.length - 3} more</p>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </div>

                                            {/* Desktop View - Horizontal Layout */}
                                            <div className="hidden md:flex items-center">
                                                {/* Photo & Name */}
                                                <div className="flex items-center gap-3 p-4 border-r border-gray-100 min-w-[220px]">
                                                    {pet.photo_url ? (
                                                        <img 
                                                            src={pet.photo_url}
                                                            alt={pet.name}
                                                            className="w-14 h-14 rounded-xl object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#82bb32]/20 to-[#82bb32]/30 flex items-center justify-center">
                                                            {isCat ? (
                                                                <Cat className="w-7 h-7 text-[#82bb32]" />
                                                            ) : (
                                                                <Dog className="w-7 h-7 text-[#82bb32]" />
                                                            )}
                                                        </div>
                                                    )}
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-1">
                                                            <h3 className="font-bold text-base text-gray-800">{pet.name}</h3>
                                                            {(pet.social_media === 'Not Approved for Social Media' || 
                                                              pet.social_media === 'No Record of Social Media Consent') && (
                                                                <Star className="w-4 h-4 fill-black text-black" />
                                                            )}
                                                        </div>
                                                        {pet.special_needs && (
                                                            <p className="text-xs text-amber-600 mt-0.5">⚠️ {pet.special_needs}</p>
                                                        )}
                                                        {!isCat && pet.group_play && (
                                                            <p className="text-xs text-gray-600 mt-0.5">🐕 Group Play: {pet.group_play}</p>
                                                        )}
                                                        <div className="flex items-center gap-1 mt-1">
                                                            <Badge className={`text-xs px-2 py-0 ${
                                                                visit.visit_type === 'boarding' 
                                                                    ? 'bg-blue-100 text-blue-700 border-0'
                                                                    : 'bg-emerald-100 text-emerald-700 border-0'
                                                            }`}>
                                                                {visit.visit_type === 'boarding' ? (
                                                                    <><Home className="w-2 h-2 mr-1" /> Boarding</>
                                                                ) : (
                                                                    <><Sparkles className="w-2 h-2 mr-1" /> Play Camp</>
                                                                )}
                                                            </Badge>
                                                            {needsFecesCollection && (
                                                                <Badge className="text-xs px-2 py-0 bg-amber-100 text-amber-700 border-0">
                                                                    Needs Fecal
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Location & Photo Status */}
                                                <div className="p-4 w-[140px]">
                                                    {isEditing ? (
                                                        <div className="flex gap-2">
                                                            <Input
                                                                value={locationValue}
                                                                onChange={(e) => setLocationValue(e.target.value)}
                                                                maxLength={10}
                                                                placeholder="Location"
                                                                className="h-8 rounded-lg"
                                                                autoFocus
                                                                onBlur={() => handleLocationBlur(visit)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') handleSaveLocation(visit);
                                                                    if (e.key === 'Escape') {
                                                                        setEditingLocation(null);
                                                                        setLocationValue('');
                                                                    }
                                                                }}
                                                            />
                                                            <Button 
                                                                size="sm"
                                                                onClick={() => handleSaveLocation(visit)}
                                                                className="bg-[#82bb32] hover:bg-[#82bb32]/90 h-8 px-3"
                                                            >
                                                                Save
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <div 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingLocation(visit.id);
                                                                setLocationValue(visit.location || '');
                                                            }}
                                                            className="cursor-pointer hover:bg-gray-50 rounded-lg px-3 py-2 transition-colors"
                                                        >
                                                            <p className="text-xs text-gray-500">Location</p>
                                                            <p className="text-sm font-medium text-gray-700">
                                                                {visit.location || 'Click to set'}
                                                            </p>
                                                            <p className={`text-xs mt-1 ${visit.picture_sent ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                                📸 Photo {visit.picture_sent ? 'Sent' : 'Not Sent'}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Play Sessions */}
                                                {visit.play_sessions && visit.play_sessions.length > 0 && (
                                                    <div className="p-4 border-l border-gray-100 w-[160px]">
                                                        <p className="text-xs text-gray-500 mb-1">Play Sessions</p>
                                                        <div className="flex items-center gap-1">
                                                            {visit.play_sessions.map((session, idx) => {
                                                                const completedToday = session.completed && session.completed_date === selectedDate;
                                                                return (
                                                                    <div 
                                                                        key={idx}
                                                                        className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
                                                                            completedToday
                                                                                ? 'bg-emerald-500 text-white' 
                                                                                : 'bg-gray-200 text-gray-400'
                                                                        }`}
                                                                    >
                                                                        {session.session_number}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Remaining Tasks */}
                                                <div className="flex-1 p-4 border-l border-gray-100">
                                                    {(() => {
                                                        const remaining = getRemainingTasks(visit, selectedDate);
                                                        if (remaining.length === 0) {
                                                            return <p className="text-xs text-gray-400 italic">All tasks complete</p>;
                                                        }
                                                        return (
                                                            <div className="space-y-1">
                                                                {remaining.slice(0, 3).map((task, i) => (
                                                                    <p key={i} className="text-xs text-gray-600">
                                                                        • {task.time ? `${task.time}: ` : ''}{task.type === 'Medication' ? task.medication_name : task.type}
                                                                    </p>
                                                                ))}
                                                                {remaining.length > 3 && (
                                                                    <p className="text-xs text-gray-400">+{remaining.length - 3} more</p>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>

                                                {/* Action */}
                                                <div className="p-4 border-l border-gray-100">
                                                    <ChevronRight className="w-5 h-5 text-gray-400" />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
            </div>
        </PullToRefresh>
    );
}