import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dog, Cat, ChevronRight, ChevronLeft, Calendar, Sparkles, Home, Star, RefreshCw, Filter } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import moment from "moment";
import 'moment-timezone';
import PullToRefresh from '@/components/PullToRefresh';
import { base44 } from '@/api/base44Client';
import LocationEditor from './LocationEditor';

const OVERDUE_EXEMPT_TYPES = ['Collect Feces', 'Collect Urine', 'Feces Observed', 'Ate', 'Urine Observed'];

const getTaskColor = (task) => {
    const type = task.type || '';
    if (type === 'Schedule Bath') return 'text-orange-600 font-bold';
    if (type === 'Medication') return 'text-red-600 font-medium';
    if (type.toLowerCase().includes('play') || type === 'Play Session') return 'text-purple-600 font-medium';
    if (type.toLowerCase().includes('water')) return 'text-blue-600 font-medium';
    if (type.toLowerCase().includes('walk')) return 'text-green-600 font-medium';
    if (type.toLowerCase().includes('feces') || type.toLowerCase().includes('fecal')) return 'text-amber-800 font-medium';
    if (type.toLowerCase().includes('urine')) return 'text-yellow-600 font-medium';
    return 'text-gray-600';
};

export default function DayView({ pets, visits, selectedDate, onDateChange, onViewVisit, onUpdateLocation, onRefresh }) {

    const [userTimezone, setUserTimezone] = useState('UTC');
    const [nowTick, setNowTick] = useState(() => moment());
    const [activeFilter, setActiveFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

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

    useEffect(() => {
        const interval = setInterval(() => setNowTick(moment()), 15 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const todayVisits = visits.filter(v => {
        if (v.status !== 'checked_in') return false;
        if (moment(v.check_in_date).format('YYYY-MM-DD') > selectedDate) return false;
        // Boarding: always show if still checked in, regardless of scheduled checkout date
        if (v.visit_type === 'boarding') return true;
        // Play camp: respect scheduled checkout date
        return !v.scheduled_checkout_date || moment(v.scheduled_checkout_date).format('YYYY-MM-DD') >= selectedDate;
    });
    

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

         // Sort: Schedule Bath first, then items without time, then by time
         return remaining.sort((a, b) => {
             if (a.type === 'Schedule Bath' && b.type !== 'Schedule Bath') return -1;
             if (a.type !== 'Schedule Bath' && b.type === 'Schedule Bath') return 1;
             if (!a.time && b.time) return -1;
             if (a.time && !b.time) return 1;
             if (!a.time && !b.time) return 0;
             const timeA = moment(a.time, 'h:mm A');
             const timeB = moment(b.time, 'h:mm A');
             return timeA.diff(timeB);
         });
    };

    const today2 = nowTick.format('YYYY-MM-DD');
    const hasCollectFeces = (visit) => visit.scheduled_tasks?.some(t => t.type === 'Collect Feces' && t.date === today2 && !t.completed) || false;
    const hasCollectUrine = (visit) => visit.scheduled_tasks?.some(t => t.type === 'Collect Urine' && t.date === today2 && !t.completed) || false;

    const isOverdueAlert = (visit) => {
        if (selectedDate !== today2) return false;
        const cutoff = nowTick.clone().hour(19).minute(30).second(0);
        return (visit.scheduled_tasks || []).some(task => {
            if (task.completed) return false;
            if (OVERDUE_EXEMPT_TYPES.includes(task.type)) return false;
            if (task.date && task.date !== today2) return false;
            if (task.time) {
                const taskMoment = nowTick.clone().startOf('day').add(moment(task.time, 'h:mm A').diff(moment(task.time, 'h:mm A').clone().startOf('day')));
                return nowTick.isAfter(taskMoment);
            }
            // No time — flag if it's past 7:30 PM
            return nowTick.isAfter(cutoff);
        });
    };



    const hasTaskDueWithinHour = (visit) => {
        if (selectedDate !== today2) return false;
        const inOneHour = nowTick.clone().add(1, 'hour');
        return (visit.scheduled_tasks || []).some(task => {
            if (task.completed) return false;
            if (!task.time) return false;
            if (task.date && task.date !== today2) return false;
            const taskMoment = nowTick.clone().startOf('day').add(
                moment(task.time, 'h:mm A').diff(moment(task.time, 'h:mm A').clone().startOf('day'))
            );
            return taskMoment.isAfter(nowTick) && taskMoment.isBefore(inOneHour);
        });
    };

    const hasPlaySessionsLeft = (visit) => {
        return (visit.scheduled_tasks || []).some(t =>
            t.type === 'Play Session' && t.date === selectedDate && !t.completed
        );
    };

    const allPetsWithVisits = todayVisits.map(visit => {
        const pet = pets.find(p => p.id === visit.pet_id);
        return { pet, visit };
    }).filter(item => item.pet).sort((a, b) => a.pet.name.localeCompare(b.pet.name));

    const searchLower = searchQuery.toLowerCase().trim();
    const petsWithVisits = allPetsWithVisits.filter(({ pet, visit }) => {
        if (activeFilter !== 'all') {
            if (activeFilter === 'boarding' && visit.visit_type !== 'boarding') return false;
            if (activeFilter === 'play_camp' && visit.visit_type !== 'play_camp') return false;
            if (activeFilter === 'play_sessions' && !hasPlaySessionsLeft(visit)) return false;
            if (activeFilter === 'due_soon' && !hasTaskDueWithinHour(visit)) return false;
        }
        if (searchLower) {
            const petName = (pet.name || '').toLowerCase();
            const ownerName = (pet.owner_name || '').toLowerCase();
            return petName.includes(searchLower) || ownerName.includes(searchLower);
        }
        return true;
    });

    // Helper: get owner last name
    const getOwnerLastName = (pet) => {
        const parts = (pet.owner_name || '').trim().split(' ');
        return parts.length > 1 ? parts[parts.length - 1] : '';
    };

    const filterCounts = {
        all: allPetsWithVisits.length,
        boarding: allPetsWithVisits.filter(({ visit }) => visit.visit_type === 'boarding').length,
        play_camp: allPetsWithVisits.filter(({ visit }) => visit.visit_type === 'play_camp').length,
        play_sessions: allPetsWithVisits.filter(({ visit }) => hasPlaySessionsLeft(visit)).length,
        due_soon: allPetsWithVisits.filter(({ visit }) => hasTaskDueWithinHour(visit)).length,
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

            {/* Search Bar */}
            <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                <Input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by pet name or owner name..."
                    className="pl-9 bg-white border-gray-200 rounded-xl"
                />
                {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Filter Bar */}
            <div className="flex items-center gap-2 flex-wrap">
                <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
                {[
                    { key: 'all', label: 'All' },
                    { key: 'boarding', label: '🏠 Boarding' },
                    { key: 'play_camp', label: '✨ Play Camp' },
                    { key: 'play_sessions', label: '🎾 Play Sessions Left' },
                    { key: 'due_soon', label: '⏰ Due in 1hr' },
                ].map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => setActiveFilter(key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                            activeFilter === key
                                ? 'bg-[#82bb32] text-white border-[#82bb32]'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-[#82bb32]/40 hover:text-[#82bb32]'
                        }`}
                    >
                        {label}
                        <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                            activeFilter === key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                        }`}>
                            {filterCounts[key]}
                        </span>
                    </button>
                ))}
            </div>

            {/* Pets List */}
            {petsWithVisits.length === 0 ? (
                <Card className="border-gray-100">
                    <CardContent className="py-12 text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Dog className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="text-gray-500">{searchLower ? `No pets match "${searchQuery}"` : activeFilter === 'all' ? 'No pets checked in for this day' : 'No pets match this filter'}</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    <AnimatePresence>
                        {petsWithVisits.map(({ pet, visit }) => {
                             const isCat = pet.species === 'Cat';
                             const needsFecesCollection = hasCollectFeces(visit);
                             const needsUrineCollection = hasCollectUrine(visit);
                             const hasEmergencyAlert = visit.emergency_alert_active;
                             const hasOverdue = isOverdueAlert(visit);

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
                                       needsFecesCollection ? 'border-amber-800 bg-amber-100' :
                                       needsUrineCollection ? 'border-yellow-400 bg-yellow-100' :
                                       hasOverdue ? 'border-purple-500 bg-purple-100' : 'border-gray-200'
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
                                                        <div className="flex items-center gap-1 flex-wrap">
                                                            <h3 className="font-bold text-lg text-gray-800">{pet.name}</h3>
                                                            {getOwnerLastName(pet) && (
                                                                <span className="text-sm text-gray-500 font-medium">{getOwnerLastName(pet)}</span>
                                                            )}
                                                            {(pet.social_media === 'Not Approved for Social Media' || 
                                                              pet.social_media === 'No Record of Social Media Consent') && (
                                                                <Star className="w-4 h-4 fill-black text-black" />
                                                            )}
                                                        </div>
                                                        {pet.special_needs && (
                                                            <p className="text-xs text-amber-600 mb-1">⚠️ {pet.special_needs}</p>
                                                        )}
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
                                                            {needsFecesCollection && !hasEmergencyAlert && (
                                                                <Badge className="text-xs px-2 py-0 bg-amber-100 text-amber-700 border-0">
                                                                    Need Fecal Sample
                                                                </Badge>
                                                            )}
                                                            {needsUrineCollection && !hasEmergencyAlert && (
                                                                <Badge className="text-xs px-2 py-0 bg-yellow-200 text-yellow-800 border-0">
                                                                    Need Urine Sample
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
                                                       <p className="text-xs text-gray-500 mb-1">Location</p>
                                                       <LocationEditor visit={visit} onSaved={(loc) => onUpdateLocation?.(visit.id, loc)} />
                                                   </div>
                                                   {pet.daily_picture && (() => {
                                                       const todayStr = nowTick.format('YYYY-MM-DD');
                                                       const takenToday = (visit.picture_taken_dates || []).find(p => p.date === todayStr);
                                                       const sentToday = (visit.picture_sent_dates || []).includes(todayStr);
                                                       if (sentToday) return <p className="text-xs text-emerald-600">📸 Photo Sent</p>;
                                                       if (takenToday) return <p className="text-xs text-sky-600">📸 Photo Taken - {takenToday.initials}</p>;
                                                       return <p className="text-xs text-gray-400">📸 Photo Not Taken</p>;
                                                   })()}
                                                </div>
                                                
                                                {(() => {
                                                    const playSessions = (visit.scheduled_tasks || []).filter(t => t.type === 'Play Session' && t.date === selectedDate);
                                                    if (playSessions.length === 0) return null;
                                                    const remaining = playSessions.filter(s => !s.completed).length;
                                                    return (
                                                        <div className="mb-2">
                                                            <p className="text-xs text-gray-500 mb-1">Play Sessions</p>
                                                            <div className="flex items-center gap-1 mb-1">
                                                                {playSessions.map((s, i) => (
                                                                    <div key={i} className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${s.completed ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                                                                        {s.completed ? '✓' : i + 1}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <p className={`text-xs font-semibold ${remaining === 0 ? 'text-emerald-600' : 'text-purple-600'}`}>
                                                                {remaining === 0 ? 'All done!' : `${remaining} remaining`}
                                                            </p>
                                                        </div>
                                                    );
                                                })()}

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
                                                                    <p key={i} className={`text-xs ${getTaskColor(task)}`}>
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
                                                        <div className="flex items-center gap-1 flex-wrap">
                                                            <h3 className="font-bold text-base text-gray-800">{pet.name}</h3>
                                                            {getOwnerLastName(pet) && (
                                                                <span className="text-sm text-gray-500 font-medium">{getOwnerLastName(pet)}</span>
                                                            )}
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
                                                            {needsFecesCollection && !hasEmergencyAlert && (
                                                                <Badge className="text-xs px-2 py-0 bg-amber-100 text-amber-700 border-0">
                                                                    Need Fecal Sample
                                                                </Badge>
                                                            )}
                                                            {needsUrineCollection && !hasEmergencyAlert && (
                                                                <Badge className="text-xs px-2 py-0 bg-yellow-200 text-yellow-800 border-0">
                                                                    Need Urine Sample
                                                                </Badge>
                                                            )}
                                                            </div>
                                                            </div>
                                                            </div>

                                                            {/* Location & Photo Status */}
                                                                <div className="p-4 w-[160px]">
                                                                    <div className="rounded-lg">
                                                                        <p className="text-xs text-gray-500 mb-1">Location</p>
                                                                        <LocationEditor visit={visit} onSaved={(loc) => onUpdateLocation?.(visit.id, loc)} />
                                                                        {pet.daily_picture && (() => {
                                                                            const todayStr = nowTick.format('YYYY-MM-DD');
                                                                            const takenToday = (visit.picture_taken_dates || []).find(p => p.date === todayStr);
                                                                            const sentToday = (visit.picture_sent_dates || []).includes(todayStr);
                                                                            if (sentToday) return <p className="text-xs mt-2 text-emerald-600">📸 Photo Sent</p>;
                                                                            if (takenToday) return <p className="text-xs mt-2 text-sky-600">📸 Photo Taken - {takenToday.initials}</p>;
                                                                            return <p className="text-xs mt-2 text-gray-400">📸 Photo Not Taken</p>;
                                                                        })()}
                                                                    </div>
                                                                </div>

                                                {/* Play Sessions */}
                                                {(() => {
                                                    const playSessions = (visit.scheduled_tasks || []).filter(t => t.type === 'Play Session' && t.date === selectedDate);
                                                    if (playSessions.length === 0) return null;
                                                    const completed = playSessions.filter(s => s.completed).length;
                                                    const remaining = playSessions.length - completed;
                                                    return (
                                                        <div className="p-4 border-l border-gray-100 w-[160px]">
                                                            <p className="text-xs text-gray-500 mb-1">Play Sessions</p>
                                                            <div className="flex items-center gap-1 mb-2">
                                                                {playSessions.map((s, i) => (
                                                                    <div key={i} className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${s.completed ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                                                                        {s.completed ? '✓' : i + 1}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <p className={`text-xs font-semibold ${remaining === 0 ? 'text-emerald-600' : 'text-purple-600'}`}>
                                                                {remaining === 0 ? 'All done!' : `${remaining} remaining`}
                                                            </p>
                                                        </div>
                                                    );
                                                })()}

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
                                                                    <p key={i} className={`text-xs ${getTaskColor(task)}`}>
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