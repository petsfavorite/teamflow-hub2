import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  isRealZoomId, scoreRecord, mergeInto, fingerprint, sameFingerprint,
} from '../../shared/callDedup.ts';

// DEDUP CALL RECORDS
// Finds and merges duplicate CallRecord entries created when the Google Sheet
// sync, the direct Zoom pull, and the Zoom webhook race each other. Two records
// are duplicates if they share a real zoom_meeting_id, or the same fingerprint
// (direction + phone + time within 3 minutes). The most complete record is kept
// and filled in from the losers; the losers are deleted.

const LOOKBACK_DAYS = 14;

const FIELDS = [
  "id", "zoom_meeting_id", "call_date", "call_direction", "caller_phone",
  "caller_name", "call_duration_seconds", "team_member", "transcript",
  "transcript_summary", "ai_notes", "ai_enriched", "recording_url",
  "zoom_recording_id", "recording_drive_file_id", "caller_type", "caller_intent",
  "bookable", "booking_outcome", "was_booked", "booked_date", "booking_offered",
  "missed_call", "clinic_closed", "status",
];

async function loadAllRecords(base44, floorDate) {
  const records = [];
  for (let d = 0; d <= LOOKBACK_DAYS; d++) {
    const dayStart = new Date(floorDate.getTime() + d * 86400000);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    let cursor = undefined;
    do {
      const page = await base44.entities.CallRecord.filter(
        { call_date: { $gte: dayStart.toISOString(), $lt: dayEnd.toISOString() } },
        { sort: "-call_date", limit: 1000, cursor, fields: FIELDS }
      );
      const items = page.items || page;
      records.push(...items);
      cursor = page.next_cursor;
    } while (cursor && records.length < 20000);
  }
  return records;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'super_admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const floorDate = new Date(Date.now() - LOOKBACK_DAYS * 86400000);
    const records = await loadAllRecords(base44, floorDate);

    // Pass 1: group by real zoom_meeting_id.
    const byId = new Map();
    for (const r of records) {
      if (!isRealZoomId(r.zoom_meeting_id)) continue;
      const arr = byId.get(r.zoom_meeting_id) || [];
      arr.push(r);
      byId.set(r.zoom_meeting_id, arr);
    }

    const mergedIds = [];
    const deletedIds = [];

    for (const [, group] of byId) {
      if (group.length < 2) continue;
      group.sort((a, b) => scoreRecord(b) - scoreRecord(a));
      const winner = group[0];
      const losers = group.slice(1);
      const merged = mergeInto(winner, losers);
      await base44.entities.CallRecord.update(winner.id, merged);
      for (const l of losers) {
        await base44.entities.CallRecord.delete(l.id);
        deletedIds.push(l.id);
      }
      mergedIds.push({ zoom_meeting_id: winner.zoom_meeting_id, kept: winner.id, removed: losers.length });
    }

    // Pass 2: fingerprint dedup on the surviving records (reload to reflect pass 1).
    const survivors = await loadAllRecords(base44, floorDate);

    const mergedFps = [];
    const used = new Set();
    for (let i = 0; i < survivors.length; i++) {
      if (used.has(survivors[i].id)) continue;
      const a = survivors[i];
      const fa = fingerprint(a);
      if (!fa.phone || fa.phone.length < 7) continue;
      const group = [a];
      for (let j = i + 1; j < survivors.length; j++) {
        const b = survivors[j];
        if (used.has(b.id)) continue;
        if (sameFingerprint(fa, fingerprint(b))) {
          group.push(b);
          used.add(b.id);
        }
      }
      if (group.length < 2) continue;
      used.add(a.id);
      group.sort((x, y) => scoreRecord(y) - scoreRecord(x));
      const winner = group[0];
      const losers = group.slice(1);
      const merged = mergeInto(winner, losers);
      await base44.entities.CallRecord.update(winner.id, merged);
      for (const l of losers) {
        await base44.entities.CallRecord.delete(l.id);
        deletedIds.push(l.id);
      }
      mergedFps.push({ phone: fa.phone, kept: winner.id, removed: losers.length });
    }

    return Response.json({
      scanned: records.length,
      idGroupsMerged: mergedIds.length,
      fingerprintGroupsMerged: mergedFps.length,
      totalDeleted: deletedIds.length,
      mergedIds: mergedIds.slice(0, 10),
      mergedFps: mergedFps.slice(0, 10),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}