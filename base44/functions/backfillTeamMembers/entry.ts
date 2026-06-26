import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import OpenAI from 'npm:openai';

const NAME_ALIASES = {
  "becca": "rebecca", "becky": "rebecca", "bec": "rebecca",
  "arianna": "aryana", "ariana": "aryana", "ary": "aryana", "anna": "aryana",
  "mandy": "amanda", "aman": "amanda",
  "kate": "katie", "katelyn": "katie", "kaitlyn": "katie", "caitlin": "katie", "kaitlin": "katie",
  "jennifer": "jen", "jenny": "jen",
  "sky": "skye",
  "haley": "hailey", "hayley": "hailey",
  "lee": "lee", "casie": "casie", "nataleigh": "nataleigh", "nevada": "nevada", "akira": "akira",
};

const NEVER_ASSIGN = ["caroline cofer", "dr. cofer", "dr cofer", "caroline", "dr caroline", "dr. caroline"];

function buildUserList(users) {
  // Build a list with both full_name AND first_name for matching
  return users.map(u => ({
    full_name: u.full_name,
    first_name: (u.first_name || "").toLowerCase(),
    last_name: (u.last_name || "").toLowerCase(),
    display: u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.full_name,
  }));
}

function fuzzyMatchUser(detectedName, userList) {
  if (!detectedName || !userList.length) return null;
  let lower = detectedName.toLowerCase().trim();

  if (NEVER_ASSIGN.some(blocked => lower === blocked || lower.includes(blocked))) return null;

  if (NAME_ALIASES[lower]) lower = NAME_ALIASES[lower];

  // 1. Exact first name match
  const firstMatch = userList.find(u => u.first_name === lower);
  if (firstMatch) return firstMatch.full_name;

  // 2. Alias → first name match
  for (const [alias, canonical] of Object.entries(NAME_ALIASES)) {
    if (lower.includes(alias)) {
      const aliasMatch = userList.find(u => u.first_name === canonical);
      if (aliasMatch) return aliasMatch.full_name;
    }
  }

  // 3. Exact full_name match (for users with proper full_name)
  const exact = userList.find(u => u.full_name.toLowerCase() === lower);
  if (exact) return exact.full_name;

  // 4. Word in full_name
  const wordMatch = userList.find(u => {
    const words = u.full_name.toLowerCase().split(/\s+/);
    return words.some(w => w === lower);
  });
  if (wordMatch) return wordMatch.full_name;

  return null;
}

async function extractTeamMemberFromTranscript(transcript, userList, openai) {
  const staffList = userList.map(u => `"${u.display}" (stored as "${u.full_name}")`).join("\n");
  const prompt = `You are analyzing a phone call transcript for a pet boarding/vet facility.

TRANSCRIPT (first 800 chars):
${transcript.slice(0, 800)}

KNOWN STAFF MEMBERS:
${staffList}

Instructions:
- The team member is usually the FIRST staff name mentioned (they introduce themselves, e.g. "this is Sarah").
- "Ariana" or "Arianna" → Aryana Vizcano (stored as "aryvizcaino")
- "Caroline" or "Dr. Cofer" → return null (she is the vet/owner, not an answerer)
- Return the stored full_name value (exactly as shown in parentheses) or null if no match.

Return ONLY valid JSON: {"team_member_full_name": "<stored full_name or null>"}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }
  });

  const result = JSON.parse(response.choices[0].message.content);
  return result.team_member_full_name || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !["admin", "super_admin"].includes(user.role)) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

    // Fetch all users and build matchable list
    const rawUsers = await base44.asServiceRole.entities.User.list();
    const userList = buildUserList(rawUsers);

    // Get answered calls (have transcript) with no team_member assigned, inbound only
    let allCalls = [];
    let skip = 0;
    const pageSize = 500;
    while (true) {
      const page = await base44.asServiceRole.entities.CallRecord.filter(
        { missed_call: { $ne: true }, call_direction: "inbound", transcript: { $exists: true }, team_member: null },
        '-call_date', pageSize, skip
      );
      allCalls = allCalls.concat(page);
      if (page.length < pageSize) break;
      skip += pageSize;
    }

    console.log(`[INFO] Found ${allCalls.length} inbound answered calls without a team_member`);

    let updated = 0;
    let noMatch = 0;
    let errors = [];

    for (const call of allCalls) {
      try {
        if (!call.transcript) continue;

        // First try fast fuzzy match on the transcript intro
        const introLine = call.transcript.slice(0, 200);
        // Look for "this is <Name>" pattern
        const introMatch = introLine.match(/this is ([A-Za-z]+)/i);
        let matched = null;

        if (introMatch) {
          matched = fuzzyMatchUser(introMatch[1], userList);
        }

        // If fuzzy didn't find it, use AI
        if (!matched) {
          matched = await extractTeamMemberFromTranscript(call.transcript, userList, openai);
        }

        // If AI returned a display name (first + last), try to find the user by first/last name
        let validMatch = matched && rawUsers.some(u => u.full_name === matched) ? matched : null;
        if (!validMatch && matched) {
          const matchedLower = matched.toLowerCase();
          const byDisplayName = userList.find(u =>
            `${u.first_name} ${u.last_name}` === matchedLower ||
            u.first_name === matchedLower.split(" ")[0]
          );
          if (byDisplayName) validMatch = byDisplayName.full_name;
        }

        if (validMatch) {
          await base44.asServiceRole.entities.CallRecord.update(call.id, { team_member: validMatch });
          updated++;
          console.log(`[OK] ${call.id} → ${validMatch}`);
        } else {
          noMatch++;
          if (matched) console.log(`[SKIP] ${call.id} → "${matched}" not in user list`);
        }

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 150));
      } catch (err) {
        errors.push(`${call.id}: ${err.message}`);
        console.error(`[ERROR] ${call.id}: ${err.message}`);
      }
    }

    return Response.json({ total: allCalls.length, updated, noMatch, errors: errors.slice(0, 10) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});