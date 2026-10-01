import { sanitizeHtml, escapeHtml } from '@/lib/sanitize';
import { base44 } from '@/api/base44Client';
import { addDaysStr, daysFromToday } from '@/lib/timezone';

// ---------------------------------------------------------------------------
// Field groups
// ---------------------------------------------------------------------------

// Every field a manager/admin can edit in the SOP editor (snapshotted in versions and pending edits).
export const SOP_CONTENT_FIELDS = [
  'title', 'category', 'purpose', 'when_it_applies', 'required_tools', 'instructions',
  'video_url', 'document_url', 'warnings', 'responsible_role', 'applicable_teams', 'summary', 'tags',
  'related_sop_ids', 'requires_acknowledgement', 'acknowledgement_due_days',
  'acknowledgement_assigned_emails', 'acknowledgement_assigned_teams',
];

// Fields a direct (admin) edit must change before the version number is bumped.
export const SOP_MATERIAL_FIELDS = [
  'title', 'category', 'purpose', 'when_it_applies', 'required_tools', 'instructions',
  'video_url', 'document_url', 'warnings', 'responsible_role', 'summary', 'tags',
];

// Fields restored by "Restore this version" (ack assignments / teams are left as they are now).
export const SOP_RESTORE_FIELDS = SOP_MATERIAL_FIELDS;

export const VERIFICATION_INTERVAL_DAYS = 90;

// Managers can't write to the SOP entity directly (admins only); their drafts, proposed edits,
// verification and draft-archiving all go through the manageSop backend function.
export async function manageSop(action, payload = {}) {
  const res = await base44.functions.invoke('manageSop', { action, ...payload });
  return res?.data ?? res;
}

// An archived SOP must not keep a waiting edit that could be approved back to life.
export const CLEARED_PENDING = {
  pending_changes: null, pending_state: null, pending_review_note: null, pending_reviewed_by_name: null,
  pending_submitted_at: null, pending_content: null, pending_summary: null, pending_tags: null,
  pending_change_summary: null, pending_submitted_by: null, pending_submitted_by_name: null,
};

export const pick = (obj, keys) => {
  const out = {};
  keys.forEach((k) => { if (obj && obj[k] !== undefined) out[k] = obj[k]; });
  return out;
};

const norm = (v) => (Array.isArray(v) ? JSON.stringify([...v].sort()) : (v ?? '') === '' ? '' : JSON.stringify(v));
export const fieldsDiffer = (a, b, keys) => keys.some((k) => norm(a?.[k]) !== norm(b?.[k]));

// ---------------------------------------------------------------------------
// HTML safety
// ---------------------------------------------------------------------------

// Single shared sanitizer (src/lib/sanitize.js). Always run SOP / pending / version HTML through
// sanitizeHtml before dangerouslySetInnerHTML, and escapeHtml before interpolating into HTML strings.
export { sanitizeHtml, escapeHtml };

// Block-aware plain text from HTML (keeps line breaks between steps).
export function htmlToText(html) {
  if (!html) return '';
  const withBreaks = String(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6]|tr|blockquote|pre)\s*>/gi, '\n')
    .replace(/<\s*(li)\b[^>]*>/gi, '• ');
  let text;
  if (typeof DOMParser !== 'undefined') {
    text = new DOMParser().parseFromString(withBreaks, 'text/html').body.textContent || '';
  } else {
    text = withBreaks.replace(/<[^>]*>/g, '');
  }
  return text.replace(/[ \t ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

// The SOP's step-by-step body: structured field first, legacy content as fallback.
export const sopBody = (sop) => sop?.instructions || sop?.content || '';

// ---------------------------------------------------------------------------
// Status / pending edit helpers
// ---------------------------------------------------------------------------

// Staff see published SOPs. Legacy data may still have status 'pending_approval' on a SOP that is live.
export const isLive = (sop) => sop?.status === 'published' || sop?.status === 'pending_approval';

export function pendingState(sop) {
  if (!sop) return null;
  if (sop.pending_state) return sop.pending_state;
  if (sop.pending_changes || sop.pending_content || sop.status === 'pending_approval') return 'submitted';
  return null;
}

// Proposed fields of a pending edit (supports the older pending_content/summary/tags format).
export function getPendingFields(sop) {
  if (sop?.pending_changes && Object.keys(sop.pending_changes).length) return sop.pending_changes;
  const legacy = {};
  if (sop?.pending_content != null) legacy.instructions = sop.pending_content;
  if (sop?.pending_summary != null) legacy.summary = sop.pending_summary;
  if (sop?.pending_tags != null) legacy.tags = sop.pending_tags;
  return legacy;
}

export const clearPendingFields = {
  pending_changes: null, pending_state: null, pending_review_note: null,
  pending_reviewed_by_name: null, pending_submitted_at: null,
  pending_content: null, pending_summary: null, pending_tags: null,
  pending_change_summary: null, pending_submitted_by: null, pending_submitted_by_name: null,
};

export async function fetchLiveSops(limit = 500) {
  const [published, legacyPending] = await Promise.all([
    base44.entities.SOP.filter({ status: 'published' }, '-updated_date', limit),
    base44.entities.SOP.filter({ status: 'pending_approval' }, '-updated_date', limit),
  ]);
  return [...published, ...legacyPending].sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date));
}

