import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// This function is triggered when a SOP is published/updated with requires_acknowledgement=true.
// It no longer creates Tasks — acknowledgement is handled via dashboard notifications.
// We keep this function to clean up any old ack tasks for this SOP and to remain backward compatible.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const sop = body.data;

    if (!sop) return Response.json({ skipped: 'no sop data' });
    if (!sop.requires_acknowledgement || sop.status !== 'published') {
      return Response.json({ skipped: 'not applicable' });
    }

    const sopId = sop.id;

    // Clean up any old "Acknowledge SOP" tasks for this SOP
    const existingTasks = await base44.asServiceRole.entities.Task.filter({ sop_id: sopId });
    for (const t of existingTasks) {
      if (t.title?.startsWith('Acknowledge SOP:')) {
        await base44.asServiceRole.entities.Task.delete(t.id);
      }
    }

    return Response.json({ message: 'Acknowledgement is now handled via dashboard notifications', sop_id: sopId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});