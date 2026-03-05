import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
    Dog, Search, ArrowLeft, CheckCircle2, RefreshCw, Plus
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import moment from 'moment';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import PetCard from '@/components/pets/PetCard';
import PetForm from '@/components/forms/PetForm';
import CheckInTypeSelector from '@/components/checkin/CheckInTypeSelector';
import BoardingCheckIn from '@/components/checkin/BoardingCheckIn';
import PlayCampCheckIn from '@/components/checkin/PlayCampCheckIn';

export default function CheckIn() {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPet, setSelectedPet] = useState(null);
    const [checkInType, setCheckInType] = useState(null);
    const [checkingIn, setCheckingIn] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [showAddDialog, setShowAddDialog] = useState(false);
    
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // Get petId from URL if present
    const urlParams = new URLSearchParams(window.location.search);
    const preselectedPetId = urlParams.get('petId');

    const { data: pets = [], isLoading } = useQuery({
        queryKey: ['pets'],
        queryFn: () => base44.entities.Pet.list()
    });

    const updatePetMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Pet.update(id, data),
        onSuccess: () => queryClient.invalidateQueries(['pets'])
    });

    const createVisitMutation = useMutation({
        mutationFn: (data) => base44.entities.Visit.create(data),
        onSuccess: () => queryClient.invalidateQueries(['visits'])
    });

    const createPetMutation = useMutation({
        mutationFn: (data) => base44.entities.Pet.create(data),
        onSuccess: (newPet) => {
            queryClient.invalidateQueries(['pets']);
            setShowAddDialog(false);
            setSelectedPet(newPet);
        }
    });

    // Auto-select pet if petId is provided
    useEffect(() => {
        if (preselectedPetId && pets.length > 0) {
            const pet = pets.find(p => p.id === preselectedPetId);
            if (pet && !pet.is_checked_in) {
                setSelectedPet(pet);
            }
        }
    }, [preselectedPetId, pets]);

    const handleSelectPet = (pet) => {
        setSelectedPet(pet);
    };

    const handleSelectType = (type) => {
        setCheckInType(type);
    };

    const handleConfirmCheckIn = async (visitData) => {
        setCheckingIn(true);
        
        // Update pet status
        await updatePetMutation.mutateAsync({
            id: selectedPet.id,
            data: { is_checked_in: true, picture_sent_today: false }
        });

        // Create visit record
        await createVisitMutation.mutateAsync({
            pet_id: selectedPet.id,
            pet_name: selectedPet.name,
            check_in_date: moment().format('YYYY-MM-DD'),
            check_in_time: new Date().toISOString(),
            location: 'Lobby',
            status: 'checked_in',
            care_log: [{
                time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                activity: 'Check In',
                notes: `${selectedPet.name} checked in for ${visitData.visit_type === 'boarding' ? 'boarding' : 'play camp'}`
            }],
            picture_sent: false,
            ...visitData
        });

        setCheckingIn(false);
        setShowSuccess(true);
        
        setTimeout(() => {
            navigate(createPageUrl('Whiteboard'));
        }, 1500);
    };

    const availablePets = pets.filter(p => !p.is_checked_in);
    const filteredPets = availablePets.filter(pet =>
        pet.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pet.breed?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pet.owner_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Show check-in type selection if pet is selected
    if (selectedPet && !checkInType) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-stone-50 via-amber-50/30 to-stone-50">
                <div className="bg-white/80 backdrop-blur-md border-b border-stone-100 sticky top-0 z-40">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-4">
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="rounded-xl"
                                onClick={() => setSelectedPet(null)}
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </Button>
                            <div>
                                <h1 className="text-2xl font-bold text-stone-800">Select Check-In Type</h1>
                                <p className="text-sm text-stone-500">for {selectedPet.name}</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
                    <CheckInTypeSelector onSelect={handleSelectType} />
                </div>
            </div>
        );
    }

    // Show boarding or play camp form if type is selected
    if (selectedPet && checkInType) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-stone-50 via-amber-50/30 to-stone-50">
                <div className="bg-white/80 backdrop-blur-md border-b border-stone-100 sticky top-0 z-40">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-4">
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="rounded-xl"
                                onClick={() => setCheckInType(null)}
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </Button>
                            <div>
                                <h1 className="text-2xl font-bold text-stone-800">
                                    {checkInType === 'boarding' ? 'Boarding' : 'Play Camp'} Details
                                </h1>
                                <p className="text-sm text-stone-500">for {selectedPet.name}</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
                    {checkingIn ? (
                        <div className="flex items-center justify-center py-20">
                            <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
                        </div>
                    ) : checkInType === 'boarding' ? (
                        <BoardingCheckIn
                            pet={selectedPet}
                            onConfirm={handleConfirmCheckIn}
                            onCancel={() => setCheckInType(null)}
                        />
                    ) : (
                        <PlayCampCheckIn
                            pet={selectedPet}
                            onConfirm={handleConfirmCheckIn}
                            onCancel={() => setCheckInType(null)}
                        />
                    )}
                </div>
            </div>
        );
    }

    if (showSuccess) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-stone-50 via-emerald-50/30 to-stone-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-center"
                >
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring" }}
                        className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6"
                    >
                        <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                    </motion.div>
                    <h2 className="text-2xl font-bold text-stone-800 mb-2">Checked In!</h2>
                    <p className="text-stone-500">Redirecting to whiteboard...</p>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-stone-50 via-emerald-50/30 to-stone-50">
            {/* Header */}
            <div className="bg-white/80 backdrop-blur-md border-b border-stone-100 sticky top-0 z-40">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link to={createPageUrl('Whiteboard')}>
                                <Button variant="ghost" size="icon" className="rounded-xl">
                                    <ArrowLeft className="w-5 h-5" />
                                </Button>
                            </Link>
                            <div>
                                <h1 className="text-3xl font-bold text-[#82bb32]">FLOOF</h1>
                                <p className="text-xs text-stone-500 mt-0.5">Facility Log Of Occupancy & Fun</p>
                                <p className="text-sm text-stone-700 mt-2">
                                    {availablePets.length} pets available
                                </p>
                            </div>
                        </div>
                        <Button 
                            onClick={() => setShowAddDialog(true)}
                            className="rounded-xl bg-amber-500 hover:bg-amber-600"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            New Pet
                        </Button>
                    </div>

                    {/* Search */}
                    <div className="mt-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                            <Input
                                placeholder="Search pets..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 rounded-xl border-stone-200 bg-stone-50/50"
                                autoFocus
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
                    </div>
                ) : filteredPets.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Dog className="w-10 h-10 text-stone-300" />
                        </div>
                        <h3 className="text-lg font-semibold text-stone-700 mb-2">
                            {searchQuery ? 'No pets found' : 'All pets are checked in!'}
                        </h3>
                        <p className="text-stone-500 mb-6">
                            {searchQuery ? 'Try a different search term' : 'Or add a new pet to check in'}
                        </p>
                        <div className="flex gap-3 justify-center">
                            <Link to={createPageUrl('Pets')}>
                                <Button variant="outline" className="rounded-xl">
                                    <Dog className="w-4 h-4 mr-2" />
                                    View All Pets
                                </Button>
                            </Link>
                            <Button 
                                onClick={() => setShowAddDialog(true)}
                                className="rounded-xl bg-amber-500 hover:bg-amber-600"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add New Pet
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <AnimatePresence>
                            {filteredPets.map((pet) => (
                                <motion.div
                                    key={pet.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, x: -100 }}
                                >
                                    <PetCard
                                        pet={pet}
                                        compact
                                        onCheckIn={() => handleSelectPet(pet)}
                                    />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Add Pet Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
                    <DialogHeader>
                        <DialogTitle className="text-xl">Add New Pet & Check In</DialogTitle>
                    </DialogHeader>
                    <PetForm
                        onSave={(data) => createPetMutation.mutate(data)}
                        onCancel={() => setShowAddDialog(false)}
                        isLoading={createPetMutation.isPending}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}