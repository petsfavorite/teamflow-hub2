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

        let tasks = [];

        if (species === 'Dog') {
            tasks = [
                {
                    type: 'AM Walk',
                    time: '8:30 AM',
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
                    type: 'Lunch Walk',
                    time: '1:00 PM',
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
                    type: 'Bedtime Walk',
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