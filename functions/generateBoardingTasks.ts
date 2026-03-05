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
        const getTaskDate = (timeStr) => {
            // If task time is before check-in, schedule for next day (not on check-in day)
            return isTimedTaskBeforeCheckIn(timeStr) ? 
                new Date(new Date(checkInDate).getTime() + 86400000).toISOString().split('T')[0] : 
                checkInDate;
        };

        const shouldSkipFirstDay = (timeStr) => {
            // Return true if task should NOT appear on check-in day (skip first day if time is before check-in)
            return isTimedTaskBeforeCheckIn(timeStr);
        };

        if (species === 'Dog') {
            tasks = [
                {
                    type: 'AM Walk',
                    time: '8:30 AM',
                    date: getTaskDate('8:30 AM'),
                    is_template: true,
                    completed: false,
                    completed_at: null,
                    completed_by: null,
                    notes: '',
                    recurrence_type: 'days',
                    recurrence_interval: 1,
                    last_completed_iso: null
                },
                {
                    type: 'Lunch Walk',
                    time: '1:00 PM',
                    date: getTaskDate('1:00 PM'),
                    is_template: true,
                    completed: false,
                    completed_at: null,
                    completed_by: null,
                    notes: '',
                    recurrence_type: 'days',
                    recurrence_interval: 1,
                    last_completed_iso: null
                },
                {
                    type: 'Bedtime Walk',
                    time: '7:30 PM',
                    date: getTaskDate('7:30 PM'),
                    is_template: true,
                    completed: false,
                    completed_at: null,
                    completed_by: null,
                    notes: '',
                    recurrence_type: 'days',
                    recurrence_interval: 1,
                    last_completed_iso: null
                },
                {
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
                },
                {
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
                }
            ];
        } else if (species === 'Cat') {
            tasks = [
                {
                    type: 'Check Litterbox',
                    time: '9:00 AM',
                    date: getTaskDate('9:00 AM'),
                    is_template: true,
                    completed: false,
                    completed_at: null,
                    completed_by: null,
                    notes: '',
                    recurrence_type: 'days',
                    recurrence_interval: 1,
                    last_completed_iso: null
                },
                {
                    type: 'Check Litterbox',
                    time: '7:30 PM',
                    date: getTaskDate('7:30 PM'),
                    is_template: true,
                    completed: false,
                    completed_at: null,
                    completed_by: null,
                    notes: '',
                    recurrence_type: 'days',
                    recurrence_interval: 1,
                    last_completed_iso: null
                },
                {
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
                },
                {
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
                },
                {
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
                },
                {
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
                }
            ];
        }

        return Response.json({ tasks });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});