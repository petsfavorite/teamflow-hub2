import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dog, Cat, Phone, Pill, Clock, MapPin, Archive } from "lucide-react";
import { motion } from "framer-motion";

export default function PetCard({ pet, visit, onCheckIn, onCheckOut, onViewDetails, onArchive, compact = false }) {
    const hasMedications = pet.medications && pet.medications.length > 0;
    const isCat = pet.species === 'Cat';
    
    if (compact) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-stone-100 p-4 hover:shadow-lg transition-all duration-300"
            >
                <div className="flex items-center gap-4">
                 <div className="relative">
                     {pet.photo_url ? (
                         <img 
                             src={pet.photo_url} 
                             alt={pet.name}
                             className="w-14 h-14 rounded-xl object-cover"
                         />
                     ) : (
                         <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
                             {isCat ? (
                                 <Cat className="w-7 h-7 text-amber-600" />
                             ) : (
                                 <Dog className="w-7 h-7 text-amber-600" />
                             )}
                         </div>
                     )}
                     {hasMedications && (
                         <div className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center">
                             <Pill className="w-3 h-3 text-white" />
                         </div>
                     )}
                 </div>
                 <div className="flex-1 min-w-0">
                     <h3 className="font-semibold text-stone-800 truncate">{pet.name}</h3>
                     <p className="text-xs text-stone-500 truncate">{pet.owner_name}</p>
                     <p className="text-sm text-stone-500 truncate">{pet.breed}</p>
                 </div>
                    <Button 
                        size="sm"
                        onClick={() => onCheckIn?.(pet)}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl"
                    >
                        Check In
                    </Button>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ y: -2 }}
            transition={{ duration: 0.2 }}
        >
            <Card className="overflow-hidden border-0 shadow-sm hover:shadow-xl transition-all duration-300 bg-white rounded-2xl">
                <CardContent className="p-0">
                    <div className="relative w-40 h-40 mx-auto">
                        {pet.photo_url ? (
                            <img 
                                src={pet.photo_url} 
                                alt={pet.name}
                                className="w-full h-full object-cover"
                                style={{
                                    objectPosition: pet.crop_offset_y !== undefined 
                                        ? `center ${-pet.crop_offset_y}px`
                                        : 'center',
                                    transform: pet.crop_zoom ? `scale(${pet.crop_zoom})` : 'scale(1)',
                                    transformOrigin: 'center center'
                                }}
                            />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 flex items-center justify-center">
                                {isCat ? (
                                    <Cat className="w-16 h-16 text-amber-300" />
                                ) : (
                                    <Dog className="w-16 h-16 text-amber-300" />
                                )}
                            </div>
                        )}
                        {pet.is_checked_in && (
                            <Badge className="absolute top-3 left-3 bg-emerald-500 text-white border-0">
                                <MapPin className="w-3 h-3 mr-1" />
                                Checked In
                            </Badge>
                        )}
                        {hasMedications && (
                            <Badge className="absolute top-3 right-3 bg-rose-500 text-white border-0">
                                <Pill className="w-3 h-3 mr-1" />
                                Meds
                            </Badge>
                        )}
                    </div>
                    
                    <div className="p-5 pt-3">
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h3 className="text-lg font-semibold text-stone-800">{pet.name}</h3>
                                <p className="text-sm text-stone-500">{pet.species} • {pet.breed}</p>
                            </div>
                            <Badge variant="outline" className="text-xs bg-stone-50 border-stone-200">
                                {pet.gender}
                            </Badge>
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm text-stone-600 mb-4">
                            <span className="truncate">Owner: {pet.owner_name}</span>
                        </div>
                        
                        <div className="flex gap-2">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="flex-1 rounded-xl border-stone-200 hover:bg-stone-50"
                                onClick={() => onViewDetails?.(pet)}
                            >
                                Details
                            </Button>
                            {pet.is_checked_in ? (
                                <Button 
                                    size="sm" 
                                    className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white"
                                    onClick={() => onCheckOut?.(pet)}
                                >
                                    Check Out
                                </Button>
                            ) : (
                                <Button 
                                    size="sm" 
                                    className="flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white"
                                    onClick={() => onCheckIn?.(pet)}
                                >
                                    Check In
                                </Button>
                            )}
                            {onArchive && !pet.is_checked_in && (
                                <Button 
                                    size="sm" 
                                    variant="outline"
                                    className="rounded-xl border-stone-200 hover:bg-stone-50"
                                    onClick={() => onArchive?.(pet.id)}
                                    title="Archive pet"
                                >
                                    <Archive className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}