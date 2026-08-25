// Shared AI call-analysis logic used by scheduledSheetSync, rerunCallAnalysis, and zoomWebhook.
// Uses configurable prompts from AppSettings.call_dashboard_options.

export const DEFAULT_CALLER_TYPE_PROMPT = `Classify the CALLER (the external person, NOT the staff member) as one of:
- "potential_client": a new inquiry from someone who has not used the facility before
- "returning_client": an existing client who has used the facility before (they mention a pet by name, reference a previous visit, or are calling about an existing appointment/boarding stay)
- "not_applicable": NOT a client — vendor, wrong number, solicitor, personal call for a staff member, etc.
When in doubt between potential and returning, prefer "returning_client" if the caller seems familiar with the facility or mentions specific pets/services.`;

export const DEFAULT_BOOKING_PROMPT = `Determine the booking outcome:
- "appt_booked": an appointment or boarding reservation was successfully scheduled during this call
- "appt_not_booked": a missed booking — the caller wanted to schedule something but no appointment was booked (ONLY when staff spoke live and failed to book)
- "appt_not_needed": no booking was needed — confirming existing appointment, prescription refill, payment, general question, voicemail with no live conversation, OR the caller is not a client (vendor, solicitor, wrong number, personal call for staff, etc.)
IMPORTANT: If the caller_type is "not_applicable", the booking_outcome MUST be "appt_not_needed" — a non-client can never be a "missed booking".`;

export const DEFAULT_BOOKING_OFFERED_PROMPT = `For calls where a booking was NOT made, determine if staff OFFERED an appointment:
- true: staff suggested a specific time/date or asked if the caller wanted to book, but the caller declined or did not commit
- false: no appointment was offered, the caller hung up before booking was discussed, or it was a voicemail/missed call`;

export const DEFAULT_MISSED_CALL_PROMPT = `Determine if this INBOUND call was a "missed call" — no one at the clinic answered:
- true: the call went to voicemail, no staff member spoke, or the caller hung up before anyone answered
- false: a staff member answered and had a conversation (even briefly)
Outbound calls are NEVER missed calls.`;

// Convert name_aliases from AppSettings [{alias, full_name}] into the
// {lowercase_alias: lowercase_first_name} format used by fuzzyMatchUser.
export function buildExtraAliases(nameAliases) {
  const map = {};
  if (!nameAliases || !Array.isArray(nameAliases)) return map;
  for (const entry of nameAliases) {
    if (entry?.alias && entry?.full_name) {
      const firstName = entry.full_name.toLowerCase().trim().split(" ")[0];
      map[entry.alias.toLowerCase().trim()] = firstName;
    }
  }
  return map;
}

// Main transcript analysis — returns all call fields in one AI call,
// including missed_call and booking_offered (no separate API calls needed).
// prompts: { ai_caller_type_prompt?, ai_booking_prompt?, ai_booking_offered_prompt?, ai_missed_call_prompt? }
export async function analyzeCall(transcript, callDirection, userList, openai, prompts = {}) {
  if (!transcript || !transcript.trim()) return {};
  const callerTypePrompt = prompts.ai_caller_type_prompt || DEFAULT_CALLER_TYPE_PROMPT;
  const bookingPrompt = prompts.ai_booking_prompt || DEFAULT_BOOKING_PROMPT;
  const bookingOfferedPrompt = prompts.ai_booking_offered_prompt || DEFAULT_BOOKING_OFFERED_PROMPT;
  const missedCallPrompt = prompts.ai_missed_call_prompt || DEFAULT_MISSED_CALL_PROMPT;

  const teamEntries = userList.map(u => `"${u.full_name}"`).join("\n");

  const prompt = `You are an AI analyzing a phone call transcript for a veterinary clinic / pet boarding / doggie daycare facility.

TRANSCRIPT:
${transcript}

CALL DIRECTION: ${callDirection}

${teamEntries ? `KNOWN STAFF MEMBERS:\n${teamEntries}\n\nNotes:\n- "Caroline", "Dr. Cofer", or "Dr. Caroline Cofer" refers to Caroline Cofer.\n- "Ariana" or "Arianna" almost certainly refers to Aryana — use the closest match from the list above.` : ""}

Return a JSON object with these fields:
- team_member: string or null
  RULES: For inbound: the staff member who ANSWERED (first staff name mentioned, e.g. "this is Sarah"). For outbound: the staff member who MADE the call (they introduce themselves). Return the name exactly as spoken in the transcript (first name, nickname, or full name) — do NOT match it to the KNOWN STAFF MEMBERS list; matching is handled separately. If no staff name is spoken, return null. Never assign Caroline/Dr. Cofer.
- caller_name: string or null (the customer/external caller's name)
- caller_phone: string or null
- caller_type: "potential_client" | "returning_client" | "not_applicable"
  ${callerTypePrompt}
- caller_intent: string (1-sentence summary of why they called)
- bookable: "yes" | "no" | "unclear"
- booking_outcome: "appt_booked" | "appt_not_booked" | "appt_not_needed"
  ${bookingPrompt}
- booking_offered: boolean
  ${bookingOfferedPrompt}
  (Only meaningful when booking_outcome is "appt_not_booked"; set to false otherwise.)
- booked_date: "YYYY-MM-DDTHH:MM:00" if appt_booked, else null
- missed_call: boolean
  ${missedCallPrompt}
- transcript_summary: 2-3 sentence summary
- ai_notes: brief flags or follow-up notes

Return ONLY valid JSON, no markdown.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }
  });
  return JSON.parse(response.choices[0].message.content);
}

// Legacy: kept for backward compatibility with zoomWebhook or other callers.
// Prefer the integrated booking_offered field from analyzeCall instead.
export async function checkBookingOffered(transcript, openai, customPrompt) {
  if (!transcript || !transcript.trim()) return { booking_offered: false };
  const prompt = customPrompt || DEFAULT_BOOKING_OFFERED_PROMPT;

  const fullPrompt = `You are analyzing a phone call transcript where a booking was NOT made (a missed booking opportunity).

TRANSCRIPT:
${transcript}

${prompt}

Return a JSON object: { "booking_offered": boolean }
Return ONLY valid JSON, no markdown.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: fullPrompt }],
    response_format: { type: "json_object" }
  });
  return JSON.parse(response.choices[0].message.content);
}