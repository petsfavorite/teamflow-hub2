import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import OpenAI from 'npm:openai';
import { secrets } from 'base44:runtime';
import { classifyCallSpeech } from '../../shared/callSpeech.ts';
import { isMissedCall } from '../../shared/zoomMissed.ts';
import { requireAdminOnly } from '../../shared/auth.ts';

// Rebuild only speech evidence and missed flags, never bookings or review status.
// Fifty records per run, with complete structured speech results for every call.
// Repeated calls work through history newest first.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const { error } = await requireAdminOnly(base44);
    if (error) return error;
    const body = await req.json().catch(() => ({}));
    if (body.recordIds !== undefined && (!Array.isArray(body.recordIds) || body.recordIds.length > 50 || body.recordIds.some(id => typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)))) {
      return Response.json({ error: 'recordIds must contain up to 50 valid ids' }, { status: 400 });
    }
    const query = body.recordIds ? { id: { $in: body.recordIds } } : {
      call_direction: 'inbound', call_duration_seconds: { $gte: 30 },
      call_date: { $gte: new Date(Date.now() - 92 * 86400000).toISOString() },
      live_team_member_spoke: { $exists: false },
      transcript: { $exists: true, $nin: [null, '', 'No transcript', 'No transcript available', '#ERROR!'] },
    };
    const page = await base44.entities.CallRecord.filter(query, { sort: '-call_date', limit: 50, cursor: body.cursor || undefined });
    const records = page.items;
    const openai = new OpenAI({ apiKey: secrets.get('OPENAI_API_KEY'), maxRetries: 0 });
    const verdicts = await classifyCallSpeech(records.filter(r => r.call_direction === 'inbound'), openai);
    const changes = [];
    for (const record of records) {
      const speech = verdicts.find(v => v.id === record.id)?.live_team_member_spoke;
      if (record.call_direction === 'outbound') {
        if (record.missed_call) changes.push({ id: record.id, missed_call: false });
      } else if (typeof speech === 'boolean') {
        changes.push({ id: record.id, live_team_member_spoke: speech,
          missed_call: isMissedCall({ callDirection: record.call_direction, liveTeamMemberSpoke: speech }),
          ...(!speech ? { team_member: null } : {}),
        });
      }
    }
    if (body.dryRun !== true && changes.length) await base44.entities.CallRecord.bulkUpdate(changes);
    const unresolved = records.filter(r => !changes.some(c => c.id === r.id) && r.call_direction === 'inbound').map(r => r.id);
    return Response.json({ scanned: records.length, updated: body.dryRun === true ? 0 : changes.length,
      changedFlags: changes.filter(c => c.missed_call !== !!records.find(r => r.id === c.id)?.missed_call).length,
      nowMissed: changes.filter(c => c.missed_call).length, nowAnswered: changes.filter(c => !c.missed_call).length,
      remaining: await base44.entities.CallRecord.count(query), nextCursor: page.next_cursor || null,
      hasMore: page.has_more, unresolved, dryRun: body.dryRun === true,
      ...(body.recordIds ? { speechVerdicts: verdicts } : {}),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}