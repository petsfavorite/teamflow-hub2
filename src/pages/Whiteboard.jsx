import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CalendarDays, CalendarRange, Plus, RefreshCw } from "lucide-react";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import moment from "moment";

import DayView from '@/components/whiteboard/DayView';
import WeekView from '@/components/whiteboard/WeekView';
import VisitPanel from '@/components/visit/VisitPanel';
import CheckoutDialog from '@/components/visit/CheckoutDialog';
import PetArchive from '@/components/whiteboard/PetArchive';
import { isOverstayed, populateTasksForDate } from '@/lib/overstayed';
import { buildVisitPatch } from '@/lib/visitMerge';
import { toast } from '@/components/ui/use-toast';
import { useToday } from '@/lib/useToday';
import { fetchCheckedInVisits } from '@/lib/visitQueries';
import { usePetsForVisits } from '@/lib/petQueries';

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
    const today = useToday();

    // At midnight: move a whiteboard that was showing "today" to the new day and
    // reload the data, so screens left on overnight don't show yesterday.
    const lastToday = useRef(today);
    useEffect(() => {
        if (lastToday.current === today) return;
        const previous = lastToday.current;
        lastToday.current = today;
        setSelectedDate(d => (d === previous ? today : d));
        setSelectedWeekStart(w => (moment(previous).startOf('week').format('YYYY-MM-DD') === w ? moment(today).startOf('week').format('YYYY-MM-DD') : w));
        queryClient.invalidateQueries({ queryKey: ['visits'] });
        queryClient.invalidateQueries({ queryKey: ['pets'] });
    }, [today, queryClient]);

    // Latest visit as shown in the panel — the "before" snapshot for the next edit.
    const selectedVisitRef = useRef(null);
    useEffect(() => { selectedVisitRef.current = selectedVisit; }, [selectedVisit]);

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
            queryClient.invalidateQueries({ queryKey: ['visits'] });
            queryClient.invalidateQueries({ queryKey: ['pets'] });
        }, 30000); // 30 seconds — was 5s, which caused excessive entity reads
        
        return () => clearInterval(interval);
    }, [activeTab, queryClient, selectedVisit]);

     const { data: visits = [], isLoading: visitsLoading } = useQuery({
         queryKey: ['visits'],
         queryFn: fetchCheckedInVisits
     });

     // Only the pets that are checked in — not limited by how many pets exist in total
     const { pets: onBoardPets, isLoading: petsLoading } = usePetsForVisits(visits, !visitsLoading);

     // Filter out archived pets for normal view
     const pets = onBoardPets.filter(p => !p.is_archived);

     // Archived pets are only needed when the archive is open
     const { data: archivedPets = [] } = useQuery({
         queryKey: ['pets', 'archived'],
         queryFn: () => base44.entities.Pet.filter({ is_archived: true }, null, 1000),
         enabled: showArchive
     });

    const updateVisitMutation = useMutation({
        mutationKey: ['visit-update'],
        // Save only what the user changed, merged onto the latest server copy, so
        // two staff editing the same visit don't overwrite each other's tasks/log.
        mutationFn: async ({ id, data, base, server }) => {
            // Use the server snapshot captured from the query cache (passed in
            // from handleUpdateVisit) instead of doing an extra Visit.get() on
            // every check-off. Fall back to a GET only when the visit isn't in
            // the cache (e.g. just transitioned status).
            const serverCopy = server || (base ? await base44.entities.Visit.get(id) : null);
            const patch = buildVisitPatch(base, data, serverCopy);
            if (!patch) return null;
            await base44.entities.Visit.update(id, patch);
            return serverCopy ? { ...serverCopy, ...patch } : null;
        },
        onMutate: async ({ id, data }) => {
            // Cancel outgoing refetches so they don't overwrite our optimistic update
            await queryClient.cancelQueries({ queryKey: ['visits'] });
            // Optimistically update cache BEFORE save so the whiteboard reflects
            // the change immediately when the panel closes — even if the save is
            // still in flight or the refetch hits a 429.
            queryClient.setQueryData(['visits'], (oldVisits) => {
                if (!Array.isArray(oldVisits)) return oldVisits;
                return oldVisits.map(v => v.id === id ? { ...v, ...data } : v);
            });
            return {};
        },
        onError: async (err, { id }) => {
            toast({ variant: 'destructive', title: 'Changes not saved', description: 'Failed to save your changes. Please try again.' });
            // The cache and the open panel were updated optimistically BEFORE this save, so a snapshot
            // taken in onMutate already contains the unsaved edit and rolling back to it undoes nothing.
            // Reload the real server copy instead; otherwise the failed change looks saved and later
            // saves (which diff against the panel) silently skip it.
            try {
                const fresh = await base44.entities.Visit.get(id);
                queryClient.setQueryData(['visits'], (old) => (
                    Array.isArray(old) ? old.map(v => v.id === id ? { ...v, ...fresh } : v) : old
                ));
                // Only reset the open panel when no other save is queued behind this one.
                if (pendingSaves.current <= 1 && selectedVisitRef.current?.id === id) {
                    selectedVisitRef.current = { ...fresh };
                    setSelectedVisit({ ...fresh });
                }
            } catch {
                queryClient.invalidateQueries({ queryKey: ['visits'] });
            }
        },
        onSuccess: (merged, { id }) => {
            // Show other staff's concurrent changes in the open panel — but only when
            // no other save is in flight, so we never overwrite a newer local edit.
            if (merged && pendingSaves.current <= 1) {
                setSelectedVisit(prev => (prev && prev.id === id ? merged : prev));
            }
            // Skip the full-list refetch when more saves are queued — the optimistic
            // cache already reflects the edit, and the last save triggers the refetch.
            if (pendingSaves.current <= 1) {
                queryClient.invalidateQueries({ queryKey: ['visits'] });
            }
        }
    });

    const updatePetMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Pet.update(id, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pets'] })
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
    // Each visit/day is attempted at most once per page load, so a failed save can't
    // loop through refetches. It re-reads the visit first and saves only
    // scheduled_tasks, so it never overwrites staff edits or duplicates tasks.
    const overstayHandled = useRef(new Set());
    useEffect(() => {
        if (visitsLoading || !visits.length) return;
        visits.forEach(visit => {
            if (!isOverstayed(visit, today)) return;
            const key = `${visit.id}:${today}`;
            if (overstayHandled.current.has(key)) return;
            if (!populateTasksForDate(visit.scheduled_tasks, today)) return;
            overstayHandled.current.add(key);
            (async () => {
                try {
                    const fresh = await base44.entities.Visit.get(visit.id);
                    if (!isOverstayed(fresh, today)) return;
                    const newTasks = populateTasksForDate(fresh.scheduled_tasks, today);
                    if (!newTasks) return; // already populated (e.g. by another tab)
                    await base44.entities.Visit.update(visit.id, { scheduled_tasks: newTasks });
                    queryClient.invalidateQueries({ queryKey: ['visits'] });
                } catch (err) {
                    console.error('Overstay task population failed for visit', visit.id, err);
                }
            })();
        });
    }, [visits, visitsLoading, today]);
    
    const handleViewVisitForDate = (visit, pet, date) => {
        setSelectedDate(date);
        setSelectedVisit(visit);
        setSelectedPet(pet);
    };

    const saveQueue = useRef(Promise.resolve());
    const pendingSaves = useRef(0);
    const handleUpdateVisit = async (updatedVisit) => {
        // Update selectedVisit immediately so the panel reacts right away
        const base = selectedVisitRef.current?.id === updatedVisit.id ? selectedVisitRef.current : null;
        // Capture the server snapshot from the cache BEFORE the optimistic update —
        // this lets the mutation merge without an extra Visit.get() round-trip.
        const cachedVisits = queryClient.getQueryData(['visits']);
        const serverSnapshot = (cachedVisits && Array.isArray(cachedVisits))
            ? cachedVisits.find(v => v.id === updatedVisit.id) || null
            : null;
        selectedVisitRef.current = { ...updatedVisit };
        setSelectedVisit({ ...updatedVisit });
        // Update the visits cache now (not when the save reaches the front of the queue)
        // so the whiteboard reflects the change even if the user closes the panel
        // while earlier saves are still running.
        queryClient.setQueryData(['visits'], (oldVisits) => {
            if (!Array.isArray(oldVisits)) return oldVisits;
            return oldVisits.map(v => v.id === updatedVisit.id ? { ...v, ...updatedVisit } : v);
        });
        // Run saves one at a time. Rapid check-offs otherwise race: each save reads the
        // server copy before the previous save lands, and the later write drops the earlier one.
        const run = () => updateVisitMutation.mutateAsync({ id: updatedVisit.id, data: updatedVisit, base, server: serverSnapshot });
        pendingSaves.current += 1;
        const result = saveQueue.current.then(run, run);
        saveQueue.current = result.catch(() => {});
        try { await result; } finally { pendingSaves.current -= 1; }
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
        // Each step can be repeated safely, so if one fails the dialog tells staff
        // exactly what failed and they can press the button again.
        try {
            await updatePetMutation.mutateAsync({ 
                id: selectedPet.id, 
                data: { is_checked_in: false }
            });
        } catch (err) {
            throw new Error('Could not mark the pet as checked out.');
        }
        try {
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
        } catch (err) {
            throw new Error('Could not mark the visit as checked out.');
        }
        
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
                        archivedPets={archivedPets}
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