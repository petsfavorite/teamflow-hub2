import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CalendarDays, CalendarRange, Plus, RefreshCw, FileText, Download, Trash2 } from "lucide-react";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import moment from "moment";

import DayView from '@/components/whiteboard/DayView';
import WeekView from '@/components/whiteboard/WeekView';
import VisitPanel from '@/components/visit/VisitPanel';
import CheckoutDialog from '@/components/visit/CheckoutDialog';
import PetArchive from '@/components/whiteboard/PetArchive';
import { Card, CardContent } from "@/components/ui/card";

// Inline Reports Tab Component
function ReportsTab() {
    const [reports, setReports] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchReports();
    }, []);

    const fetchReports = async () => {
        setIsLoading(true);
        try {
            const data = await base44.entities.Report.list('-created_date', 100);
            setReports(data);
        } catch (error) {
            console.error('Error fetching reports:', error);
        }
        setIsLoading(false);
    };

    const handleDeleteReport = async (reportId) => {
        await base44.entities.Report.delete(reportId);
        setReports(reports.filter(r => r.id !== reportId));
    };

    const handleDeleteAll = async () => {
        if (window.confirm('Clear all reports? They should have been synced to Google Drive.')) {
            setIsDeleting(true);
            try {
                for (const report of reports) {
                    await base44.entities.Report.delete(report.id);
                }
                setReports([]);
            } catch (error) {
                console.error('Error deleting reports:', error);
            }
            setIsDeleting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 text-[#82bb32] animate-spin" />
            </div>
        );
    }

    if (reports.length === 0) {
        return (
            <Card className="border-0 shadow-sm">
                <CardContent className="p-12 text-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FileText className="w-8 h-8 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-700 mb-2">No Reports</h3>
                    <p className="text-slate-500">All reports have been synced to Google Drive</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">{reports.length} report{reports.length !== 1 ? 's' : ''} pending</p>
                <Button
                    onClick={handleDeleteAll}
                    disabled={isDeleting}
                    size="sm"
                    className="rounded-lg bg-red-500 hover:bg-red-600"
                >
                    {isDeleting ? (
                        <>
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                            Clearing...
                        </>
                    ) : (
                        <>
                            <Trash2 className="w-3 h-3 mr-1" />
                            Clear All
                        </>
                    )}
                </Button>
            </div>
            <div className="grid gap-3 max-h-96 overflow-y-auto">
                {reports.map((report) => (
                    <Card key={report.id} className="border-0 shadow-sm">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm text-slate-900 truncate">{report.pet_name}</p>
                                    <p className="text-xs text-slate-500">{report.visit_type} • {report.check_out_date}</p>
                                </div>
                                <div className="flex gap-1 flex-shrink-0">
                                    <a href={report.report_url} target="_blank" rel="noopener noreferrer">
                                        <Button size="sm" variant="outline" className="rounded-lg h-7 px-2">
                                            <Download className="w-3 h-3" />
                                        </Button>
                                    </a>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleDeleteReport(report.id)}
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg h-7 px-2"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}

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

    // Auto-refresh every 5 seconds when on Day View (but not when panel is open)
    useEffect(() => {
        if (activeTab !== 'day' || selectedVisit) return;
        
        const interval = setInterval(() => {
            queryClient.invalidateQueries(['visits']);
            queryClient.invalidateQueries(['pets']);
        }, 5000); // 5 seconds
        
        return () => clearInterval(interval);
    }, [activeTab, queryClient, selectedVisit]);

    const { data: allPets = [], isLoading: petsLoading } = useQuery({
         queryKey: ['pets'],
         queryFn: () => base44.entities.Pet.list()
     });

     // Filter out archived pets for normal view
     const pets = allPets.filter(p => !p.is_archived);

    const { data: visits = [], isLoading: visitsLoading } = useQuery({
        queryKey: ['visits'],
        queryFn: () => base44.entities.Visit.list()
    });

    const updateVisitMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Visit.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['visits']);
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
    
    const handleViewVisitForDate = (visit, pet, date) => {
        setSelectedDate(date);
        setSelectedVisit(visit);
        setSelectedPet(pet);
    };

    const handleUpdateVisit = async (updatedVisit) => {
        await updateVisitMutation.mutateAsync({ id: updatedVisit.id, data: updatedVisit });
        // Optimistically update selectedVisit immediately so the UI reacts right away
        setSelectedVisit({ ...updatedVisit });
        // Then refetch in background to sync with server
        queryClient.invalidateQueries({ queryKey: ['visits'] });
    };

    const handleCheckout = () => {
        setCheckoutDialogOpen(true);
    };
    
    const handleConfirmCheckout = async (pdfUrl, pdfExpiry) => {
        const checkoutTime = new Date().toISOString();
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
        await updatePetMutation.mutateAsync({ 
            id: selectedPet.id, 
            data: { is_checked_in: false }
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
                    <Link to={createPageUrl('Reports')}>
                        <Button variant="outline" className="rounded-xl border-stone-200">
                            <FileText className="w-4 h-4 md:mr-2" />
                            <span className="hidden md:inline">Reports</span>
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
                            <TabsTrigger 
                                value="reports"
                                className="rounded-lg data-[state=active]:bg-[#82bb32] data-[state=active]:text-white"
                            >
                                <FileText className="w-4 h-4 mr-2" />
                                Reports
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

                        <TabsContent value="reports">
                            <ReportsTab />
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