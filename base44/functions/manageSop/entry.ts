import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import moment from 'npm:moment-timezone@0.5.45';
import { requireAdmin } from '../../shared/auth.ts';

// The only way a MANAGER writes to an SOP. The SOP entity itself is update/delete for admins only,
// so a manager cannot publish, restore or hand-edit a live SOP by calling the SDK directly.
//   save_draft   create a draft, or edit an existing draft (status is forced to 'draft')
//   submit_edit  propose changes to a LIVE SOP; staff keep seeing the live version until an admin approves
//   verify       mark a live SOP verified (restarts the 90-day clock)
//   postpone     push a live SOP's verification date out 90 days
//   archive      managers may archive drafts only; admins may archive anything
// Keep SOP_CONTENT_FIELDS in sync with src/lib/sop.js and approveContent.
const SOP_CONTENT_FIELDS = [
  'title', 'category', 'purpose', 'when_it_applies', 'required_tools', 'instructions',
  'video_url', 'warnings', 'responsible_role', 'applicable_teams', 'summary', 'tags',
  'related_sop_ids', 'requires_acknowledgement', 'acknowledgement_due_days',
  'acknowledgement_assigned_emails', 'acknowledgement_assigned_teams',
];
const pickFields = (obj) => Object.fromEntries(SOP_CONTENT_FIELDS.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));
const isLive = (s) => s?.status === 'published' || s?.status === 'pending_approval';

const CLEAR_PENDING = {
  pending_changes: null, pending_state: null, pending_review_note: null, pending_reviewed_by_name: null,
  pending_submitted_at: null, pending_content: null, pending_summary: null, pending_tags: null,
  pending_change_summary: null, pending_submitted_by: null, pending_submitted_by_name: null,
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { error: authError, user } = await requireAdmin(base44);
    if (authError) return authError;
    const isAdmin = ['admin', 'super_admin'].includes(user.role);

    const { action, id, fields, change_summary } = await req.json();
    const db = base44.asServiceRole.entities;
    const fail = (message, status = 400) => Response.json({ error: message }, { status });

    const load = async () => {
      if (!id) return null;
      const list = await db.SOP.filter({ id });
      return list[0] || null;
    };

    if (action === 'save_draft') {
      const clean = pickFields(fields);
      if (!clean.title || !clean.category) return fail('Title and category are required');
      const data = {
        ...clean, content: clean.instructions || '', status: 'draft',
        last_updated_by: user.email, last_updated_by_name: user.full_name,
        ...CLEAR_PENDING,
      };
      if (!id) {
        const created = await db.SOP.create({ ...data, version: 1 });
        return Response.json({ success: true, id: created.id, version: 1 });
      }
      const sop = await load();
      if (!sop) return fail('SOP not found', 404);
      if (sop.status !== 'draft') return fail('Only drafts can be edited directly. Submit changes to a live SOP for admin approval.', 403);
      await db.SOP.update(id, data);
      return Response.json({ success: true, id, version: sop.version || 1 });
    }

    if (action === 'submit_edit') {
      const sop = await load();
      if (!sop) return fail('SOP not found', 404);
      if (!isLive(sop)) return fail('Edits can only be submitted for live SOPs', 403);
      await db.SOP.update(id, {
        ...CLEAR_PENDING,
        pending_changes: pickFields(fields),
        pending_state: 'submitted',
        pending_change_summary: String(change_summary || '').slice(0, 2000),
        pending_submitted_by: user.email,
        pending_submitted_by_name: user.full_name,
        pending_submitted_at: new Date().toISOString(),
        status: 'published', // also migrates legacy 'pending_approval' rows back to live
      });
      return Response.json({ success: true });
    }

    if (action === 'verify' || action === 'postpone') {
      const sop = await load();
      if (!sop) return fail('SOP not found', 404);
      if (!isLive(sop)) return fail('Only live SOPs can be verified', 403);
      const settings = await db.AppSettings.filter({ key: 'global' });
      const tz = settings[0]?.global_timezone || 'America/New_York';
      const update = { verification_due_date: moment().tz(tz).add(90, 'days').format('YYYY-MM-DD') };
      if (action === 'verify') {
        update.last_verified_by = user.email;
        update.last_verified_by_name = user.full_name || user.email;
        update.last_verified_at = new Date().toISOString();
      }
      await db.SOP.update(id, update);
      return Response.json({ success: true });
    }

    if (action === 'publish') {
      if (!isAdmin) return fail('Only admins can publish SOPs', 403);
      const sop = await load();
      if (!sop) return fail('SOP not found', 404);
      if (sop.status !== 'draft') return fail('Only draft SOPs can be published', 403);
      const settings = await db.AppSettings.filter({ key: 'global' });
      const tz = settings[0]?.global_timezone || 'America/New_York';
      const now = new Date().toISOString();
      const version = sop.version || 1;
      await db.SOP.update(id, {
        status: 'published',
        version_published_at: now,
        verification_due_date: moment().tz(tz).add(90, 'days').format('YYYY-MM-DD'),
        last_verified_by: user.email,
        last_verified_by_name: user.full_name || user.email,
        last_verified_at: now,
        last_updated_by: user.email,
        last_updated_by_name: user.full_name,
      });
      // Record version snapshot (same as the editor does when publishing)
      const body = sop.instructions || sop.content || '';
      const versionPayload = {
        sop_id: id, version_number: version,
        title: sop.title, content: body, summary: sop.summary, tags: sop.tags, category: sop.category,
        snapshot: pickFields({ ...sop, instructions: body }),
        change_summary: 'Published', created_by_name: user.full_name || user.email,
      };
      const existingVersion = await db.SOPVersion.filter({ sop_id: id, version_number: version });
      if (existingVersion[0]) await db.SOPVersion.update(existingVersion[0].id, versionPayload);
      else await db.SOPVersion.create(versionPayload);
      return Response.json({ success: true });
    }

    if (action === 'archive') {
      const sop = await load();
      if (!sop) return fail('SOP not found', 404);
      if (!isAdmin && sop.status !== 'draft') return fail('Only admins can archive a live SOP', 403);
      await db.SOP.update(id, { status: 'archived', ...CLEAR_PENDING });
      return Response.json({ success: true });
    }

    return fail('Unknown action');
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});