// ---------------------------------------------------------------------------
// Verification (every 90 days)
// ---------------------------------------------------------------------------

export function verificationStatus(sop) {
  const daysLeft = sop?.verification_due_date ? daysFromToday(sop.verification_due_date) : null;
  return {
    daysLeft,
    overdue: daysLeft !== null && daysLeft < 0,
    soon: daysLeft !== null && daysLeft >= 0 && daysLeft <= 7,
  };
}

// Fields to spread into an SOP update when a version goes live or is re-verified by `who`.
export function publishStamp(who) {
  const now = new Date().toISOString();
  return {
    version_published_at: now,
    verification_due_date: addDaysStr(VERIFICATION_INTERVAL_DAYS),
    ...(who ? { last_verified_by: who.email, last_verified_by_name: who.name, last_verified_at: now } : {}),
  };
}

// ---------------------------------------------------------------------------
// Acknowledgements
// ---------------------------------------------------------------------------

// No assignments = all staff (matches the editor's "leave blank for all staff").
export function isInAckScope(sop, email, myTeamIds = []) {
  if (!sop?.requires_acknowledgement || !email) return false;
  const emails = sop.acknowledgement_assigned_emails || [];
  const teamIds = sop.acknowledgement_assigned_teams || [];
  if (emails.length === 0 && teamIds.length === 0) return true;
  return emails.includes(email) || teamIds.some((t) => myTeamIds.includes(t));
}

export const hasAckedVersion = (acks, sop) =>
  acks.some((a) => a.sop_id === sop.id && Number(a.version_number) === Number(sop.version || 1));

// SOPs this user must (re-)acknowledge: in scope and not acknowledged at the CURRENT version.
export function sopsNeedingAck(sops, acks, email, myTeamIds) {
  return sops.filter((s) => isLive(s) && isInAckScope(s, email, myTeamIds) && !hasAckedVersion(acks, s));
}

export const isReAck = (acks, sop) =>
  acks.some((a) => a.sop_id === sop.id && Number(a.version_number) < Number(sop.version || 1));

export function isAckOverdue(sop) {
  const start = sop?.version_published_at || sop?.updated_date;
  if (!start) return false;
  const days = sop.acknowledgement_due_days ?? 5;
  return Date.now() > new Date(start).getTime() + days * 86400000;
}

export async function fetchMyAcks(email) {
  return base44.entities.SOPAcknowledgement.filter({ user_email: email }, '-created_date', 2000);
}

