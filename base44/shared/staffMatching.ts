// Shared staff-name matching used by call-processing functions.
// Resolves a name spoken/written in a transcript or sheet (first name, nickname,
// or full name) to a canonical user full_name from the user list.

// Nickname → canonical first name (lowercase). Used for fuzzy matching.
export const NAME_ALIASES = {
  // Rebecca Evatt
  "becca": "rebecca", "becky": "rebecca", "bec": "rebecca",
  // Aryana Vizcano
  "arianna": "aryana", "ariana": "aryana", "ary": "aryana", "anna": "aryana",
  // Amanda Sandor
  "mandy": "amanda", "aman": "amanda",
  // Katie DeJesus
  "kate": "katie", "katelyn": "katie", "kaitlyn": "katie", "caitlin": "katie", "kaitlin": "katie",
  // Jen Rising
  "jennifer": "jen", "jenny": "jen",
  // Skye Means
  "sky": "skye",
  // Hailey Laughter
  "haley": "hailey", "hayley": "hailey",
};

export const NEVER_ASSIGN_AS_ANSWERER = ["caroline cofer", "dr. cofer", "dr cofer", "caroline", "dr caroline", "dr. caroline"];

export function fuzzyMatchUser(detectedName, userList) {
  if (!detectedName || !userList.length) return null;
  let lower = detectedName.toLowerCase().trim();

  // Hard block: never assign Caroline Cofer as the answerer
  if (NEVER_ASSIGN_AS_ANSWERER.some(blocked => lower === blocked || lower.includes(blocked))) {
    return null;
  }

  // Apply alias normalization before matching
  if (NAME_ALIASES[lower]) lower = NAME_ALIASES[lower];

  // 1. Exact full name match
  const exact = userList.find(u => u.full_name.toLowerCase() === lower);
  if (exact) return exact.full_name;

  // 2. Exact first name match (most common — sheet often has just first names)
  const firstNameMatch = userList.find(u => {
    const firstName = u.full_name.toLowerCase().split(" ")[0];
    return firstName === lower;
  });
  if (firstNameMatch) return firstNameMatch.full_name;

  // 3. Partial alias: check if the detected name is an alias fragment of a user
  for (const [alias, canonical] of Object.entries(NAME_ALIASES)) {
    if (lower.includes(alias)) {
      lower = lower.replace(alias, canonical);
      break;
    }
  }
  const aliasFirstName = userList.find(u => {
    const firstName = u.full_name.toLowerCase().split(" ")[0];
    return firstName === lower;
  });
  if (aliasFirstName) return aliasFirstName.full_name;

  // 4. Substring match — detected name is contained in a user's full name
  const substringMatch = userList.find(u => {
    const uLower = u.full_name.toLowerCase();
    // Only match if the detected token matches a whole word in the user's name
    const words = uLower.split(" ");
    return words.some(w => w === lower);
  });
  if (substringMatch) return substringMatch.full_name;

  // 5. Initials match (e.g. "KS" → first letters of first+last name)
  if (/^[a-z]{2,3}$/.test(lower)) {
    const initialsMatch = userList.find(u => {
      const parts = u.full_name.toLowerCase().split(" ");
      const initials = parts.map(p => p[0]).join("");
      return initials === lower;
    });
    if (initialsMatch) return initialsMatch.full_name;
  }

  // No confident match — return null so we don't assign a wrong person
  return null;
}

// Returns true if free-form AI notes indicate an INBOUND call was missed
// (voicemail / no one answered / 0-second call). Negation ("not missed") wins.
// Callers are responsible for only applying this to inbound calls.
export function aiNotesIndicatesMissed(notes) {
  if (!notes) return false;
  const n = notes.toLowerCase();
  // Explicit negation wins
  if (/\bnot (a )?missed\b/.test(n) || /\bwas not missed\b/.test(n) || /\bwasn'?t missed\b/.test(n)) return false;
  if (/call was missed/.test(n)) return true;
  if (/\bmissed (call|connection)\b/.test(n)) return true;
  if (/\bvoicemail\b/.test(n)) return true;
  if (/no (one )?answered|did not answer|went unanswered|no answered interaction/.test(n)) return true;
  if (/no conversation took place|no interaction|did not result in any interaction/.test(n)) return true;
  if (/0 seconds/.test(n)) return true;
  return false;
}