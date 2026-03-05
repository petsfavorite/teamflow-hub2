import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dog, Cat, RotateCcw, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useState } from 'react';

export default function PetArchive({ archivedPets, onRestore }) {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredPets = archivedPets.filter(pet =>
        pet.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pet.owner_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Archived Pets</h2>
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <Input
                        placeholder="Search archived pets..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 rounded-xl border-stone-200"
                    />
                </div>
            </div>

            {filteredPets.length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-stone-500">No archived pets</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {filteredPets.map((pet) => (
                        <Card key={pet.id} className="border-stone-200">
                            <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-12 h-12 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
                                        {pet.species === 'Cat' ? (
                                            <Cat className="w-6 h-6 text-stone-400" />
                                        ) : (
                                            <Dog className="w-6 h-6 text-stone-400" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-slate-900">{pet.name}</h3>
                                        <p className="text-sm text-stone-500">{pet.owner_name}</p>
                                        {pet.breed && (
                                            <p className="text-xs text-stone-400">{pet.breed}</p>
                                        )}
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    onClick={() => onRestore(pet.id)}
                                    className="w-full mt-4 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs"
                                >
                                    <RotateCcw className="w-3 h-3 mr-1" />
                                    Restore
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}