import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';
import OpenAI from 'npm:openai';
import { fuzzyMatchUser } from '../../shared/staffMatching.ts';
import { analyzeCall, buildExtraAliases } from '../../shared/callAnalysis.ts';

// Re-runs AI analysis on existing CallRecords that have transcripts,
// using the latest configurable prompts from AppSettings.
// Processes in chunks to avoid timeouts. Pass { offset, chunkSize } in the body.

Deno.serve(async (req) => {
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
    };
    const extraAliases = buildExtraAliases(cdOpts.name_aliases);

    const userList = await base44.asServiceRole.entities.User.list();
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

    // Get all call records that have transcripts
    const allRecords = await base44.asServiceRole.entities.CallRecord.list('-created_date', 2000);
    const withTranscripts = allRecords.filter(r => r.transcript && r.transcript.trim());

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const offset = body.offset || 0;
    const chunkSize = body.chunkSize || 25;
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

        // Missed call: trust AI determination
        const ai_missed_call = analysis.missed_call === true;
        const missed_call = record.call_direction === "inbound" && (
          ai_missed_call ||
          (!record.transcript && record.call_duration_seconds !== null && record.call_duration_seconds < 30)
        );
        if (missed_call) team_member = null;

        // Booking offered (only for missed bookings, not missed calls)
        let booking_offered = false;
        if (analysis.booking_outcome === "appt_not_booked" && !missed_call) {
          booking_offered = analysis.booking_offered === true;
        }

        const caller_name = analysis.caller_name || record.caller_name || null;
        const caller_type = analysis.caller_type || "not_applicable";
        const booking_outcome = analysis.booking_outcome || "appt_not_booked";

        await base44.asServiceRole.entities.CallRecord.update(record.id, {
          team_member,
          caller_name,
          caller_type,
          caller_intent: analysis.caller_intent || null,
          bookable: analysis.bookable || "unclear",
          booking_outcome,
          was_booked: booking_outcome === "appt_booked",
          booked_date: analysis.booked_date || null,
          booking_offered,
          missed_call,
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
});