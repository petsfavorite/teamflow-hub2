import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
    Dog, Cat, CheckCircle2, ChevronRight, Camera, AlertCircle
} from "lucide-react";
import { motion } from "framer-motion";

export default function PlayCampWhiteboardCard({ pet, visit, onViewVisit }) {
    const isCat = pet.species === 'Cat';
    
    const completedSessions = visit.play_sessions?.filter(s => s.completed).length || 0;
    const totalSessions = visit.play_sessions?.length || 0;
    const allSessionsComplete = completedSessions === totalSessions;
    
    const needsPicture = pet.daily_picture && !visit.picture_sent;
    
    // Format play sessions display
    const getPlaySessionDisplay = (session) => {
        const isCompleted = session.completed;
        return (
            <div 
                key={`${session.session_number}`}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                    isCompleted
                        ? 'bg-emerald-50 border-emerald-200' 
                        : 'bg-purple-50 border-purple-200'
                }`}
            >
                {isCompleted ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                ) : (
                    <div className="w-3 h-3 rounded-full border-2 border-purple-400" />
                )}
                <span className={`text-xs font-medium ${
                    isCompleted ? 'text-emerald-700' : 'text-purple-700'
                }`}>
                    Play {session.session_number}
                </span>
            </div>
        );
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            layout
            className="w-full"
        >
            <Card className={`overflow-hidden border-2 transition-all duration-300 rounded-2xl hover:shadow-lg ${
                visit.emergency_alert_active 
                    ? 'border-red-500 bg-red-200' 
                    : 'border-stone-200 bg-white'
            }`}>
                <CardContent className="p-0">
                    <div className="flex items-center">
                        {/* Left: Photo and Basic Info */}
                        <div className="flex items-center gap-3 p-4 border-r border-stone-200 min-w-[200px]">
                            <div className="relative">
                                {pet.photo_url ? (
                                    <img 
                                        src={pet.photo_url} 
                                        alt={pet.name}
                                        className="w-14 h-14 rounded-xl object-cover"
                                    />
                                ) : (
                                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-100 to-green-100 flex items-center justify-center">
                                        {isCat ? (
                                            <Cat className="w-7 h-7 text-emerald-600" />
                                        ) : (
                                            <Dog className="w-7 h-7 text-emerald-600" />
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-base text-stone-800">{pet.name}</h3>
                                    {visit.emergency_alert_active && (
                                        <AlertCircle className="w-5 h-5 text-red-700 flex-shrink-0" title={`Emergency: Missing ${visit.emergency_alert_type}`} />
                                    )}
                                </div>
                                <p className="text-xs text-stone-500">{visit.location || 'Lobby'}</p>
                                <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs px-2 py-0 mt-1">
                                    Play Camp
                                </Badge>
                            </div>
                        </div>

                        {/* Middle: Play Sessions */}
                        <div className="flex-1 p-4">
                            <div className="flex items-center gap-3 flex-wrap">
                                {visit.play_sessions?.map((session) => getPlaySessionDisplay(session))}

                                {/* Daily Picture */}
                                {needsPicture && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-blue-50 border-blue-200">
                                        <Camera className="w-3 h-3 text-blue-600" />
                                        <span className="text-xs font-medium text-blue-700">Picture</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right: Special Needs & Play Sessions Count */}
                         <div className="flex items-center gap-3 p-4 border-l border-stone-200 min-w-[180px]">
                             <div className="flex-1">
                                 {pet.special_needs ? (
                                     <>
                                         <p className="text-xs font-medium text-amber-700 mb-1">⚠️ Special</p>
                                         <p className="text-xs text-stone-600 line-clamp-2">{pet.special_needs}</p>
                                     </>
                                 ) : (
                                     <div className="text-xs text-stone-400">
                                         No special needs
                                     </div>
                                 )}
                                 {visit.play_sessions && visit.play_sessions.length > 0 && (
                                     <div className="mt-2 text-xs font-medium text-purple-700">
                                         {visit.play_sessions.filter(s => !s.completed).length}/{totalSessions} Sessions Left
                                     </div>
                                 )}
                             </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onViewVisit(visit, pet)}
                                className="rounded-xl shrink-0"
                            >
                                <ChevronRight className="w-5 h-5 text-stone-400" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}