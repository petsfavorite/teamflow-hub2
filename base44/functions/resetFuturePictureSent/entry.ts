import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user || user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'manager') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cutoffDate = '2026-04-28'; // Remove this date and everything after

  const visits = await base44.asServiceRole.entities.Visit.filter({ status: 'checked_in' });

  let updated = 0;
  for (const visit of visits) {
    const dates = visit.picture_sent_dates || [];
    const filtered = dates.filter(d => d < cutoffDate);
    if (filtered.length !== dates.length) {
      await base44.asServiceRole.entities.Visit.update(visit.id, {
        picture_sent_dates: filtered,
        picture_sent: filtered.length > 0
      });
      updated++;
    }
  }

  return Response.json({ success: true, visits_checked: visits.length, visits_updated: updated });
});