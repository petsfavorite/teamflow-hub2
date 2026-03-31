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
    const [addBath, setAddBath] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        
        const today = moment().format('YYYY-MM-DD');
        const sessionCount = duration === 'half_day' ? 2 : 4;

        // Generate Play Session tasks for today
        const tasks = Array.from({ length: sessionCount }, (_, i) => ({
            type: 'Play Session',
            time: '',
            date: today,
            is_template: false,
            completed: false,
            completed_at: null,
            completed_by: null,
            notes: `Session ${i + 1}`
        }));

        // Add "Collect Feces" task if requested
         if (needFecal) {
             tasks.push({ 
                 type: 'Collect Feces', 
                 time: '', 
                 date: today,
                 is_template: false, 
                 completed: false, 
                 completed_at: null
             });
         }

         // Add "Schedule Bath" task if requested
         if (addBath) {
             tasks.push({
                 type: 'Schedule Bath',
                 time: '',
                 date: today,
                 is_template: false,
                 completed: false,
                 completed_at: null
             });
         }

         onConfirm({
             visit_type: 'play_camp',
             play_camp_duration: duration,
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

                    <div className="pt-4 border-t border-stone-100 space-y-2">
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
                         <div className="flex items-center space-x-2">
                             <Checkbox 
                                 id="bath" 
                                 checked={addBath}
                                 onCheckedChange={setAddBath}
                             />
                             <Label htmlFor="bath" className="cursor-pointer">
                                 Add Bath
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