// Single source of truth for "was this inbound call missed?".
//
// The clinic's definition — an incoming call is missed when:
//   1. no team member answers it, or
//   2. ONLY the call queue answers (greeting / hold music / auto receptionist, no person), or
//   3. the caller leaves a voicemail.
//
// Zoom's account call log reports one row per inbound call, owned by the call QUEUE
// even when a team member picks up from the queue. So Zoom can say "nobody answered"
// or "voicemail", but for a queue call it cannot say whether a person spoke — the
// transcript has to decide that part.

const norm = (v) => String(v || "").toLowerCase().replace(/[\s_]/g, "");

const NO_ANSWER_RESULTS = [
  "noanswer", "unanswered", "missed", "abandoned", "cancel", "busy", "rejected", "blocked", "callfailed",
];

// Owners that are automation, never a person.
const NON_HUMAN_OWNERS = [
  "callqueue", "autoreceptionist", "sharedlinegroup", "ivr", "callpark", "voicemail", "contactcenter",
];

export function zoomCallFacts(log) {
  const direction = norm(log?.direction).startsWith("out") ? "outbound" : "inbound";
  const result = norm(log?.result || log?.call_result);
  const ownerType = norm(log?.owner?.type || log?.callee_ext_type);
  const voicemail = log?.has_voicemail === true || result.includes("voicemail") || ownerType === "voicemail";
  const answeredAt = log?.answer_start_time || log?.answer_time || null;
  const talkSeconds = Number(log?.talk_time ?? log?.duration ?? 0);
  const noAnswer = NO_ANSWER_RESULTS.some((r) => result.includes(r)) || (!answeredAt && talkSeconds <= 0);
  const answeredByTeamMember = ownerType === "user";
  const queueOnly = !answeredByTeamMember && !voicemail && !noAnswer && NON_HUMAN_OWNERS.includes(ownerType);
  return { direction, voicemail, noAnswer, answeredByTeamMember, queueOnly, talkSeconds };
}

// true  = definitely missed (nobody answered, or voicemail)
// false = a team member's own extension answered
// null  = Zoom cannot tell (only the queue answered) — the transcript decides
export function zoomMissedVerdict(log) {
  const facts = zoomCallFacts(log);
  if (facts.direction === "outbound") return false;
  if (facts.voicemail || facts.noAnswer) return true;
  if (facts.answeredByTeamMember) return false;
  return null;
}

// Final call after Zoom facts and transcript analysis are both known.
export function isMissedCall({
  callDirection,
  zoomVerdict = null,
  queueOnly = false,
  aiSaysMissed = false,
  teamMember = null,
}) {
  if (norm(callDirection).startsWith("out")) return false;
  if (teamMember) return false;          // a team member spoke with the caller
  if (zoomVerdict === true) return true; // no answer / voicemail, straight from Zoom
  if (aiSaysMissed) return true;
  return queueOnly;                      // only the queue answered, no team member did
}