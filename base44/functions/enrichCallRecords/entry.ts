import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';
import OpenAI from 'npm:openai';
import { fuzzyMatchUser } from '../../shared/staffMatching.ts';
import { analyzeCall, buildExtraAliases } from '../../shared/callAnalysis.ts';
import { sendCallLogErrorEmail } from '../../shared/callLogErrorNotify.ts';
import { requireAdminOnly } from '../../shared/auth.ts';

// AI ENRICHER — picks up CallRecords with ai_enriched=false and runs
// transcript analysis on a small batch per invocation to avoid timeouts.
// The scheduled workflow calls this every 10 minutes; each run processes up to 15 records.

const MAX_PER_RUN = 15;
// Fetch extra so records we skip (waiting on a transcript, or failed too often)
// can't crowd out healthy ones at the front of the queue.
const FETCH_LIMIT = 60;
// After this many failed attempts a record is flagged and dropped from the queue.
const MAX_ATTEMPTS = 5;
// A call with no transcript this young is probably still waiting on Zoom's transcript.
const TRANSCRIPT_GRACE_MS = 2 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { error: authError } = await requireAdminOnly(base44);
    if (authError) return authError;

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

    const userList = await base44.asServiceRole.entities.User.list('-created_date', 500);
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

    // Fetch pending (non-enriched) records, oldest first
    const fetched = await base44.asServiceRole.entities.CallRecord.filter(
      { ai_enriched: false },
      "created_date",
      FETCH_LIMIT
    );

    let enriched = 0;
    let skipped = 0;
    let deferred = 0;
    let gaveUp = 0;
    const errors = [];
    const gaveUpErrors = [];

    // Give up on records that keep failing; otherwise they sit at the front forever.
    const pending = [];
    for (const record of fetched) {
      if ((record.enrich_attempts || 0) >= MAX_ATTEMPTS) {
        await base44.asServiceRole.entities.CallRecord.update(record.id, {
          ai_enriched: true,
          status: "flagged",
          ai_notes: `AI enrichment failed ${MAX_ATTEMPTS} times and was skipped.`,
        });
        gaveUp++;
        gaveUpErrors.push(record.id);
        continue;
      }
      // No transcript yet and the call is recent: wait for the transcript to show up.
      const hasTranscript = !!(record.transcript && record.transcript.trim());
      const ageMs = Date.now() - new Date(record.created_date).getTime();
      if (!hasTranscript && ageMs < TRANSCRIPT_GRACE_MS) {
        deferred++;
        continue;
      }
      if (pending.length < MAX_PER_RUN) pending.push(record);
    }

    for (const record of pending) {
      try {
        let team_member = null;
        let caller_type = "not_applicable";
        let booking_outcome = "appt_not_booked";
        let caller_name = record.caller_name || null;
        let caller_intent = null;
        let bookable = "unclear";
        let transcript_summary = null;
        let ai_notes = null;
        let booked_date = null;
        let booking_offered = false;
        let ai_missed_call = false;

        if (record.transcript && record.transcript.trim()) {
          const analysis = await analyzeCall(record.transcript, record.call_direction, userList, openai, aiPrompts);
          const strOrNull = (v) => typeof v === 'string' && v.trim() ? v.trim() : null;
          team_member = strOrNull(analysis.team_member);
          if (!caller_name) caller_name = strOrNull(analysis.caller_name);
          caller_type = analysis.caller_type || "not_applicable";
          caller_intent = strOrNull(analysis.caller_intent);
          bookable = analysis.bookable || "unclear";
          booking_outcome = analysis.booking_outcome || "appt_not_booked";
          booked_date = analysis.booked_date || null;
          transcript_summary = strOrNull(analysis.transcript_summary);
          ai_notes = strOrNull(analysis.ai_notes);
          ai_missed_call = analysis.missed_call === true;
          if (booking_outcome === "appt_not_booked" && !ai_missed_call) {
            booking_offered = analysis.booking_offered === true;
          }

          // Fuzzy-match team member to a real user
          if (team_member && userList.length) {
            team_member = fuzzyMatchUser(team_member, userList, extraAliases);
          }
        } else {
          // No transcript — use duration as a missed-call proxy
          skipped++;
        }

        // Missed call determination
        // record.missed_call may already be true from Zoom's own call result (unanswered / voicemail).
        const missed_call = record.call_direction === "inbound" && (
          record.missed_call === true ||
          ai_missed_call ||
          (!record.transcript && record.call_duration_seconds !== null && record.call_duration_seconds < 30)
        );
        if (missed_call) team_member = null;

        await base44.asServiceRole.entities.CallRecord.update(record.id, {
          team_member,
          caller_name,
          caller_type,
          caller_intent,
          bookable,
          booking_outcome,
          was_booked: booking_outcome === "appt_booked",
          booked_date,
          booking_offered,
          missed_call,
          transcript_summary,
          ai_notes,
          ai_enriched: true,
        });
        enriched++;
      } catch (err) {
        errors.push(`${record.id}: ${err.message}`);
        // Leave ai_enriched=false so the record is retried on the next run, but count the
        // attempt so a record that always fails is eventually flagged and skipped.
        try {
          await base44.asServiceRole.entities.CallRecord.update(record.id, {
            enrich_attempts: (record.enrich_attempts || 0) + 1,
          });
        } catch { /* best effort */ }
        // If all records fail (systemic issue like out-of-credits), an email alert is sent below.
      }
    }

    // If every record in this batch failed, send an email alert (throttled to 1/hour)
    if (pending.length > 0 && enriched === 0 && errors.length > 0) {
      await sendCallLogErrorEmail(base44,
        "AI Enrichment Failed",
        `All ${pending.length} call records in this batch failed to enrich.\n\nErrors:\n${errors.slice(0, 5).join("\n")}\n\nThis usually means the OpenAI API is down or out of credits. The records will be retried automatically every 10 minutes.`
      );
    }

    if (gaveUp > 0) {
      await sendCallLogErrorEmail(base44,
        "Call Records Skipped After Repeated AI Failures",
        `${gaveUp} call record(s) failed AI enrichment ${MAX_ATTEMPTS} times and were flagged so they stop blocking the queue.\n\nRecord IDs: ${gaveUpErrors.slice(0, 10).join(", ")}\n\nLook for them with status "flagged" on the Call Dashboard.`
      );
    }

    return Response.json({
      enriched,
      deferred,
      gaveUp,
      skipped,
      processed: pending.length,
      errors: errors.slice(0, 5),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});