import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { aiNotesIndicatesMissed } from '../../shared/staffMatching.ts';
import { isMissedCall } from '../../shared/zoomMissed.ts';

// Re-applies the app's one missed-call definition to every stored call record.
//
// An inbound call is missed when no team member spoke with the caller:
//   1. nobody answered, or
//   2. only the call queue / auto receptionist answered, or
//   3. the caller left a voicemail.
//
// Outbound calls are never missed. Run this after the definition changes.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Whole history is kept for 90 days; walk it day by day so no read cap drops records.
    const all = [];
    const dayMs = 86400000;
    const today = new Date();
    for (let d = 0; d <= 91; d++) {
      const dayStart = new Date(today.getTime() - d * dayMs);
      const dayEnd = new Date(dayStart.getTime() + dayMs);
      const batch = await base44.asServiceRole.entities.CallRecord.filter(
        { call_date: { $gte: dayStart.toISOString(), $lt: dayEnd.toISOString() } },
        '-call_date', 1000
      );
      all.push(...batch);
    }

    const changes = [];
    for (const c of all) {
      const missed = isMissedCall({
        callDirection: c.call_direction,
        zoomVerdict: c.missed_call === true ? true : null,
        queueOnly: c.queue_answered_only === true,
        aiSaysMissed: aiNotesIndicatesMissed(c.ai_notes),
        teamMember: c.team_member || null,
      });
      if (missed !== !!c.missed_call) changes.push({ id: c.id, missed_call: missed });
    }

    let updated = 0;
    for (let i = 0; i < changes.length; i += 500) {
      await base44.asServiceRole.entities.CallRecord.bulkUpdate(changes.slice(i, i + 500));
      updated += Math.min(500, changes.length - i);
    }

    return Response.json({
      total: all.length,
      nowMissed: changes.filter(c => c.missed_call).length,
      nowAnswered: changes.filter(c => !c.missed_call).length,
      updated,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});