import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import moment from 'npm:moment-timezone@0.5.45';

// Every field a SOP edit can change (keep in sync with SOP_CONTENT_FIELDS in src/lib/sop.js).
const SOP_CONTENT_FIELDS = [
  'title', 'category', 'purpose', 'when_it_applies', 'required_tools', 'instructions',
  'video_url', 'document_url', 'warnings', 'responsible_role', 'applicable_teams', 'summary', 'tags',
  'related_sop_ids', 'requires_acknowledgement', 'acknowledgement_due_days',
  'acknowledgement_assigned_emails', 'acknowledgement_assigned_teams',
];
const pickFields = (obj) => Object.fromEntries(SOP_CONTENT_FIELDS.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      return Response.json({ error: 'Only admins can approve or reject content' }, { status: 403 });
    }
    const { type, id, action, note } = await req.json();
    if (!type || !id || !['approve', 'reject', 'send_back'].includes(action)) {
      return Response.json({ error: 'type, id, and action (approve/reject/send_back) are required' }, { status: 400 });
    }

    // Send back: an admin returns a DRAFT sop/checklist to the manager who created it,
    // with notes. The draft stays unpublished; the manager sees it in their Dashboard notifications.
    if (action === 'send_back') {
      const noteText = String(note || '').slice(0, 2000);
      if (!noteText.trim()) return Response.json({ error: 'A note is required to send back a draft' }, { status: 400 });

      if (type === 'sop') {
        const list = await base44.asServiceRole.entities.SOP.filter({ id });
        const sop = list[0];
        if (!sop) return Response.json({ error: 'SOP not found' }, { status: 404 });
        if (sop.status !== 'draft') return Response.json({ error: 'Only draft SOPs can be sent back' }, { status: 409 });
        await base44.asServiceRole.entities.SOP.update(id, {
          pending_state: 'changes_requested',
          pending_review_note: noteText,
          pending_reviewed_by_name: user.full_name || user.email,
          pending_submitted_by: sop.last_updated_by || '',
          pending_submitted_by_name: sop.last_updated_by_name || '',
          pending_changes: null,
          pending_content: null, pending_summary: null, pending_tags: null,
          pending_change_summary: null, pending_submitted_at: null,
        });
        return Response.json({ success: true });
      }

      if (type === 'checklist') {
        const list = await base44.asServiceRole.entities.ChecklistTemplate.filter({ id });
        const template = list[0];
        if (!template) return Response.json({ error: 'Checklist not found' }, { status: 404 });
        if (template.status !== 'draft') return Response.json({ error: 'Only draft checklists can be sent back' }, { status: 409 });
        await base44.asServiceRole.entities.ChecklistTemplate.update(id, {
          pending_review_note: noteText,
          pending_reviewed_by_name: user.full_name || user.email,
          pending_submitted_by: template.last_updated_by || '',
          pending_submitted_by_name: template.last_updated_by_name || '',
        });
        if (template.last_updated_by) {
          try {
            const [users, invites] = await Promise.all([
              base44.asServiceRole.entities.User.filter({ email: template.last_updated_by }),
              base44.asServiceRole.entities.PendingInvite.filter({ email: template.last_updated_by }),
            ]);
            if (users.length > 0 || invites.length > 0) {
              const safeTitle = String(template.title || '').replace(/[\r\n\t<>]/g, ' ').substring(0, 200).trim();
              await base44.integrations.Core.SendEmail({
                to: template.last_updated_by,
                subject: `Checklist Sent Back: ${safeTitle}`,
                body: `Hi,\n\nYour checklist draft "${safeTitle}" has been sent back by an admin with the following notes:\n\n${noteText}\n\nPlease log in to review and make the needed changes before resubmitting.\n\nThanks!`,
                from_name: "Pet's Favorite Hub",
              });
            }
          } catch { /* email is best-effort */ }
        }
        return Response.json({ success: true });
      }
      return Response.json({ error: 'Invalid type (sop or checklist)' }, { status: 400 });
    }

    if (type === 'sop') {
      const list = await base44.asServiceRole.entities.SOP.filter({ id });
      const sop = list[0];
      if (!sop) return Response.json({ error: 'SOP not found' }, { status: 404 });

      // A pending edit is stored in pending_changes (older edits used pending_content/summary/tags).
      const proposed = (sop.pending_changes && Object.keys(sop.pending_changes).length)
        ? sop.pending_changes
        : {
            ...(sop.pending_content != null ? { instructions: sop.pending_content } : {}),
            ...(sop.pending_summary != null ? { summary: sop.pending_summary } : {}),
            ...(sop.pending_tags != null ? { tags: sop.pending_tags } : {}),
          };
      if (sop.status === 'archived' || sop.status === 'draft') {
        return Response.json({ error: 'This SOP is archived or a draft, so its pending edit cannot be reviewed. Restore it first.' }, { status: 409 });
      }
      const state = sop.pending_state || ((Object.keys(proposed).length || sop.status === 'pending_approval') ? 'submitted' : null);
      if (state !== 'submitted') {
        return Response.json({ error: 'There is no edit waiting for review (it may already have been handled).' }, { status: 409 });
      }

      if (action === 'approve') {
        // Approving publishes the manager's full edit as the next version. The live version stays
        // visible to staff until this moment. The 90-day verification clock restarts.
        const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
        const tz = settings[0]?.global_timezone || 'America/New_York';
        const now = new Date().toISOString();
        const newVersion = (sop.version || 1) + 1;
        const merged = { ...pickFields(sop), instructions: sop.instructions || sop.content || '', ...pickFields(proposed) };
        const update = {
          ...merged,
          content: merged.instructions,
          version: newVersion,
          last_updated_by: sop.pending_submitted_by,
          last_updated_by_name: sop.pending_submitted_by_name,
          status: 'published',
          version_published_at: now,
          verification_due_date: moment().tz(tz).add(90, 'days').format('YYYY-MM-DD'),
          last_verified_by: user.email,
          last_verified_by_name: user.full_name || user.email,
          last_verified_at: now,
          pending_changes: null, pending_state: null, pending_review_note: null,
          pending_reviewed_by_name: null, pending_submitted_at: null,
          pending_content: null, pending_summary: null, pending_tags: null,
          pending_change_summary: null, pending_submitted_by: null, pending_submitted_by_name: null,
        };
        await base44.asServiceRole.entities.SOP.update(id, update);

        const versionPayload = {
          sop_id: id, version_number: newVersion, title: merged.title ?? sop.title,
          content: merged.instructions, summary: merged.summary, tags: merged.tags,
          category: merged.category ?? sop.category,
          snapshot: { ...pickFields(merged), instructions: merged.instructions },
          change_summary: sop.pending_change_summary || 'Manager update (approved)',
          created_by_name: sop.pending_submitted_by_name,
        };
        const existingVersion = await base44.asServiceRole.entities.SOPVersion.filter({ sop_id: id, version_number: newVersion });
        if (existingVersion[0]) await base44.asServiceRole.entities.SOPVersion.update(existingVersion[0].id, versionPayload);
        else await base44.asServiceRole.entities.SOPVersion.create(versionPayload);

        return Response.json({ success: true, version: newVersion, requires_acknowledgement: !!merged.requires_acknowledgement });
      }

      // Reject: the live version stays published; the edit goes back to the manager with the admin's note.
      await base44.asServiceRole.entities.SOP.update(id, {
        pending_changes: proposed,
        pending_state: 'changes_requested',
        pending_review_note: String(note || '').slice(0, 2000),
        pending_reviewed_by_name: user.full_name || user.email,
        pending_content: null, pending_summary: null, pending_tags: null,
        status: 'published',
      });
      return Response.json({ success: true });
    }

    if (type === 'checklist') {
      const list = await base44.asServiceRole.entities.ChecklistTemplate.filter({ id });
      const template = list[0];
      if (!template) return Response.json({ error: 'Checklist not found' }, { status: 404 });

      const isEditApproval = !!(template.pending_items && template.pending_items.length > 0);

      if (action === 'approve') {
        if (isEditApproval) {
          await base44.asServiceRole.entities.ChecklistTemplate.update(id, {
            items: template.pending_items,
            description: template.pending_description || template.description,
            pending_items: null, pending_description: null, pending_change_summary: null,
            pending_submitted_by: null, pending_submitted_by_name: null,
            status: 'published',
          });
        } else {
          await base44.asServiceRole.entities.ChecklistTemplate.update(id, {
            status: 'published',
            pending_submitted_by: null, pending_submitted_by_name: null,
          });
        }
      } else {
        if (isEditApproval) {
          await base44.asServiceRole.entities.ChecklistTemplate.update(id, {
            pending_items: null, pending_description: null, pending_change_summary: null,
            pending_submitted_by: null, pending_submitted_by_name: null,
            status: 'published',
          });
        } else {
          await base44.asServiceRole.entities.ChecklistTemplate.update(id, {
            status: 'draft',
            pending_submitted_by: null, pending_submitted_by_name: null,
          });
        }
        // Send rejection notice server-side — recipient validated against known users/invites
        // so a client-settable pending_submitted_by can't email arbitrary external addresses.
        if (template.pending_submitted_by) {
          try {
            const [users, invites] = await Promise.all([
              base44.asServiceRole.entities.User.filter({ email: template.pending_submitted_by }),
              base44.asServiceRole.entities.PendingInvite.filter({ email: template.pending_submitted_by }),
            ]);
            if (users.length > 0 || invites.length > 0) {
              const safeTitle = String(template.title || '').replace(/[\r\n\t<>]/g, ' ').substring(0, 200).trim();
              await base44.integrations.Core.SendEmail({
                to: template.pending_submitted_by,
                subject: `Checklist Returned to Draft: ${safeTitle}`,
                body: `Hi,\n\nYour checklist template "${safeTitle}" has been returned to draft by an admin. Please log in to review and make any needed changes before resubmitting.\n\nThanks!`,
                from_name: "Pet's Favorite Hub",
              });
            }
          } catch { /* email is best-effort */ }
        }
      }
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Invalid type (sop or checklist)' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}