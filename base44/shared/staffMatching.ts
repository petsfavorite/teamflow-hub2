// Shared staff-name matching used by call-processing functions.
// Resolves a name spoken/written in a transcript or sheet (first name, nickname,
// or full name) to a canonical user full_name from the user list.

// Nickname → canonical first name (lowercase). Used for fuzzy matching.
export const NAME_ALIASES = {
  // Rebecca Evatt
  "becca": "rebecca", "becky": "rebecca", "bec": "rebecca",
  // Aryana Vizcaino
  "arianna": "aryana", "ariana": "aryana", "ary": "aryana", "anna": "aryana",
  "arianne": "aryana", "ari": "aryana", "aryan": "aryana",
  // Amanda Sandor (former employee — kept for old transcripts)
  "mandy": "amanda", "aman": "amanda",
  // Katie DeJesus
  "kate": "katie", "katelyn": "katie", "kaitlyn": "katie", "caitlin": "katie", "kaitlin": "katie",
  "katy": "katie", "kati": "katie",
  // Jen Rising
  "jennifer": "jen", "jenny": "jen", "jenn": "jen",
  // Skye Means
  "sky": "skye", "ski": "skye",
  // Hailey Laughter / Haley Jones
  "haley": "hailey", "hayley": "hailey", "hailie": "hailey", "haylee": "hailey",
  // Casie Ward (often misheard as "Casey" in transcripts)
  "casey": "casie", "cassie": "casie", "cassy": "casie", "kacie": "casie", "kacy": "casie", "kasey": "casie",
  // Lindsay Lollis / Lindsay Wyatt
  "linds": "lindsay", "lindy": "lindsay", "linz": "lindsay",
  // Pam M
  "pamela": "pam",
  // Emmeline Wood
  "em": "emmeline", "emmy": "emmeline", "emmie": "emmeline", "emaline": "emmeline", "emiline": "emmeline",
  // Nevada Perkins
  "nev": "nevada", "nevvy": "nevada",
  // Jody Miranda
  "jodi": "jody", "jodie": "jody", "jodee": "jody",
  // Hope Steadman
  "hopey": "hope",
};

export const NEVER_ASSIGN_AS_ANSWERER = ["caroline cofer", "dr. cofer", "dr cofer", "caroline", "dr caroline", "dr. caroline", "support staff", "staff"];

// Returns the user's first name, preferring the first_name field over full_name.
// full_name can be an immutable username (e.g. "zoeybinks2"), so first_name is
// the reliable source after a profile update.
function getFirstName(u) {
  if (u.first_name) return u.first_name.toLowerCase().trim();
  return (u.full_name || "").toLowerCase().split(" ")[0];
}

// Returns the user's display name — prefers first_name + last_name, falls back to full_name.
function getDisplayName(u) {
  if (u.first_name && u.last_name) return `${u.first_name} ${u.last_name}`.trim();
  return u.full_name || "";
}

export function fuzzyMatchUser(detectedName, userList, extraAliases = {}) {
  if (!detectedName || !userList.length) return null;
  let lower = String(detectedName).toLowerCase().trim();

  // Merge built-in aliases with user-configured extra aliases
  const allAliases = { ...NAME_ALIASES, ...extraAliases };

  // Hard block: never assign Caroline Cofer as the answerer
  if (NEVER_ASSIGN_AS_ANSWERER.some(blocked => lower === blocked || lower.includes(blocked))) {
    return null;
  }

  // Apply alias normalization before matching
  if (allAliases[lower]) lower = allAliases[lower];

  // 1. Exact full name match (checks both full_name and first_name+last_name)
  const exact = userList.find(u => {
    return u.full_name?.toLowerCase() === lower ||
           getDisplayName(u).toLowerCase() === lower;
  });
  if (exact) return getDisplayName(exact);

  // 1b. If multi-word name (e.g. "rebecca hall" from a garbled transcript),
  // try matching just the first word as a first name — speech-to-text often
  // gets the first name right but mangles the last name.
  const words = lower.split(/\s+/);
  if (words.length > 1) {
    const firstWord = words[0];
    const firstWordMatch = userList.find(u => getFirstName(u) === firstWord);
    if (firstWordMatch) return getDisplayName(firstWordMatch);
  }

  // 2. Exact first name match (most common — sheet often has just first names)
  const firstNameMatch = userList.find(u => getFirstName(u) === lower);
  if (firstNameMatch) return getDisplayName(firstNameMatch);

  // 3. Partial alias: check if the detected name is an alias fragment of a user
  for (const [alias, canonical] of Object.entries(allAliases)) {
    if (lower.includes(alias)) {
      lower = lower.replace(alias, canonical);
      break;
    }
  }
  const aliasFirstName = userList.find(u => getFirstName(u) === lower);
  if (aliasFirstName) return getDisplayName(aliasFirstName);

  // 4. Substring match — detected name is contained in a user's full name
  const substringMatch = userList.find(u => {
    const uLower = getDisplayName(u).toLowerCase();
    const words = uLower.split(" ");
    return words.some(w => w === lower);
  });
  if (substringMatch) return getDisplayName(substringMatch);

  // 5. Initials match (e.g. "KS" → first letters of first+last name)
  if (/^[a-z]{2,3}$/.test(lower)) {
    const initialsMatch = userList.find(u => {
      const parts = getDisplayName(u).toLowerCase().split(" ");
      const initials = parts.map(p => p[0]).join("");
      return initials === lower;
    });
    if (initialsMatch) return getDisplayName(initialsMatch);
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