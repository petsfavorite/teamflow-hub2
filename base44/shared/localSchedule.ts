// Scheduled automations use fixed UTC cron times, which drift an hour twice a year with daylight
// saving. Instead, each job is scheduled at BOTH candidate UTC times (e.g. "5 4,5 * * *") and calls
// this gate, which lets it run only when the clock in the app timezone (AppSettings.global_timezone)
// shows the intended hour. Pass { "force": true } in the request body to run a job by hand.

export async function localScheduleGate(base44, req, hour: number, dayOfWeek?: number) {
  const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
  const tz = settings[0]?.global_timezone || 'America/New_York';

  let force = false;
  try { force = !!(await req.clone().json())?.force; } catch { /* scheduled runs have no body */ }

  const now = new Date();
  const localHour = Number(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: tz })) % 24;
  const localDow = new Date(now.toLocaleDateString('en-CA', { timeZone: tz }) + 'T12:00:00Z').getUTCDay();

  if (!force && (localHour !== hour || (dayOfWeek !== undefined && localDow !== dayOfWeek))) {
    return {
      tz,
      skip: Response.json({ skipped: true, message: `Not the scheduled local time (hour ${localHour}, wanted ${hour})` }),
    };
  }
  return { tz, skip: null };
}
