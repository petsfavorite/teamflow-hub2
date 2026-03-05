import React, { useState } from 'react';
import moment from 'moment';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles } from "lucide-react";

export default function PlayCampCheckIn({ pet, onConfirm, onCancel }) {
    const [duration, setDuration] = useState('full_day');
    const [needFecal, setNeedFecal] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // Create play sessions
        const playSessions = Array.from(
            { length: duration === 'half_day' ? 2 : 4 }, 
            (_, i) => ({
                session_number: i + 1,
                completed: false,
                completed_at: null
            })
        );
        
        // Add "Collect Feces" task if requested - no template, persists for play camp duration
        const tasks = [];
        if (needFecal) {
            const checkInDate = moment().format('YYYY-MM-DD');
            const checkOutDate = checkInDate; // Play camp is same-day
            let currentDate = moment(checkInDate);
            
            while (currentDate.format('YYYY-MM-DD') <= checkOutDate) {
                tasks.push({ 
                    type: 'Collect Feces', 
                    time: '', 
                    date: currentDate.format('YYYY-MM-DD'),
                    is_template: false, 
                    completed: false, 
                    completed_at: null,
                    collected: false
                });
                currentDate.add(1, 'day');
            }
        }
        
        onConfirm({
            visit_type: 'play_camp',
            play_camp_duration: duration,
            play_sessions: playSessions,
            scheduled_tasks: tasks
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <Card className="border-0 shadow-sm rounded-2xl">
                <CardHeader>
                    <CardTitle className="text-lg">Play Camp Check-In</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Duration *</Label>
                        <Select value={duration} onValueChange={setDuration}>
                            <SelectTrigger className="rounded-xl">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="half_day">Half Day (2 play sessions)</SelectItem>
                                <SelectItem value="full_day">Full Day (4 play sessions)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="pt-4 border-t border-stone-100">
                        <div className="flex items-center space-x-2">
                            <Checkbox 
                                id="needfecal" 
                                checked={needFecal}
                                onCheckedChange={setNeedFecal}
                            />
                            <Label htmlFor="needfecal" className="cursor-pointer">
                                Need Fecal?
                            </Label>
                        </div>
                    </div>

                    <div className="bg-emerald-50 rounded-xl p-4 text-sm text-emerald-700">
                        <p className="font-medium mb-2">Play Camp Includes:</p>
                        <ul className="space-y-1 text-xs">
                            <li>• {duration === 'half_day' ? '2' : '4'} supervised play sessions</li>
                            <li>• Socialization with approved pets</li>
                            <li>• Fresh water available</li>
                            <li>• Same-day pickup</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>

            <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={onCancel} className="flex-1 rounded-xl">
                    Back
                </Button>
                <Button type="submit" className="flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-600">
                    Complete Check-In
                </Button>
            </div>
        </form>
    );
}