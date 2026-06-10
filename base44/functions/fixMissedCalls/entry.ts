import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const all = await base44.asServiceRole.entities.CallRecord.list('-call_date', 5000);
    // Mark as missed: inbound, zero duration, no transcript (regardless of team_member value)
    const toFix = all.filter(c =>
      !c.missed_call &&
      (c.call_duration_seconds === 0 || !c.call_duration_seconds) &&
      !c.transcript &&
      c.call_direction === 'inbound'
    );

    let updated = 0;
    for (const c of toFix) {
      await base44.asServiceRole.entities.CallRecord.update(c.id, { missed_call: true, team_member: null });
      updated++;
      await new Promise(r => setTimeout(r, 150));
    }

    return Response.json({ updated, total: all.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});