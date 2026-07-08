import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const all = await base44.asServiceRole.entities.CallRecord.list('-call_date', 5000);
    // Fix missed calls: inbound with no transcript (no one spoke to the caller)
    // Also re-fix records already flagged missed but with stale AI fields
    const toFix = all.filter(c =>
      c.call_direction === 'inbound' &&
      !c.transcript &&
      (
        !c.missed_call ||
        c.caller_intent !== null ||
        c.caller_type !== 'not_applicable' ||
        c.bookable !== 'no' ||
        c.team_member !== null
      )
    );

    let updated = 0;
    for (const c of toFix) {
      await base44.asServiceRole.entities.CallRecord.update(c.id, { missed_call: true, team_member: null, caller_intent: null, caller_type: "not_applicable", bookable: "no" });
      updated++;
      await new Promise(r => setTimeout(r, 150));
    }

    return Response.json({ updated, total: all.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});