export async function fetchMyTeamIds(email) {
  const teams = await base44.entities.Team.list('name', 200);
  return teams.filter((t) => (t.member_emails || []).includes(email)).map((t) => t.id);
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

// One SOPVersion row per (sop, version number): update in place instead of creating duplicates.
export async function recordVersion(sopId, versionNumber, data, changeSummary, createdByName) {
  const payload = {
    sop_id: sopId,
    version_number: versionNumber,
    title: data.title,
    content: sopBody(data),
    summary: data.summary,
    tags: data.tags,
    category: data.category,
    snapshot: pick({ ...data, instructions: sopBody(data) }, SOP_CONTENT_FIELDS),
    change_summary: changeSummary,
    created_by_name: createdByName,
  };
  const existing = await base44.entities.SOPVersion.filter({ sop_id: sopId, version_number: versionNumber });
  if (existing[0]) return base44.entities.SOPVersion.update(existing[0].id, payload);
  return base44.entities.SOPVersion.create(payload);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const STOPWORDS = new Set((
  'a an and are as at be but by can do does for from had has have how i if in into is it its me my of on or our so than that the their them then there these they this to up us was we were what when where which who why will with you your should would could need get got'
).split(' '));

const stem = (w) => {
  const m = w.match(/(ing|ed|es|s)$/);
  return m && w.length - m[0].length >= 3 ? w.slice(0, -m[0].length) : w;
};

export function tokenize(text) {
  return [...new Set(
    String(text || '').toLowerCase().split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w))
      .map(stem)
  )];
}

const hayCache = new WeakMap();
function haystack(sop) {
  const hit = hayCache.get(sop);
  if (hit && hit.stamp === sop.updated_date) return hit.value;
  const value = {
    title: tokenize(sop.title).join(' '),
    tags: tokenize((sop.tags || []).join(' ')).join(' '),
    category: tokenize(sop.category).join(' '),
    summary: tokenize(sop.summary).join(' '),
    applies: tokenize(`${sop.when_it_applies || ''} ${sop.purpose || ''}`).join(' '),
    body: tokenize(`${htmlToText(sopBody(sop))} ${sop.warnings || ''} ${sop.required_tools || ''}`).join(' '),
  };
  hayCache.set(sop, { stamp: sop.updated_date, value });
  return value;
}

const WEIGHTS = { title: 6, tags: 4, category: 2, summary: 3, applies: 2, body: 1 };

// Score one SOP against query tokens. `matched` = number of distinct tokens found anywhere.
export function scoreSop(sop, tokens) {
  const h = haystack(sop);
  let score = 0;
  let matched = 0;
  tokens.forEach((t) => {
    let hit = false;
    Object.keys(WEIGHTS).forEach((f) => {
      if (h[f].includes(t)) { score += WEIGHTS[f]; hit = true; }
    });
    if (hit) matched += 1;
  });
  return { score, matched };
}

// mode 'all': every word must appear somewhere (page search). mode 'any': rank by relevance (assistant).
export function searchSops(sops, query, { mode = 'all', limit } = {}) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return sops.map((sop) => ({ sop, score: 0 }));
  const out = [];
  sops.forEach((sop) => {
    const { score, matched } = scoreSop(sop, tokens);
    if (matched === 0) return;
    if (mode === 'all' && matched < tokens.length) return;
    out.push({ sop, score: score + matched * 3 });
  });
  out.sort((a, b) => b.score - a.score);
  return limit ? out.slice(0, limit) : out;
}

// Rank arbitrary records (e.g. training manuals) with weighted text fields.
export function rankRecords(records, fieldsOf, query, limit) {
  const tokens = tokenize(query);
  const out = [];
  records.forEach((r) => {
    let score = 0;
    const fields = fieldsOf(r);
    fields.forEach(([text, weight]) => {
      const h = tokenize(text).join(' ');
      tokens.forEach((t) => { if (h.includes(t)) score += weight; });
    });
    if (score > 0) out.push({ record: r, score });
  });
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit).map((x) => x.record);
}

// Text window around the first query-word hit, so long documents contribute the relevant part.
export function excerpt(text, query, len = 1500) {
  const clean = String(text || '');
  if (clean.length <= len) return clean;
  const lower = clean.toLowerCase();
  let idx = -1;
  tokenize(query).forEach((t) => {
    const i = lower.indexOf(t);
    if (i !== -1 && (idx === -1 || i < idx)) idx = i;
  });
  const start = Math.max(0, (idx === -1 ? 0 : idx) - 200);
  return clean.slice(start, start + len);
}