import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import moment from 'npm:moment-timezone@0.5.45';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
  const tz = settings[0]?.global_timezone || 'America/New_York';
  const yesterday = moment().tz(tz).subtract(1, 'day').format('YYYY-MM-DD');

  // Fetch all currently checked-in boarding visits
  const visits = await base44.asServiceRole.entities.Visit.filter({
    status: 'checked_in',
    visit_type: 'boarding'
  });

  let updated = 0;
  for (const visit of visits) {
    const sentDates = visit.picture_sent_dates || [];
    const takenDates = visit.picture_taken_dates || [];

    // Remove yesterday's entries so today starts fresh
    const newSentDates = sentDates.filter(d => d !== yesterday);
    const newTakenDates = takenDates.filter(d => d?.date !== yesterday);

    const changed =
      newSentDates.length !== sentDates.length ||
      newTakenDates.length !== takenDates.length;

    if (changed) {
      await base44.asServiceRole.entities.Visit.update(visit.id, {
        picture_sent_dates: newSentDates,
        picture_sent: newSentDates.length > 0,
        picture_taken_dates: newTakenDates,
      });
      updated++;
    }
  }

  return Response.json({ success: true, visits_checked: visits.length, visits_updated: updated });
});