import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { aiNotesIndicatesMissed } from '../../shared/staffMatching.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const all = await base44.asServiceRole.entities.CallRecord.list('-call_date', 5000);
    // New logic: missed call = inbound where no team member spoke
    // Case 1: should be missed but isn't (inbound, no team_member, not flagged or has stale fields)
    const shouldBeMissed = all.filter(c =>
      c.call_direction === 'inbound' &&
      (!c.team_member || aiNotesIndicatesMissed(c.ai_notes)) &&
      (
        !c.missed_call ||
        c.caller_intent !== null ||
        c.caller_type !== 'not_applicable' ||
        c.bookable !== 'no'
      )
    );
    // Case 2: should NOT be missed but is (inbound, has team_member, flagged as missed)
    const shouldNotBeMissed = all.filter(c =>
      c.call_direction === 'inbound' &&
      c.team_member &&
      c.missed_call &&
      !aiNotesIndicatesMissed(c.ai_notes)
    );

    let updated = 0;
    for (const c of shouldBeMissed) {
      await base44.asServiceRole.entities.CallRecord.update(c.id, { missed_call: true, team_member: null, caller_intent: null, caller_type: "not_applicable", bookable: "no" });
      updated++;
      await new Promise(r => setTimeout(r, 150));
    }
    for (const c of shouldNotBeMissed) {
      await base44.asServiceRole.entities.CallRecord.update(c.id, { missed_call: false });
      updated++;
      await new Promise(r => setTimeout(r, 150));
    }

    return Response.json({ updated, flaggedMissed: shouldBeMissed.length, unflagged: shouldNotBeMissed.length, total: all.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});