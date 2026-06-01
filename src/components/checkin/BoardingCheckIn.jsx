import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
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
    const inferMealTimesFromFrequency = (freq) => {
        const f = (freq || '').toLowerCase();
        const isTwice = f.includes('twice') || f.includes('bid') || (f.includes('am') && f.includes('pm'));
        const isPmOnly = !isTwice && (f.includes('pm') || f.includes('dinner') || f.includes('evening'));
        const isAmOnly = !isTwice && !isPmOnly && (f.includes('am') || f.includes('morning') || f.includes('breakfast'));
        // Default (unknown frequency): breakfast only
        return [
            { meal: 'Breakfast', time: '9:00 AM', enabled: !isPmOnly },
            { meal: 'Lunch', time: '12:00 PM', enabled: false },
            { meal: 'Dinner', time: '5:30 PM', enabled: isPmOnly || isTwice },
        ];
    };

    const [visitMedications, setVisitMedications] = useState(
        pet.medications?.length > 0 ? pet.medications.map(m => ({
            ...m,
            meal_times: inferMealTimesFromFrequency(m.frequency)
        })) : []
    );
    const defaultMedTimes = () => {
        const times = [];
        if (feedingFrequency === 'Just Breakfast' || feedingFrequency === 'Two Meals' || feedingFrequency === 'Three Meals') {
            times.push({ meal: 'Breakfast', time: '9:00 AM', enabled: true });
        }
        if (feedingFrequency === 'Three Meals') {
            times.push({ meal: 'Lunch', time: '12:00 PM', enabled: true });
        }
        if (feedingFrequency === 'Just Dinner' || feedingFrequency === 'Two Meals' || feedingFrequency === 'Three Meals') {
            times.push({ meal: 'Dinner', time: '5:30 PM', enabled: true });
        }
        // Always include all three, disable the ones not in feeding plan
        const allMeals = [
            { meal: 'Breakfast', time: '9:00 AM', enabled: times.some(t => t.meal === 'Breakfast') },
            { meal: 'Lunch', time: '12:00 PM', enabled: times.some(t => t.meal === 'Lunch') },
            { meal: 'Dinner', time: '5:30 PM', enabled: times.some(t => t.meal === 'Dinner') },
        ];
        return allMeals;
    };

    const addMedication = () => {
        setVisitMedications(prev => [...prev, { name: '', dosage: '', meal_times: defaultMedTimes(), instructions: '' }]);
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



    const handleSubmit = (e) => {
    e.preventDefault();

    if (!checkoutDate) {
        alert('Please select a checkout date');
        return;
    }

    // Build core daily tasks locally (no API call needed)
    const checkInDate = moment().format('YYYY-MM-DD');
    let tasks = [];

    // Dog core tasks
    const dogCoreTasks = [
        { type: 'First Walk', time: '7:30 AM' },
        { type: 'After Breakfast Walk', time: '11:00 AM' },
        { type: 'Afternoon Walk', time: '3:00 PM' },
        { type: 'Before Bed Walk', time: '8:00 PM' },
        { type: 'Refresh Water', time: '' },
        { type: 'Feces Observed', time: '' },
    ];
    // Cat core tasks
    const catCoreTasks = [
        { type: 'Check Litterbox', time: '9:00 AM' },
        { type: 'Check Litterbox', time: '7:30 PM' },
        { type: 'Clean Beds and Kennel', time: '' },
        { type: 'Refresh Water', time: '' },
        { type: 'Urine Observed', time: '' },
        { type: 'Feces Observed', time: '' },
    ];
    const coreTasks = pet.species === 'Cat' ? catCoreTasks : dogCoreTasks;

    const nowHour = moment().hour();
    const nowMinute = moment().minute();

    // Parse "H:MM AM/PM" → {hour, minute} in 24h
    const parseTime = (timeStr) => {
        if (!timeStr) return null;
        const parts = timeStr.match(/(\d+):(\d+)\s(AM|PM)/);
        if (!parts) return null;
        let h = parseInt(parts[1]);
        const m = parseInt(parts[2]);
        if (parts[3] === 'PM' && h !== 12) h += 12;
        if (parts[3] === 'AM' && h === 12) h = 0;
        return { hour: h, minute: m };
    };

    let currentDate = moment(checkInDate);
    while (currentDate.format('YYYY-MM-DD') <= checkoutDate) {
        const isCheckInDay = currentDate.format('YYYY-MM-DD') === checkInDate;
        coreTasks.forEach(task => {
            // On check-in day, skip timed tasks whose time has already passed
            if (isCheckInDay && task.time) {
                const t = parseTime(task.time);
                if (t && (nowHour > t.hour || (nowHour === t.hour && nowMinute >= t.minute))) {
                    return; // skip — time has passed
                }
            }
            tasks.push({ ...task, date: currentDate.format('YYYY-MM-DD'), is_template: true, completed: false, completed_at: null });
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
        addFeedingTasksDaily('Dinner', 17, 30);
    } else if (feedingFrequency === 'Two Meals') {
        addFeedingTasksDaily('Breakfast', 9, 0);
        addFeedingTasksDaily('Dinner', 17, 30);
    } else if (feedingFrequency === 'Three Meals') {
        addFeedingTasksDaily('Breakfast', 9, 0);
        addFeedingTasksDaily('Lunch', 12, 0);
        addFeedingTasksDaily('Dinner', 17, 30);
    }
    
    // Add daily "Ate" task for every day of the stay
    let ateDate = moment(checkInDate);
    while (ateDate.format('YYYY-MM-DD') <= checkoutDate) {
        tasks.push({ type: 'Ate', time: '', date: ateDate.format('YYYY-MM-DD'), is_template: true, completed: false, completed_at: null });
        ateDate.add(1, 'day');
    }
        
    // Medications - expand daily tasks for each enabled meal time
    const medCheckInHour = moment().hour();
    const medCheckInMinute = moment().minute();

    visitMedications.forEach(med => {
        // "As Needed" medications: add one persistent task per day (no time, never auto-completes)
        if (med.frequency === 'As Needed') {
            let d = moment(checkInDate);
            while (d.format('YYYY-MM-DD') <= checkoutDate) {
                tasks.push({
                    type: 'Medication',
                    time: '',
                    date: d.format('YYYY-MM-DD'),
                    is_template: true,
                    is_as_needed: true,
                    completed: false,
                    completed_at: null,
                    medication_name: med.name,
                    notes: med.instructions || 'As Needed'
                });
                d.add(1, 'day');
            }
            return;
        }

        const mealTimes = med.meal_times || [];
        mealTimes.filter(mt => mt.enabled && mt.time).forEach(mt => {
            const parsed = parseTime(mt.time);
            if (!parsed) return;
            const startDate = (medCheckInHour < parsed.hour || (medCheckInHour === parsed.hour && medCheckInMinute < parsed.minute))
                ? checkInDate
                : moment(checkInDate).add(1, 'day').format('YYYY-MM-DD');
            let d = moment(startDate);
            while (d.format('YYYY-MM-DD') <= checkoutDate) {
                tasks.push({
                    type: 'Medication',
                    time: mt.time,
                    date: d.format('YYYY-MM-DD'),
                    is_template: true,
                    completed: false,
                    completed_at: null,
                    medication_name: med.name,
                    notes: `With ${mt.meal}`
                });
                d.add(1, 'day');
            }
        });
    });

    // Add CBD Chews at meal times if selected
    if (addCBDChews) {
        const mealTimes = {
            'Breakfast': { hour: 9, minute: 0, time: '9:00 AM' },
            'Lunch': { hour: 12, minute: 0, time: '12:00 PM' },
            'Dinner': { hour: 17, minute: 30, time: '5:30 PM' }
        };

        const addCBDTask = (mealName) => {
            const mealInfo = mealTimes[mealName];
            const startDate = (feedingCheckInHour < mealInfo.hour || (feedingCheckInHour === mealInfo.hour && feedingCheckInMinute < mealInfo.minute))
                ? checkInDate
                : moment(checkInDate).add(1, 'day').format('YYYY-MM-DD');
            let d = moment(startDate);
            while (d.format('YYYY-MM-DD') <= checkoutDate) {
                tasks.push({
                    type: 'Medication',
                    time: mealInfo.time,
                    date: d.format('YYYY-MM-DD'),
                    is_template: true,
                    completed: false,
                    completed_at: null,
                    medication_name: 'CBD Chews',
                    notes: `With ${mealName}`
                });
                d.add(1, 'day');
            }
        };

        if (feedingFrequency === 'Just Breakfast') {
            addCBDTask('Breakfast');
        } else if (feedingFrequency === 'Just Dinner') {
            addCBDTask('Dinner');
        } else if (feedingFrequency === 'Two Meals') {
            addCBDTask('Breakfast');
            addCBDTask('Dinner');
        } else if (feedingFrequency === 'Three Meals') {
            addCBDTask('Breakfast');
            addCBDTask('Lunch');
            addCBDTask('Dinner');
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
            'Dinner': { hour: 17, minute: 30, time: '5:30 PM' }
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

    // Add "Give Feeding Enrichment Toy" once daily if selected (3 PM)
    if (addFeedingEnrichment) {
        const enrichStartDate = (nowHour < 15)
            ? checkInDate
            : moment(checkInDate).add(1, 'day').format('YYYY-MM-DD');
        let currentDate = moment(enrichStartDate);
        while (currentDate.format('YYYY-MM-DD') <= checkoutDate) {
            tasks.push({
                type: 'Give Feeding Enrichment Toy',
                time: '3:00 PM',
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

    // Add "Enter All Charges" task on day before checkout at 6 PM
    const chargesDueDate = moment(checkoutDate).subtract(1, 'day').format('YYYY-MM-DD');
    tasks.push({
        type: 'Enter All Charges',
        time: '6:00 PM',
        date: chargesDueDate,
        is_template: true,
        completed: false,
        completed_at: null
    });
        
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
                                <SelectItem value="Just Dinner">Just Dinner (5:30 PM)</SelectItem>
                                <SelectItem value="Two Meals">Two Meals (9 AM & 5:30 PM)</SelectItem>
                                <SelectItem value="Three Meals">Three Meals (9 AM, 12 PM & 5:30 PM)</SelectItem>
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
                                {med.frequency === 'As Needed' && (
                                    <p className="text-xs text-purple-600 italic">This medication will appear daily as an as-needed task. Staff can log each administration.</p>
                                )}
                                {med.frequency !== 'As Needed' && (
                                <div className="space-y-1">
                                    <p className="text-xs text-purple-700 font-medium">Give with meal (edit time if needed):</p>
                                    {(med.meal_times || []).map((mt, mi) => (
                                        <div key={mi} className="flex items-center gap-2">
                                            <Checkbox
                                                checked={mt.enabled}
                                                onCheckedChange={(v) => {
                                                    const updated = [...visitMedications];
                                                    updated[index].meal_times[mi].enabled = !!v;
                                                    setVisitMedications(updated);
                                                }}
                                            />
                                            <span className="text-xs text-purple-800 w-16">{mt.meal}</span>
                                            <Input
                                                value={mt.time}
                                                onChange={(e) => {
                                                    const updated = [...visitMedications];
                                                    updated[index].meal_times[mi].time = e.target.value;
                                                    setVisitMedications(updated);
                                                }}
                                                className="rounded-xl bg-white text-xs h-7 w-28"
                                                placeholder="e.g. 9:00 AM"
                                            />
                                        </div>
                                    ))}
                                </div>
                                )}
                                <Input
                                    placeholder={med.frequency === 'As Needed' ? "When/why to give this medication (required)" : "Instructions (optional)"}
                                    value={med.instructions}
                                    onChange={(e) => updateMedication(index, 'instructions', e.target.value)}
                                    className="rounded-xl bg-white text-sm h-8"
                                />
                                </div>
                                ))}
                    </div>

                    <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700">
                        <p className="font-medium mb-1">Automatic Daily Schedule (repeat daily):</p>
                        <ul className="space-y-1 text-xs">
                            {pet.species === 'Dog' && (
                                <>
                                    <li>• First Walk due by 7:30 AM</li>
                                    <li>• After Breakfast Walk due by 11:00 AM</li>
                                    <li>• Afternoon Walk due by 3:00 PM</li>
                                    <li>• Before Bed Walk due by 8:00 PM</li>
                                    <li>• Refresh Water (daily, no set time)</li>
                                    <li>• Feces Observed (daily, no set time)</li>
                                    <li>• Ate (daily, no set time)</li>
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
                                    <li>• Ate (daily, no set time)</li>
                                    </>
                                    )}
                            <li>• Feeding: {feedingFrequency === 'Just Breakfast' && 'Breakfast at 9 AM'} {feedingFrequency === 'Just Dinner' && 'Dinner at 5:30 PM'} {feedingFrequency === 'Two Meals' && 'Breakfast at 9 AM & Dinner at 5:30 PM'} {feedingFrequency === 'Three Meals' && 'Breakfast at 9 AM, Lunch at 12 PM & Dinner at 5:30 PM'}</li>
                            {pet.medications?.length > 0 && <li>• Medications as scheduled</li>}
                            {addCBDChews && <li>• CBD Chews (with each meal)</li>}
                            {addProbiotic && <li>• Probiotic added to each meal</li>}
                            {addFeedingEnrichment && <li>• Give Feeding Enrichment Toy (3:00 PM daily)</li>}
                            {addBath && <li>• Schedule Bath</li>}
                        </ul>
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