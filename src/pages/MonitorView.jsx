import React, { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dog, Cat, Home, Sparkles, Star, LayoutGrid } from "lucide-react";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import moment from "moment";

export default function MonitorView() {
    const { data: pets = [], isLoading: petsLoading } = useQuery({
        queryKey: ['pets'],
        queryFn: () => base44.entities.Pet.list()
    });

    const { data: visits = [], isLoading: visitsLoading, refetch } = useQuery({
        queryKey: ['visits'],
        queryFn: () => base44.entities.Visit.list()
    });

    // Auto-refresh every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            refetch();
        }, 30000);
        return () => clearInterval(interval);
    }, [refetch]);

    const checkedInVisits = visits.filter(v => v.status === 'checked_in');



    // Check if pet has uncollected "Collect Feces" task
    const hasCollectFeces = (visit) => {
        const today = moment().format('YYYY-MM-DD');
        const tasks = visit.scheduled_tasks?.filter(task => {
            if (task.completed) return false;
            if (task.date && task.date !== today) return false;
            if (!task.is_template && task.date !== today) return false;
            return true;
        }) || [];
        
        return tasks.some(task => task.type === 'Collect Feces' && !task.collected);
    };





    const petsWithVisits = checkedInVisits.map(visit => {
        const pet = pets.find(p => p.id === visit.pet_id);
        return { pet, visit };
    }).filter(item => item.pet).sort((a, b) => a.pet.name.localeCompare(b.pet.name));

    const isLoading = petsLoading || visitsLoading;

    if (isLoading) {
        return (
            <div className="min-h-screen bg-stone-900 flex items-center justify-center">
                <div className="text-white text-2xl">Loading...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-stone-900 p-6">
            {/* Header */}
            <div className="text-center mb-8">
                <h1 className="text-4xl font-bold text-white mb-1">Kennel Monitor</h1>
                <p className="text-stone-400 text-lg">
                    {checkedInVisits.length} pets currently checked in
                </p>
            </div>

            {/* Grid of Pets */}
            {petsWithVisits.length === 0 ? (
                <div className="text-center py-20">
                    <div className="w-24 h-24 bg-stone-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Dog className="w-12 h-12 text-stone-600" />
                    </div>
                    <p className="text-stone-500 text-2xl">No pets checked in</p>
                </div>
            ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                    {petsWithVisits.map(({ pet, visit }) => {
                         const isCat = pet.species === 'Cat';
                         const needsFecesCollection = hasCollectFeces(visit);
                         const hasEmergencyAlert = visit.emergency_alert_active;

                        return (
                            <div 
                                key={visit.id}
                                className={`rounded-lg p-3 transition-all ${
                                    hasEmergencyAlert ? 'bg-yellow-300 border-2 border-yellow-500' :
                                    needsFecesCollection ? 'bg-stone-300 border-2 border-amber-900' : 
                                    'bg-white border-2 border-stone-300'
                                }`}
                            >
                                {/* Name with emoji */}
                                <div className="mb-2">
                                    <h3 className="text-base font-bold text-gray-800 break-words">
                                        {isCat ? '🐱' : '🐶'} {pet.name}
                                    </h3>
                                </div>

                                {/* Visit Type Badge */}
                                <div className="mb-2">
                                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                        visit.visit_type === 'boarding' 
                                            ? 'bg-blue-100 text-blue-700'
                                            : 'bg-emerald-100 text-emerald-700'
                                    }`}>
                                        {visit.visit_type === 'boarding' ? (
                                            <><Home className="w-3 h-3" /> Boarding</>
                                        ) : (
                                            <><Sparkles className="w-3 h-3" /> Play Camp</>
                                        )}
                                    </div>
                                </div>

                                {/* Location */}
                                <div className="bg-stone-100 rounded p-2">
                                    <p className="text-xs font-bold text-gray-800">
                                        {visit.location || 'Not Set'}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Footer */}
            <div className="text-center mt-8 text-stone-600 text-sm">
                Last updated: {moment().format('h:mm A')} • Auto-refreshing every 30 seconds
            </div>

            {/* Return to Whiteboard Button */}
            <Link
                to={createPageUrl('Whiteboard')}
                className="fixed bottom-24 right-4 md:bottom-6 md:right-6 bg-[#82bb32] hover:bg-[#6a9829] text-white rounded-full p-4 shadow-lg transition-all flex items-center gap-2 z-50"
            >
                <LayoutGrid className="w-6 h-6" />
                <span className="font-medium">Back to Whiteboard</span>
            </Link>
        </div>
    );
}