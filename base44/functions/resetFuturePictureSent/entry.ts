import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user || user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'manager') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cutoffDate = '2026-05-05'; // Remove May 5th and everything after

  const visits = await base44.asServiceRole.entities.Visit.filter({ status: 'checked_in' });

  let updated = 0;
  for (const visit of visits) {
    const sentDates = visit.picture_sent_dates || [];
    const filteredSent = sentDates.filter(d => d < cutoffDate);

    const takenDates = visit.picture_taken_dates || [];
    const filteredTaken = takenDates.filter(d => d?.date < cutoffDate);

    const sentChanged = filteredSent.length !== sentDates.length;
    const takenChanged = filteredTaken.length !== takenDates.length;

    if (sentChanged || takenChanged) {
      await base44.asServiceRole.entities.Visit.update(visit.id, {
        picture_sent_dates: filteredSent,
        picture_sent: filteredSent.length > 0,
        picture_taken_dates: filteredTaken,
      });
      updated++;
    }
  }

  return Response.json({ success: true, visits_checked: visits.length, visits_updated: updated });
});