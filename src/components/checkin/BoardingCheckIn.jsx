import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Plus, Trash2, RefreshCw } from "lucide-react";
import moment from 'moment';

export default function BoardingCheckIn({ pet, onConfirm, onCancel }) {
     const [checkoutDate, setCheckoutDate] = useState('');
     const [feedingFrequency, setFeedingFrequency] = useState(pet.feeding_frequency || 'Two Meals');
     const [addPlayCamp, setAddPlayCamp] = useState(false);
     const [whatWasBrought, setWhatWasBrought] = useState('');
     const [needFecal, setNeedFecal] = useState(false);
     const [needUrine, setNeedUrine] = useState(false);
     const [addCBDChews, setAddCBDChews] = useState(false);
     const [addProbiotic, setAddProbiotic] = useState(false);
     const [addFeedingEnrichment, setAddFeedingEnrichment] = useState(false);
     const [addBath, setAddBath] = useState(false);
     const [visitMedications, setVisitMedications] = useState(
         pet.medications?.length > 0 ? pet.medications.map(m => ({ ...m })) : []
     );
     const [generatedTasks, setGeneratedTasks] = useState([]);
     const [loadingTasks, setLoadingTasks] = useState(false);

    const addMedication = () => {
        setVisitMedications(prev => [...prev, { name: '', dosage: '', frequency: '', instructions: '' }]);
    };
    const updateMedication = (index, field, value) => {
        setVisitMedications(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };
    const removeMedication = (index) => {
        setVisitMedications(prev => prev.filter((_, i) => i !== index));
    };

    // Generate tasks when component mounts
     useEffect(() => {
         const generateTasks = async () => {
             setLoadingTasks(true);
             const checkInDate = moment().format('YYYY-MM-DD');
             const checkInTime = new Date().toISOString();
             try {
                 const response = await base44.functions.invoke('generateBoardingTasks', {
                     species: pet.species,
                     checkInDate: checkInDate,
                     checkInTime: checkInTime
                 });
                 setGeneratedTasks(response.data.tasks || []);
             } catch (error) {
                 console.error('Error generating tasks:', error);
                 setGeneratedTasks([]);
             }
             setLoadingTasks(false);
         };
         generateTasks();
     }, [pet.species]);

    const handleSubmit = (e) => {
    e.preventDefault();

    if (!checkoutDate) {
        alert('Please select a checkout date');
        return;
    }

    // Start with auto-generated core tasks (walks, etc. already included)
    // Spread generated tasks across all days from check-in to checkout
    const checkInDate = moment().format('YYYY-MM-DD');
    const checkOutMoment = moment(checkoutDate);
    let tasks = [];
    
    // Expand generated tasks to each day
    // Each task starts on its designated date and repeats daily through checkout
    let currentDate = moment(checkInDate);
    while (currentDate.format('YYYY-MM-DD') <= checkoutDate) {
        generatedTasks.forEach(task => {
            const taskStartDate = moment(task.date);
            // Only add task if we're on or after its start date
            if (currentDate.isSameOrAfter(taskStartDate)) {
                tasks.push({
                    ...task,
                    date: currentDate.format('YYYY-MM-DD'),
                    is_template: true
                });
            }
        });
        currentDate.add(1, 'day');
    }

    // Add last day task: Billing at 9 AM
    tasks.push({ 
        type: 'Billing', 
        time: '9:00 AM', 
        date: checkoutDate,
        is_template: false, 
        completed: false, 
        completed_at: null 
    });

    // Feeding tasks - expand across all days
    const feedingCheckInHour = moment().hour();
    const feedingCheckInMinute = moment().minute();

    const addFeedingTasksDaily = (type, hour, minute) => {
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
        const taskTime = `${String(displayHour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;
        const startDate = feedingCheckInHour < hour || (feedingCheckInHour === hour && feedingCheckInMinute < minute) 
            ? checkInDate 
            : moment(checkInDate).add(1, 'day').format('YYYY-MM-DD');
        
        // Expand across all days from start date to checkout
        let currentDate = moment(startDate);
        while (currentDate.format('YYYY-MM-DD') <= checkoutDate) {
            tasks.push({ 
                type, 
                time: taskTime, 
                date: currentDate.format('YYYY-MM-DD'), 
                is_template: true, 
                completed: false, 
                completed_at: null
            });
            currentDate.add(1, 'day');
        }
    };

    if (feedingFrequency === 'Just Breakfast') {
        addFeedingTasksDaily('Breakfast', 9, 0);
    } else if (feedingFrequency === 'Just Dinner') {
        addFeedingTasksDaily('Dinner', 18, 0);
    } else if (feedingFrequency === 'Two Meals') {
        addFeedingTasksDaily('Breakfast', 9, 0);
        addFeedingTasksDaily('Dinner', 18, 0);
    } else if (feedingFrequency === 'Three Meals') {
        addFeedingTasksDaily('Breakfast', 9, 0);
        addFeedingTasksDaily('Lunch', 12, 0);
        addFeedingTasksDaily('Dinner', 18, 0);
    }
    
    // Add daily "Ate" check task
    tasks.push({ type: 'Ate', time: '', date: checkInDate, is_template: true, completed: false, completed_at: null, recurrence_type: 'days', recurrence_interval: 1 });
        
    // Medications (automatically added for boarding based on frequency)
    const checkInMoment = moment();
    const checkInHour = checkInMoment.hour();
    const checkInMinute = checkInMoment.minute();

    visitMedications.forEach(med => {
        if (med.frequency === 'Once Daily in AM') {
            // 9 AM
            if (checkInHour < 9 || (checkInHour === 9 && checkInMinute === 0)) {
                tasks.push({ type: 'Medication', time: '9:00 AM', date: checkInDate, is_template: true, completed: false, completed_at: null, medication_name: med.name, recurrence_type: 'days', recurrence_interval: 1 });
            } else {
                tasks.push({ type: 'Medication', time: '9:00 AM', date: moment(checkInDate).add(1, 'day').format('YYYY-MM-DD'), is_template: true, completed: false, completed_at: null, medication_name: med.name, recurrence_type: 'days', recurrence_interval: 1 });
            }
        } else if (med.frequency === 'Once Daily in PM') {
            // 6 PM
            if (checkInHour < 18 || (checkInHour === 18 && checkInMinute === 0)) {
                tasks.push({ type: 'Medication', time: '6:00 PM', date: checkInDate, is_template: true, completed: false, completed_at: null, medication_name: med.name, recurrence_type: 'days', recurrence_interval: 1 });
            } else {
                tasks.push({ type: 'Medication', time: '6:00 PM', date: moment(checkInDate).add(1, 'day').format('YYYY-MM-DD'), is_template: true, completed: false, completed_at: null, medication_name: med.name, recurrence_type: 'days', recurrence_interval: 1 });
            }
        } else if (med.frequency === 'Twice Daily') {
            // 9 AM
            if (checkInHour < 9 || (checkInHour === 9 && checkInMinute === 0)) {
                tasks.push({ type: 'Medication', time: '9:00 AM', date: checkInDate, is_template: true, completed: false, completed_at: null, medication_name: med.name, recurrence_type: 'days', recurrence_interval: 1 });
            } else {
                tasks.push({ type: 'Medication', time: '9:00 AM', date: moment(checkInDate).add(1, 'day').format('YYYY-MM-DD'), is_template: true, completed: false, completed_at: null, medication_name: med.name, recurrence_type: 'days', recurrence_interval: 1 });
            }

            // 6 PM
            if (checkInHour < 18 || (checkInHour === 18 && checkInMinute === 0)) {
                tasks.push({ type: 'Medication', time: '6:00 PM', date: checkInDate, is_template: true, completed: false, completed_at: null, medication_name: med.name, recurrence_type: 'days', recurrence_interval: 1 });
            } else {
                tasks.push({ type: 'Medication', time: '6:00 PM', date: moment(checkInDate).add(1, 'day').format('YYYY-MM-DD'), is_template: true, completed: false, completed_at: null, medication_name: med.name, recurrence_type: 'days', recurrence_interval: 1 });
            }
        }
    });

    // Add CBD Chews as AM and PM medications if selected
    if (addCBDChews) {
        // AM - 9 AM (only if breakfast happens that day)
        const cbdAmStartDate = checkInHour < 9 || (checkInHour === 9 && checkInMinute === 0)
            ? checkInDate
            : moment(checkInDate).add(1, 'day').format('YYYY-MM-DD');

        let currentDate = moment(cbdAmStartDate);
        while (currentDate.format('YYYY-MM-DD') <= checkoutDate) {
            tasks.push({
                type: 'Medication',
                time: '9:00 AM',
                date: currentDate.format('YYYY-MM-DD'),
                is_template: true,
                completed: false,
                completed_at: null,
                medication_name: 'CBD Chews'
            });
            currentDate.add(1, 'day');
        }

        // PM - 6 PM
        const cbdPmStartDate = checkInHour < 18 || (checkInHour === 18 && checkInMinute === 0)
            ? checkInDate
            : moment(checkInDate).add(1, 'day').format('YYYY-MM-DD');

        currentDate = moment(cbdPmStartDate);
        while (currentDate.format('YYYY-MM-DD') <= checkoutDate) {
            tasks.push({
                type: 'Medication',
                time: '6:00 PM',
                date: currentDate.format('YYYY-MM-DD'),
                is_template: true,
                completed: false,
                completed_at: null,
                medication_name: 'CBD Chews'
            });
            currentDate.add(1, 'day');
        }
    }
        
    // Add "Collect Feces" if requested
    if (needFecal) {
        const checkInDate = moment().format('YYYY-MM-DD');
        let currentDate = moment(checkInDate);
        while (currentDate.format('YYYY-MM-DD') <= checkoutDate) {
            tasks.push({ type: 'Collect Feces', time: '', date: currentDate.format('YYYY-MM-DD'), is_template: false, completed: false, completed_at: null, collected: false });
            currentDate.add(1, 'day');
        }
    }

    // Add "Collect Urine" if requested
    if (needUrine) {
        const checkInDate = moment().format('YYYY-MM-DD');
        let currentDate = moment(checkInDate);
        while (currentDate.format('YYYY-MM-DD') <= checkoutDate) {
            tasks.push({ type: 'Collect Urine', time: '', date: currentDate.format('YYYY-MM-DD'), is_template: false, completed: false, completed_at: null, collected: false });
            currentDate.add(1, 'day');
        }
    }

    // Add "Probiotic Added to Meal" for each feeding if selected
    if (addProbiotic) {
        const mealTimes = {
            'Breakfast': { hour: 9, minute: 0, time: '9:00 AM' },
            'Lunch': { hour: 12, minute: 0, time: '12:00 PM' },
            'Dinner': { hour: 18, minute: 0, time: '6:00 PM' }
        };

        const addProbioticTask = (type) => {
            const mealInfo = mealTimes[type];
            const startDate = feedingCheckInHour < mealInfo.hour || (feedingCheckInHour === mealInfo.hour && feedingCheckInMinute < mealInfo.minute) 
                ? checkInDate 
                : moment(checkInDate).add(1, 'day').format('YYYY-MM-DD');

            let currentDate = moment(startDate);
            while (currentDate.format('YYYY-MM-DD') <= checkoutDate) {
                tasks.push({
                    type: 'Probiotic Added to Meal',
                    time: mealInfo.time,
                    date: currentDate.format('YYYY-MM-DD'),
                    is_template: true,
                    completed: false,
                    completed_at: null,
                    notes: type
                });
                currentDate.add(1, 'day');
            }
        };

        if (feedingFrequency === 'Just Breakfast') {
            addProbioticTask('Breakfast');
        } else if (feedingFrequency === 'Just Dinner') {
            addProbioticTask('Dinner');
        } else if (feedingFrequency === 'Two Meals') {
            addProbioticTask('Breakfast');
            addProbioticTask('Dinner');
        } else if (feedingFrequency === 'Three Meals') {
            addProbioticTask('Breakfast');
            addProbioticTask('Lunch');
            addProbioticTask('Dinner');
        }
    }

    // Add "Give Feeding Enrichment Toy" once daily if selected (6 PM)
    if (addFeedingEnrichment) {
        let currentDate = moment(checkInDate);
        while (currentDate.format('YYYY-MM-DD') <= checkoutDate) {
            tasks.push({
                type: 'Give Feeding Enrichment Toy',
                time: '6:00 PM',
                date: currentDate.format('YYYY-MM-DD'),
                is_template: true,
                completed: false,
                completed_at: null
            });
            currentDate.add(1, 'day');
        }
    }

    // Add "Schedule Bath" on first day if selected
    if (addBath) {
        tasks.push({
            type: 'Schedule Bath',
            time: '',
            date: checkInDate,
            is_template: true,
            completed: false,
            completed_at: null
        });
    }
        
    // Add 4 Play Session tasks per weekday if play camp is selected
    if (addPlayCamp && pet.species === 'Dog') {
        let currentDate = moment(checkInDate);
        while (currentDate.format('YYYY-MM-DD') <= checkoutDate) {
            const dow = currentDate.day(); // 0=Sun, 6=Sat
            if (dow >= 1 && dow <= 5) { // weekdays only
                for (let i = 0; i < 4; i++) {
                    tasks.push({
                        type: 'Play Session',
                        time: '',
                        date: currentDate.format('YYYY-MM-DD'),
                        is_template: false,
                        completed: false,
                        completed_at: null,
                        completed_by: null,
                        notes: `Session ${i + 1}`
                    });
                }
            }
            currentDate.add(1, 'day');
        }
    }
        
    onConfirm({
        visit_type: 'boarding',
        scheduled_checkout_date: checkoutDate,
        feeding_frequency: feedingFrequency,
        scheduled_tasks: tasks,
        play_camp_duration: addPlayCamp ? 'full_day' : null,
        what_was_brought: whatWasBrought,
        visit_medications: visitMedications
    });
    };

    return (
         <form onSubmit={handleSubmit} className="space-y-4">
             <Card className="border-0 shadow-sm rounded-2xl">
                <CardHeader>
                    <CardTitle className="text-lg">Boarding Check-In</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Scheduled Checkout Date *</Label>
                        <Input
                            type="date"
                            value={checkoutDate}
                            onChange={(e) => setCheckoutDate(e.target.value)}
                            className="rounded-xl"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Feeding Frequency *</Label>
                        <Select value={feedingFrequency} onValueChange={setFeedingFrequency}>
                            <SelectTrigger className="rounded-xl">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Just Breakfast">Just Breakfast (9 AM)</SelectItem>
                                <SelectItem value="Just Dinner">Just Dinner (6 PM)</SelectItem>
                                <SelectItem value="Two Meals">Two Meals (9 AM & 6 PM)</SelectItem>
                                <SelectItem value="Three Meals">Three Meals (9 AM, 12 PM & 6 PM)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>What Was Brought</Label>
                        <Textarea
                            value={whatWasBrought}
                            onChange={(e) => setWhatWasBrought(e.target.value)}
                            placeholder="List items brought (food, toys, bedding, medications, etc.)"
                            className="rounded-xl min-h-[100px]"
                        />
                    </div>

                    <div className="pt-4 border-t border-stone-100">
                        <div className="flex items-center space-x-2 mb-2">
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
                                id="needurine" 
                                checked={needUrine}
                                onCheckedChange={setNeedUrine}
                            />
                            <Label htmlFor="needurine" className="cursor-pointer">
                                Need Urine?
                            </Label>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-stone-100 space-y-2">
                         <div className="flex items-center space-x-2">
                             <Checkbox 
                                 id="playcamp" 
                                 checked={addPlayCamp}
                                 onCheckedChange={setAddPlayCamp}
                             />
                             <Label htmlFor="playcamp" className="cursor-pointer">
                                 Add Day Camp
                             </Label>
                         </div>
                         <div className="flex items-center space-x-2">
                             <Checkbox 
                                 id="cbdchews" 
                                 checked={addCBDChews}
                                 onCheckedChange={setAddCBDChews}
                             />
                             <Label htmlFor="cbdchews" className="cursor-pointer">
                                 Add CBD Chews
                             </Label>
                         </div>
                         <div className="flex items-center space-x-2">
                             <Checkbox 
                                 id="probiotic" 
                                 checked={addProbiotic}
                                 onCheckedChange={setAddProbiotic}
                             />
                             <Label htmlFor="probiotic" className="cursor-pointer">
                                 Add Probiotic
                             </Label>
                         </div>
                         <div className="flex items-center space-x-2">
                             <Checkbox 
                                 id="feedingenrichment" 
                                 checked={addFeedingEnrichment}
                                 onCheckedChange={setAddFeedingEnrichment}
                             />
                             <Label htmlFor="feedingenrichment" className="cursor-pointer">
                                 Add Feeding Enrichment Toy
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

                    {/* Medications for this visit */}
                    <div className="pt-4 border-t border-stone-100 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="text-sm font-medium">Medications for this visit</Label>
                                {pet.medication_notes && (
                                    <p className="text-xs text-stone-500 mt-0.5">{pet.medication_notes}</p>
                                )}
                            </div>
                            <Button type="button" size="sm" onClick={addMedication} className="rounded-xl bg-purple-500 hover:bg-purple-600 h-8 text-xs">
                                <Plus className="w-3 h-3 mr-1" />
                                Add
                            </Button>
                        </div>
                        {visitMedications.length === 0 && (
                            <p className="text-xs text-stone-400 italic">No medications for this visit</p>
                        )}
                        {visitMedications.map((med, index) => (
                            <div key={index} className="p-3 bg-purple-50 rounded-xl space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-purple-700">Medication {index + 1}</span>
                                    <Button type="button" variant="ghost" size="sm" onClick={() => removeMedication(index)} className="text-rose-500 hover:bg-rose-50 h-6 w-6 p-0">
                                        <Trash2 className="w-3 h-3" />
                                    </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input placeholder="Name" value={med.name} onChange={(e) => updateMedication(index, 'name', e.target.value)} className="rounded-xl bg-white text-sm h-8" />
                                    <Input placeholder="Dosage" value={med.dosage} onChange={(e) => updateMedication(index, 'dosage', e.target.value)} className="rounded-xl bg-white text-sm h-8" />
                                </div>
                                <Select value={med.frequency} onValueChange={(v) => updateMedication(index, 'frequency', v)}>
                                    <SelectTrigger className="rounded-xl bg-white h-8 text-sm">
                                        <SelectValue placeholder="Frequency" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Once Daily in AM">Once Daily in AM (9 AM)</SelectItem>
                                        <SelectItem value="Once Daily in PM">Once Daily in PM (6 PM)</SelectItem>
                                        <SelectItem value="Twice Daily">Twice Daily (9 AM & 6 PM)</SelectItem>
                                        <SelectItem value="Custom">Custom</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input placeholder="Instructions (optional)" value={med.instructions} onChange={(e) => updateMedication(index, 'instructions', e.target.value)} className="rounded-xl bg-white text-sm h-8" />
                            </div>
                        ))}
                    </div>

                    <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700">
                        <p className="font-medium mb-1">Automatic Daily Schedule (repeat daily):</p>
                        {loadingTasks ? (
                            <div className="flex items-center gap-2 text-xs">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                Loading tasks...
                            </div>
                        ) : (
                            <ul className="space-y-1 text-xs">
                                {pet.species === 'Dog' && (
                                    <>
                                        <li>• First Walk due by 7:30 AM</li>
                                        <li>• After breakfast Walk due by 11:00 AM</li>
                                        <li>• Afternoon Walk due by 3:00 PM</li>
                                        <li>• Before bed Walk due by 8:00 PM</li>
                                        <li>• Refresh Water (daily, no set time)</li>
                                        <li>• Feces Observed (daily, no set time)</li>
                                    </>
                                )}
                                {pet.species === 'Cat' && (
                                    <>
                                        <li>• Check Litterbox due by 9:00 AM</li>
                                        <li>• Check Litterbox due by 7:30 PM</li>
                                        <li>• Clean Beds and Kennel (daily, no set time)</li>
                                        <li>• Refresh Water (daily, no set time)</li>
                                        <li>• Urine Observed (daily, no set time)</li>
                                        <li>• Feces Observed (daily, no set time)</li>
                                    </>
                                )}
                                <li>• Feeding: {feedingFrequency === 'Just Breakfast' && 'Breakfast at 9 AM'} {feedingFrequency === 'Just Dinner' && 'Dinner at 6 PM'} {feedingFrequency === 'Two Meals' && 'Breakfast at 9 AM & Dinner at 6 PM'} {feedingFrequency === 'Three Meals' && 'Breakfast at 9 AM, Lunch at 12 PM & Dinner at 6 PM'}</li>
                                {pet.medications?.length > 0 && <li>• Medications as scheduled</li>}
                                {addCBDChews && <li>• CBD Chews (9 AM & 6 PM daily)</li>}
                                {addProbiotic && <li>• Probiotic added to each meal</li>}
                                {addFeedingEnrichment && <li>• Give Feeding Enrichment Toy (6 PM daily)</li>}
                                {addBath && <li>• Schedule Bath</li>}
                            </ul>
                        )}
                    </div>
                    </CardContent>
                    </Card>

                    <div className="flex gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={onCancel} className="flex-1 rounded-xl py-6 text-base">
                    Back
                    </Button>
                    <Button type="submit" className="flex-1 rounded-xl bg-blue-500 hover:bg-blue-600 py-6 text-base">
                    Complete Check-In
                    </Button>
                    </div>
                    </form>
            );
}