import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';
import OpenAI from 'npm:openai';
import { fuzzyMatchUser } from '../../shared/staffMatching.ts';
import { analyzeCall, buildExtraAliases } from '../../shared/callAnalysis.ts';
import { isMissedCall } from '../../shared/zoomMissed.ts';

// Live-speech rules: content overrides queue labels and staff-directory matching.
// Re-runs AI analysis on existing CallRecords that have transcripts,
// using the latest configurable prompts from AppSettings.
// Processes in chunks to avoid timeouts. Pass { offset, chunkSize } in the body.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin' && user?.role !== 'super_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Load settings (prompts + name aliases)
    const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
    const settings = settingsList?.[0] || null;
    const cdOpts = settings?.call_dashboard_options || {};
    const aiPrompts = {
      ai_caller_type_prompt: cdOpts.ai_caller_type_prompt || null,
      ai_booking_prompt: cdOpts.ai_booking_prompt || null,
      ai_booking_offered_prompt: cdOpts.ai_booking_offered_prompt || null,
      ai_missed_call_prompt: cdOpts.ai_missed_call_prompt || null,
      ai_call_topic_prompt: cdOpts.ai_call_topic_prompt || null,
      kennel_keywords: cdOpts.kennel_keywords || null,
      veterinary_keywords: cdOpts.veterinary_keywords || null,
    };
    const extraAliases = buildExtraAliases(cdOpts.name_aliases);

    const userList = await base44.asServiceRole.entities.User.list();
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const offset = Math.max(0, Number(body.offset) || 0);
    const chunkSize = Math.max(1, Math.min(50, Number(body.chunkSize) || 25));
    if (body.recordIds !== undefined && (!Array.isArray(body.recordIds) || body.recordIds.length > 50 || body.recordIds.some(id => typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)))) return Response.json({ error: 'Invalid recordIds' }, { status: 400 });

    // Get all call records that have transcripts
    const allRecords = body.recordIds
      ? await base44.asServiceRole.entities.CallRecord.filter({ id: { $in: body.recordIds } }, '-created_date', 50)
      : await base44.asServiceRole.entities.CallRecord.list('-created_date', 2000);
    let withTranscripts = allRecords.filter(r => r.transcript && r.transcript.trim());

    // Optional date filter (YYYY-MM-DD) — only process calls from that calendar day
    if (body.date) {
      withTranscripts = withTranscripts.filter(r => {
        if (!r.call_date) return false;
        return r.call_date.substring(0, 10) === body.date;
      });
    }

    const chunk = withTranscripts.slice(offset, offset + chunkSize);

    let updated = 0;
    const errors = [];

    for (const record of chunk) {
      try {
        const analysis = await analyzeCall(record.transcript, record.call_direction, userList, openai, aiPrompts);

        // Team member: AI raw name → fuzzy match
        let team_member = null;
        if (analysis.team_member) {
          team_member = fuzzyMatchUser(analysis.team_member, userList, extraAliases);
        }

        const live_team_member_spoke = analysis.live_team_member_spoke ?? record.live_team_member_spoke ?? null;
        const missed_call = isMissedCall({
          callDirection: record.call_direction, liveTeamMemberSpoke: live_team_member_spoke,
          zoomVerdict: record.missed_call === true ? true : null,
          queueOnly: record.queue_answered_only === true, teamMember: team_member,
        });
        if (missed_call) team_member = null;

        // Booking offered (only for missed bookings, not missed calls)
        let booking_offered = false;
        if (analysis.booking_outcome === "appt_not_booked" && !missed_call) {
          booking_offered = analysis.booking_offered === true;
        }

        const caller_name = analysis.caller_name || record.caller_name || null;
        const caller_type = analysis.caller_type || "not_applicable";
        const call_topic = analysis.call_topic || null;
        const booking_outcome = analysis.booking_outcome || "appt_not_booked";

        await base44.asServiceRole.entities.CallRecord.update(record.id, {
          team_member,
          caller_name,
          caller_type,
          call_topic,
          caller_intent: analysis.caller_intent || null,
          bookable: analysis.bookable || "unclear",
          booking_outcome,
          was_booked: booking_outcome === "appt_booked",
          booked_date: analysis.booked_date || null,
          booking_offered,
          missed_call,
          ...(typeof live_team_member_spoke === 'boolean' ? { live_team_member_spoke } : {}),
          transcript_summary: analysis.transcript_summary || null,
          ai_notes: analysis.ai_notes || null,
        });
        updated++;
      } catch (err) {
        errors.push(`${record.id}: ${err.message}`);
      }
    }

    const nextOffset = offset + chunkSize;
    const remaining = withTranscripts.length - nextOffset;
    return Response.json({
      updated,
      totalWithTranscripts: withTranscripts.length,
      offset,
      nextOffset,
      remaining,
      done: remaining <= 0,
      errors: errors.slice(0, 5)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}