import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { species, checkInDate, checkInTime } = await req.json();

        if (!species || !checkInDate) {
            return Response.json({ error: 'Missing species or checkInDate' }, { status: 400 });
        }

        // Parse check-in time to compare with task times
        const checkInMoment = checkInTime ? new Date(checkInTime) : new Date();
        const checkInHour = checkInMoment.getHours();
        const checkInMinute = checkInMoment.getMinutes();

        // Helper to parse time string (e.g., "8:30 AM") and check if it's before check-in
        const isTimedTaskBeforeCheckIn = (timeStr) => {
            if (!timeStr) return false; // No time = not time-sensitive
            const parts = timeStr.match(/(\d+):(\d+)\s(AM|PM)/);
            if (!parts) return false;
            let hour = parseInt(parts[1]);
            const minute = parseInt(parts[2]);
            const isPM = parts[3] === 'PM';
            
            // Convert to 24-hour format
            if (isPM && hour !== 12) hour += 12;
            if (!isPM && hour === 12) hour = 0;
            
            // Check if task time is before check-in time
            if (hour < checkInHour) return true;
            if (hour === checkInHour && minute < checkInMinute) return true;
            return false;
        };

        let tasks = [];
        
        // Helper function to add a walk task
        const addWalkTask = (taskType, taskTime, hour, minute) => {
            // If current check-in time is after this walk's time, start tomorrow. Otherwise start today.
            const startDate = (checkInHour > hour || (checkInHour === hour && checkInMinute > minute)) 
                ? new Date(new Date(checkInDate).getTime() + 86400000).toISOString().split('T')[0]
                : checkInDate;

            tasks.push({
                type: taskType,
                time: taskTime,
                date: startDate,
                is_template: true,
                completed: false,
                completed_at: null,
                completed_by: null,
                notes: '',
                recurrence_type: 'days',
                recurrence_interval: 1,
                last_completed_iso: null
            });
        };

        if (species === 'Dog') {
            // Add four independent walk tasks
            addWalkTask('First Walk', '7:30 AM', 7, 30);
            addWalkTask('After breakfast Walk', '11:00 AM', 11, 0);
            addWalkTask('Afternoon Walk', '3:00 PM', 15, 0);
            addWalkTask('Before bed Walk', '8:00 PM', 20, 0);

            // Add remaining non-timed tasks
            tasks.push({
                type: 'Refresh Water',
                time: '',
                date: checkInDate,
                is_template: true,
                completed: false,
                completed_at: null,
                completed_by: null,
                notes: '',
                recurrence_type: 'days',
                recurrence_interval: 1,
                last_completed_iso: null
            });
            tasks.push({
                type: 'Feces Observed',
                time: '',
                date: checkInDate,
                is_template: true,
                completed: false,
                completed_at: null,
                completed_by: null,
                notes: '',
                recurrence_type: 'days',
                recurrence_interval: 1,
                last_completed_iso: null
            });
        } else if (species === 'Cat') {
            // Litter box check at 9:00 AM
            if (checkInHour < 9 || (checkInHour === 9 && checkInMinute === 0)) {
                tasks.push({
                    type: 'Check Litterbox',
                    time: '9:00 AM',
                    date: checkInDate,
                    is_template: true,
                    completed: false,
                    completed_at: null,
                    completed_by: null,
                    notes: '',
                    recurrence_type: 'days',
                    recurrence_interval: 1,
                    last_completed_iso: null
                });
            } else {
                tasks.push({
                    type: 'Check Litterbox',
                    time: '9:00 AM',
                    date: new Date(new Date(checkInDate).getTime() + 86400000).toISOString().split('T')[0],
                    is_template: true,
                    completed: false,
                    completed_at: null,
                    completed_by: null,
                    notes: '',
                    recurrence_type: 'days',
                    recurrence_interval: 1,
                    last_completed_iso: null
                });
            }

            // Litter box check at 7:30 PM
            if (checkInHour < 19 || (checkInHour === 19 && checkInMinute < 30)) {
                tasks.push({
                    type: 'Check Litterbox',
                    time: '7:30 PM',
                    date: checkInDate,
                    is_template: true,
                    completed: false,
                    completed_at: null,
                    completed_by: null,
                    notes: '',
                    recurrence_type: 'days',
                    recurrence_interval: 1,
                    last_completed_iso: null
                });
            } else {
                tasks.push({
                    type: 'Check Litterbox',
                    time: '7:30 PM',
                    date: new Date(new Date(checkInDate).getTime() + 86400000).toISOString().split('T')[0],
                    is_template: true,
                    completed: false,
                    completed_at: null,
                    completed_by: null,
                    notes: '',
                    recurrence_type: 'days',
                    recurrence_interval: 1,
                    last_completed_iso: null
                });
            }

            // Add remaining non-timed cat tasks
            tasks.push({
                type: 'Clean Beds and Kennel',
                time: '',
                date: checkInDate,
                is_template: true,
                completed: false,
                completed_at: null,
                completed_by: null,
                notes: '',
                recurrence_type: 'days',
                recurrence_interval: 1,
                last_completed_iso: null
            });
            tasks.push({
                type: 'Refresh Water',
                time: '',
                date: checkInDate,
                is_template: true,
                completed: false,
                completed_at: null,
                completed_by: null,
                notes: '',
                recurrence_type: 'days',
                recurrence_interval: 1,
                last_completed_iso: null
            });
            tasks.push({
                type: 'Urine Observed',
                time: '',
                date: checkInDate,
                is_template: true,
                completed: false,
                completed_at: null,
                completed_by: null,
                notes: '',
                recurrence_type: 'days',
                recurrence_interval: 1,
                last_completed_iso: null
            });
            tasks.push({
                type: 'Feces Observed',
                time: '',
                date: checkInDate,
                is_template: true,
                completed: false,
                completed_at: null,
                completed_by: null,
                notes: '',
                recurrence_type: 'days',
                recurrence_interval: 1,
                last_completed_iso: null
            });
        }

        return Response.json({ tasks });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});