import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      return Response.json({ error: 'Only admins can approve or reject content' }, { status: 403 });
    }
    const { type, id, action } = await req.json();
    if (!type || !id || !['approve', 'reject'].includes(action)) {
      return Response.json({ error: 'type, id, and action (approve/reject) are required' }, { status: 400 });
    }

    if (type === 'sop') {
      const list = await base44.asServiceRole.entities.SOP.filter({ id });
      const sop = list[0];
      if (!sop) return Response.json({ error: 'SOP not found' }, { status: 404 });

      if (action === 'approve') {
        const newVersion = (sop.version || 1) + 1;
        await base44.asServiceRole.entities.SOP.update(id, {
          content: sop.pending_content,
          instructions: sop.pending_content,
          summary: sop.pending_summary,
          tags: sop.pending_tags,
          version: newVersion,
          last_updated_by: sop.pending_submitted_by,
          last_updated_by_name: sop.pending_submitted_by_name,
          status: 'published',
          pending_content: null, pending_summary: null, pending_tags: null,
          pending_change_summary: null, pending_submitted_by: null, pending_submitted_by_name: null,
        });
        await base44.asServiceRole.entities.SOPVersion.create({
          sop_id: id, version_number: newVersion, title: sop.title,
          content: sop.pending_content, summary: sop.pending_summary, tags: sop.pending_tags,
          category: sop.category, change_summary: sop.pending_change_summary || 'Manager update (approved)',
          created_by_name: sop.pending_submitted_by_name,
        });
      } else {
        await base44.asServiceRole.entities.SOP.update(id, {
          status: sop.status === 'pending_approval' ? 'draft' : sop.status,
          pending_content: null, pending_summary: null, pending_tags: null,
          pending_change_summary: null, pending_submitted_by: null, pending_submitted_by_name: null,
        });
      }
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
      }
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Invalid type (sop or checklist)' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}