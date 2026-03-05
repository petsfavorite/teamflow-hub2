import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dog, Cat, ChevronRight, ChevronLeft, Calendar } from "lucide-react";
import moment from "moment";

export default function WeekView({ pets, visits, selectedWeekStart, onWeekChange, onViewVisit, onViewVisitForDate }) {
    const weekDays = Array.from({ length: 7 }, (_, i) => 
        moment(selectedWeekStart).add(i, 'days').format('YYYY-MM-DD')
    );

    const boardingVisits = visits.filter(v => v.visit_type === 'boarding' && v.status === 'checked_in');
    
    const petsInWeek = boardingVisits.map(visit => {
        const pet = pets.find(p => p.id === visit.pet_id);
        if (!pet) return null;
        
        const checkIn = moment(visit.check_in_date);
        const checkOut = visit.scheduled_checkout_date ? moment(visit.scheduled_checkout_date) : moment().add(30, 'days');
        
        const daysStaying = weekDays.filter(day => {
            const dayMoment = moment(day);
            return dayMoment.isSameOrAfter(checkIn, 'day') && dayMoment.isSameOrBefore(checkOut, 'day');
        });
        
        return { pet, visit, daysStaying };
    }).filter(item => item && item.daysStaying.length > 0)
      .sort((a, b) => a.pet.name.localeCompare(b.pet.name));

    const handlePrevWeek = () => {
        onWeekChange(moment(selectedWeekStart).subtract(7, 'days').format('YYYY-MM-DD'));
    };

    const handleNextWeek = () => {
        onWeekChange(moment(selectedWeekStart).add(7, 'days').format('YYYY-MM-DD'));
    };

    const handleThisWeek = () => {
        onWeekChange(moment().startOf('week').format('YYYY-MM-DD'));
    };

    return (
        <div className="space-y-4">
            {/* Week Selector */}
            <div className="flex items-center justify-between bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <Button 
                    variant="outline" 
                    size="icon"
                    onClick={handlePrevWeek}
                    className="rounded-full border-[#82bb32]/30 hover:bg-[#82bb32]/10"
                >
                    <ChevronLeft className="w-5 h-5 text-[#82bb32]" />
                </Button>
                
                <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-[#82bb32]" />
                    <h2 className="text-xl font-bold text-gray-800">
                        {moment(selectedWeekStart).format('MMM D')} - {moment(selectedWeekStart).add(6, 'days').format('MMM D, YYYY')}
                    </h2>
                    {selectedWeekStart !== moment().startOf('week').format('YYYY-MM-DD') && (
                        <Button 
                            size="sm"
                            onClick={handleThisWeek}
                            className="bg-[#82bb32] hover:bg-[#82bb32]/90 text-white rounded-lg"
                        >
                            This Week
                        </Button>
                    )}
                </div>

                <Button 
                    variant="outline" 
                    size="icon"
                    onClick={handleNextWeek}
                    className="rounded-full border-[#82bb32]/30 hover:bg-[#82bb32]/10"
                >
                    <ChevronRight className="w-5 h-5 text-[#82bb32]" />
                </Button>
            </div>

            {/* Week Grid */}
            <Card className="border-gray-100">
                <CardContent className="p-4">
                    {petsInWeek.length === 0 ? (
                        <div className="py-12 text-center">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Dog className="w-8 h-8 text-gray-400" />
                            </div>
                            <p className="text-gray-500">No boarding pets this week</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left py-3 px-2 font-semibold text-gray-700 min-w-[160px]">Pet</th>
                                        {weekDays.map(day => (
                                            <th key={day} className="text-center py-3 px-2 min-w-[80px]">
                                                <div className="text-xs text-gray-500">{moment(day).format('ddd')}</div>
                                                <div className="text-sm font-semibold text-gray-700">{moment(day).format('M/D')}</div>
                                            </th>
                                        ))}
                                        <th className="w-12"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {petsInWeek.map(({ pet, visit, daysStaying }) => {
                                        const isCat = pet.species === 'Cat';
                                        
                                        return (
                                            <tr key={visit.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                <td className="py-3 px-2">
                                                    <div className="flex items-center gap-2">
                                                        {pet.photo_url ? (
                                                            <img 
                                                                src={pet.photo_url}
                                                                alt={pet.name}
                                                                className="w-10 h-10 rounded-lg object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#82bb32]/20 to-[#82bb32]/30 flex items-center justify-center">
                                                                {isCat ? (
                                                                    <Cat className="w-5 h-5 text-[#82bb32]" />
                                                                ) : (
                                                                    <Dog className="w-5 h-5 text-[#82bb32]" />
                                                                )}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <p className="font-medium text-sm text-gray-800">{pet.name}</p>
                                                            {pet.special_needs && (
                                                                <p className="text-xs text-amber-600">⚠️</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                {weekDays.map(day => {
                                                    const isStaying = daysStaying.includes(day);
                                                    const isToday = day === moment().format('YYYY-MM-DD');
                                                    
                                                    return (
                                                        <td key={day} className="text-center py-3 px-2">
                                                            {isStaying && (
                                                                <button
                                                                    onClick={() => onViewVisitForDate(visit, pet, day)}
                                                                    className={`w-8 h-8 mx-auto rounded-lg flex items-center justify-center transition-transform hover:scale-110 ${
                                                                        isToday 
                                                                            ? 'bg-[#82bb32]' 
                                                                            : 'bg-[#82bb32]/20 hover:bg-[#82bb32]/30'
                                                                    }`}
                                                                >
                                                                    <div className={`w-3 h-3 rounded-full ${
                                                                        isToday ? 'bg-white' : 'bg-[#82bb32]'
                                                                    }`} />
                                                                </button>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                <td className="py-3 px-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => onViewVisit(visit, pet)}
                                                        className="rounded-lg h-8 w-8"
                                                    >
                                                        <ChevronRight className="w-4 h-4 text-gray-400" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}