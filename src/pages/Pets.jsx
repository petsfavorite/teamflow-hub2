import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
    Dialog, DialogContent, DialogHeader, DialogTitle 
} from "@/components/ui/dialog";
import { 
    Dog, Search, Plus, Grid3X3, List, Filter, RefreshCw
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

import PetCard from '@/components/pets/PetCard';
import PetForm from '@/components/forms/PetForm';
import { useState, useEffect } from 'react';

export default function Pets() {
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [editingPet, setEditingPet] = useState(null);
    const [filterCheckedIn, setFilterCheckedIn] = useState('all');
    const [currentUser, setCurrentUser] = useState(null);

    const navigate = useNavigate();
    const queryClient = useQueryClient();

    useEffect(() => {
        base44.auth.me().then(setCurrentUser).catch(() => {});
    }, []);

    const { data: allPets = [], isLoading } = useQuery({
        queryKey: ['pets'],
        queryFn: () => base44.entities.Pet.list()
    });

    // Filter out archived pets
    const pets = allPets.filter(p => !p.is_archived);

    const createPetMutation = useMutation({
        mutationFn: (data) => base44.entities.Pet.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['pets']);
            setShowAddDialog(false);
        }
    });

    const updatePetMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Pet.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['pets']);
            setEditingPet(null);
        }
    });

    const deletePetMutation = useMutation({
        mutationFn: (id) => base44.entities.Pet.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['pets']);
            setEditingPet(null);
        }
    });

    const handleSavePet = async (petData) => {
        if (editingPet) {
            await updatePetMutation.mutateAsync({ id: editingPet.id, data: petData });
        } else {
            await createPetMutation.mutateAsync(petData);
        }
    };

    const handleDeletePet = async (petId) => {
        await deletePetMutation.mutateAsync(petId);
    };

    const handleCheckIn = (pet) => {
        navigate(createPageUrl('CheckIn') + `?petId=${pet.id}`);
    };

    const handleCheckOut = (pet) => {
        navigate(createPageUrl('Dashboard'));
    };

    const handleArchivePet = async (petId) => {
        await updatePetMutation.mutateAsync({ id: petId, data: { is_archived: true } });
    };

    let filteredPets = pets.filter(pet =>
        pet.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pet.breed?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pet.owner_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (filterCheckedIn === 'in') {
        filteredPets = filteredPets.filter(p => p.is_checked_in);
    } else if (filterCheckedIn === 'out') {
        filteredPets = filteredPets.filter(p => !p.is_checked_in);
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pets</h1>
                    <p className="text-slate-500 mt-1">{pets.length} pets registered</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button 
                        onClick={() => setShowAddDialog(true)}
                        className="rounded-xl bg-[#82bb32] hover:bg-[#82bb32]/90"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Pet
                    </Button>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <Input
                        placeholder="Search by name, breed, or owner..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 rounded-xl border-stone-200 bg-white"
                    />
                </div>
                <div className="flex gap-2">
                    <Button
                        variant={filterCheckedIn === 'all' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilterCheckedIn('all')}
                        className={`rounded-xl ${filterCheckedIn === 'all' ? 'bg-slate-800' : ''}`}
                    >
                        All
                    </Button>
                    <Button
                        variant={filterCheckedIn === 'in' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilterCheckedIn('in')}
                        className={`rounded-xl ${filterCheckedIn === 'in' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}`}
                    >
                        Checked In
                    </Button>
                    <Button
                        variant={filterCheckedIn === 'out' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilterCheckedIn('out')}
                        className={`rounded-xl ${filterCheckedIn === 'out' ? 'bg-slate-800' : ''}`}
                    >
                        Not Here
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div>
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
                    </div>
                ) : filteredPets.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Dog className="w-10 h-10 text-stone-300" />
                        </div>
                        <h3 className="text-lg font-semibold text-stone-700 mb-2">
                            {searchQuery ? 'No pets found' : 'No pets yet'}
                        </h3>
                        <p className="text-stone-500 mb-6">
                            {searchQuery ? 'Try a different search term' : 'Add your first pet to get started'}
                        </p>
                        {!searchQuery && (
                            <Button 
                                onClick={() => setShowAddDialog(true)}
                                className="rounded-xl bg-[#82bb32] hover:bg-[#82bb32]/90"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Pet
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                         <AnimatePresence>
                             {filteredPets.map((pet) => (
                                 <PetCard
                                     key={pet.id}
                                     pet={pet}
                                     onCheckIn={handleCheckIn}
                                     onCheckOut={handleCheckOut}
                                     onViewDetails={(p) => setEditingPet(p)}
                                     onArchive={(currentUser?.role === 'manager' || currentUser?.role === 'admin' || currentUser?.role === 'super_admin') ? handleArchivePet : null}
                                 />
                             ))}
                         </AnimatePresence>
                     </div>
                    )}
                    </div>

                    {/* Add/Edit Dialog */}
            <Dialog 
                open={showAddDialog || !!editingPet} 
                onOpenChange={() => { setShowAddDialog(false); setEditingPet(null); }}
            >
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
                    <DialogHeader>
                        <DialogTitle className="text-xl">
                            {editingPet ? `Edit ${editingPet.name}` : 'Add New Pet'}
                        </DialogTitle>
                    </DialogHeader>
                    <PetForm
                        pet={editingPet}
                        onSave={handleSavePet}
                        onCancel={() => { setShowAddDialog(false); setEditingPet(null); }}
                        onDelete={handleDeletePet}
                        isLoading={createPetMutation.isPending || updatePetMutation.isPending}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}