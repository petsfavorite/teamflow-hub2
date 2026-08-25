// Shared AI call-analysis logic used by scheduledSheetSync and zoomWebhook.
// Uses configurable prompts from AppSettings.call_dashboard_options.

export const DEFAULT_CALLER_TYPE_PROMPT = `Classify the caller as one of:
- "potential_client": a new inquiry from someone who is not yet a client
- "returning_client": an existing client who has used the facility before
- "not_applicable": not a client (vendor, wrong number, solicitor, etc.)
For inbound calls: classify the caller (the external person). For outbound calls: classify the RECEIVER (the external person called), NOT the staff member.`;

export const DEFAULT_BOOKING_PROMPT = `Determine the booking outcome:
- "appt_booked": an appointment was successfully scheduled before the call ended
- "appt_not_booked": a missed booking — the caller wanted to schedule an appointment but one was not booked (ONLY when we spoke live and failed to book)
- "appt_not_needed": no booking was needed (voicemail with no live conversation, confirming an existing appointment, prescription refill, general question)`;

export const DEFAULT_BOOKING_OFFERED_PROMPT = `For this call where a booking was NOT made (a missed booking), determine whether the staff member OFFERED an appointment to the caller.
Return true if:
- The staff suggested or offered a specific appointment time/date but the caller declined or did not commit
- The staff mentioned availability or asked if the caller wanted to book but the caller declined
Return false if:
- No appointment was offered at all
- The caller hung up before booking was discussed
- The call was a voicemail or missed call with no live conversation`;

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

// Main transcript analysis — returns all call fields in one AI call.
// prompts: { ai_caller_type_prompt?, ai_booking_prompt? }
export async function analyzeCall(transcript, callDirection, userList, openai, prompts = {}) {
  if (!transcript || !transcript.trim()) return {};
  const callerTypePrompt = prompts.ai_caller_type_prompt || DEFAULT_CALLER_TYPE_PROMPT;
  const bookingPrompt = prompts.ai_booking_prompt || DEFAULT_BOOKING_PROMPT;

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
- booked_date: "YYYY-MM-DDTHH:MM:00" if appt_booked, else null
- transcript_summary: 2-3 sentence summary
- ai_notes: brief flags or follow-up notes. If no one at the clinic answered (voicemail / missed call), set this to exactly "Call was missed".

Return ONLY valid JSON, no markdown.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }
  });
  return JSON.parse(response.choices[0].message.content);
}

// Separate AI call for missed bookings — determines if booking was offered.
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