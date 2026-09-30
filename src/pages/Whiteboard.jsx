import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CalendarDays, CalendarRange, Plus, RefreshCw, FileText } from "lucide-react";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import moment from "moment";

import DayView from '@/components/whiteboard/DayView';
import WeekView from '@/components/whiteboard/WeekView';
import VisitPanel from '@/components/visit/VisitPanel';
import CheckoutDialog from '@/components/visit/CheckoutDialog';
import PetArchive from '@/components/whiteboard/PetArchive';
import { isOverstayed, populateTasksForDate } from '@/lib/overstayed';

export default function Whiteboard() {
    const [selectedDate, setSelectedDate] = useState(moment().format('YYYY-MM-DD'));
    const [selectedWeekStart, setSelectedWeekStart] = useState(moment().startOf('week').format('YYYY-MM-DD'));
    const [selectedVisit, setSelectedVisit] = useState(null);
    const [selectedPet, setSelectedPet] = useState(null);
    const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('day');
    const [showArchive, setShowArchive] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);

    const queryClient = useQueryClient();

    useEffect(() => {
        base44.auth.me().then(setCurrentUser).catch(() => {});
    }, []);

    // Auto-refresh every 5 seconds when on Day View (but not when panel is open
    // or when a user is actively editing an input — prevents losing in-progress edits)
    useEffect(() => {
        if (activeTab !== 'day' || selectedVisit) return;
        
        const isInputFocused = () => {
            const el = document.activeElement;
            return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
        };

        const interval = setInterval(() => {
            if (isInputFocused()) return; // don't refetch mid-edit
            queryClient.invalidateQueries(['visits']);
            queryClient.invalidateQueries(['pets']);
        }, 30000); // 30 seconds — was 5s, which caused excessive entity reads
        
        return () => clearInterval(interval);
    }, [activeTab, queryClient, selectedVisit]);

    const { data: allPets = [], isLoading: petsLoading } = useQuery({
         queryKey: ['pets'],
         queryFn: () => base44.entities.Pet.list(null, 500)
     });

     // Filter out archived pets for normal view
     const pets = allPets.filter(p => !p.is_archived);

     const { data: visits = [], isLoading: visitsLoading } = useQuery({
         queryKey: ['visits'],
         queryFn: () => base44.entities.Visit.list('-check_in_time', 500)
     });

    const updateVisitMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Visit.update(id, data),
        onMutate: async ({ id, data }) => {
            // Cancel outgoing refetches so they don't overwrite our optimistic update
            await queryClient.cancelQueries({ queryKey: ['visits'] });
            // Snapshot previous value for rollback
            const previousVisits = queryClient.getQueryData(['visits']);
            // Optimistically update cache BEFORE save so the whiteboard reflects
            // the change immediately when the panel closes — even if the save is
            // still in flight or the refetch hits a 429.
            queryClient.setQueryData(['visits'], (oldVisits) => {
                if (!Array.isArray(oldVisits)) return oldVisits;
                return oldVisits.map(v => v.id === id ? { ...v, ...data } : v);
            });
            return { previousVisits };
        },
        onError: (err, { id }, context) => {
            // Rollback to previous state
            if (context?.previousVisits) {
                queryClient.setQueryData(['visits'], context.previousVisits);
                const fresh = context.previousVisits.find(v => v.id === id);
                if (fresh) setSelectedVisit({ ...fresh });
            }
            alert('Failed to save changes. Please try again.');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['visits'] });
        }
    });

    const updatePetMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Pet.update(id, data),
        onSuccess: () => queryClient.invalidateQueries(['pets'])
    });

    const handleUpdateLocation = (visitId, location) => {
        // LocationEditor already saved to DB directly; just sync the cache
        queryClient.invalidateQueries({ queryKey: ['visits'] });
    };

    const handleViewVisit = (visit, pet) => {
        // Always use the freshest version from the query cache
        const freshVisits = queryClient.getQueryData(['visits']);
        const fresh = freshVisits?.find(v => v.id === visit.id);
        setSelectedVisit(fresh || visit);
        setSelectedPet(pet);
    };

    const handleRefresh = async () => {
        await queryClient.invalidateQueries({ queryKey: ['visits'] });
        await queryClient.invalidateQueries({ queryKey: ['pets'] });
    };

    // Populate daily tasks for overstayed boarding pets (still checked in past
    // their scheduled departure day). Copies the previous day's template tasks
    // to today so the pet continues receiving its daily care routine.
    useEffect(() => {
        if (visitsLoading || !visits.length) return;
        const today = moment().format('YYYY-MM-DD');
        visits.forEach(visit => {
            if (!isOverstayed(visit, today)) return;
            const newTasks = populateTasksForDate(visit.scheduled_tasks, today);
            if (newTasks) {
                updateVisitMutation.mutate({ id: visit.id, data: { scheduled_tasks: newTasks } });
            }
        });
    }, [visits, visitsLoading]);
    
    const handleViewVisitForDate = (visit, pet, date) => {
        setSelectedDate(date);
        setSelectedVisit(visit);
        setSelectedPet(pet);
    };

    const handleUpdateVisit = async (updatedVisit) => {
        // Update selectedVisit immediately so the panel reacts right away
        setSelectedVisit({ ...updatedVisit });
        // onMutate in the mutation updates the visits cache synchronously BEFORE
        // the save, so the whiteboard reflects the change even if the user closes
        // the panel before the save completes.
        await updateVisitMutation.mutateAsync({ id: updatedVisit.id, data: updatedVisit });
    };

    const handleCheckout = () => {
        setCheckoutDialogOpen(true);
    };
    
    const handleConfirmCheckout = async (pdfUrl, pdfExpiry) => {
        const checkoutTime = new Date().toISOString();
        // Update the pet flag FIRST — only mark the visit as checked out once the
        // pet is no longer flagged. If these run in the opposite order and the pet
        // update fails, the pet is stuck: is_checked_in=true but visit=checked_out
        // (invisible on the whiteboard, can't be re-checked-in).
        await updatePetMutation.mutateAsync({ 
            id: selectedPet.id, 
            data: { is_checked_in: false }
        });
        await updateVisitMutation.mutateAsync({ 
            id: selectedVisit.id, 
            data: { 
                check_out_time: checkoutTime,
                status: 'checked_out',
                pdf_url: pdfUrl,
                pdf_expiry: pdfExpiry,
                what_was_brought: ''
            }
        });
        
        setCheckoutDialogOpen(false);
        setSelectedVisit(null);
        setSelectedPet(null);
    };

    const isLoading = petsLoading || visitsLoading;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Kennel Whiteboard</h1>
                    <p className="text-slate-500 mt-1">
                        {visits.filter(v => v.status === 'checked_in').length} pets currently checked in
                    </p>
                </div>
                <div className="flex items-center gap-2 md:gap-3">
                    <Link to={createPageUrl('MonitorView')}>
                        <Button variant="outline" className="rounded-xl border-stone-200">
                            <span className="hidden sm:inline">Monitor View</span>
                            <span className="sm:hidden">Monitor</span>
                        </Button>
                    </Link>
                    <Link to={createPageUrl('Pets')}>
                        <Button variant="outline" className="rounded-xl border-stone-200 hidden sm:inline-flex">
                            All Pets
                        </Button>
                    </Link>
                    <Link to={createPageUrl('CheckIn')}>
                         <Button className="rounded-xl bg-[#82bb32] hover:bg-[#82bb32]/90 text-white">
                              <Plus className="w-4 h-4 md:mr-2" />
                              <span className="hidden md:inline">Check In</span>
                          </Button>
                      </Link>
                </div>
            </div>

            {/* Main Content */}
            <div>
                {showArchive ? (
                    <PetArchive 
                        archivedPets={allPets.filter(p => p.is_archived)}
                        onRestore={(petId) => {
                            updatePetMutation.mutateAsync({ id: petId, data: { is_archived: false } });
                        }}
                    />
                ) : isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <RefreshCw className="w-8 h-8 text-[#82bb32] animate-spin" />
                    </div>
                ) : (
                    <Tabs defaultValue="day" className="w-full" onValueChange={setActiveTab}>
                        <TabsList className="bg-white border border-stone-200 rounded-xl p-1 mb-6 shadow-sm">
                            <TabsTrigger 
                                value="day" 
                                className="rounded-lg data-[state=active]:bg-[#82bb32] data-[state=active]:text-white"
                            >
                                <CalendarDays className="w-4 h-4 mr-2" />
                                Day View
                            </TabsTrigger>
                            <TabsTrigger 
                                value="week"
                                className="rounded-lg data-[state=active]:bg-[#82bb32] data-[state=active]:text-white"
                            >
                                <CalendarRange className="w-4 h-4 mr-2" />
                                Week View (Boarding)
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="day">
                            <DayView
                                pets={pets}
                                visits={visits}
                                selectedDate={selectedDate}
                                onDateChange={setSelectedDate}
                                onViewVisit={handleViewVisit}
                                onUpdateLocation={handleUpdateLocation}
                                onRefresh={handleRefresh}
                            />
                        </TabsContent>

                        <TabsContent value="week">
                            <WeekView
                                pets={pets}
                                visits={visits}
                                selectedWeekStart={selectedWeekStart}
                                onWeekChange={setSelectedWeekStart}
                                onViewVisit={handleViewVisit}
                                onViewVisitForDate={handleViewVisitForDate}
                            />
                        </TabsContent>
                    </Tabs>
                )}
            </div>

            {/* Visit Panel */}
            <Sheet open={!!selectedVisit} onOpenChange={() => { setSelectedVisit(null); setSelectedPet(null); }}>
                <SheetContent side="right" className="w-full sm:max-w-md p-0">
                    {selectedPet && selectedVisit && (
                        <VisitPanel
                            pet={selectedPet}
                            visit={selectedVisit}
                            selectedDate={selectedDate}
                            onUpdateVisit={handleUpdateVisit}
                            onClose={() => { setSelectedVisit(null); setSelectedPet(null); }}
                            onCheckout={handleCheckout}
                        />
                    )}
                </SheetContent>
            </Sheet>

            {/* Checkout Dialog */}
            {selectedPet && selectedVisit && (
                <CheckoutDialog
                    pet={selectedPet}
                    visit={selectedVisit}
                    open={checkoutDialogOpen}
                    onClose={() => setCheckoutDialogOpen(false)}
                    onConfirm={handleConfirmCheckout}
                />
            )}
        </div>
    );
}