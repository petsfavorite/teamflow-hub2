import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const today = new Date().toISOString().split('T')[0];

    // Get all active checklists
    const activeChecklists = await base44.asServiceRole.entities.ChecklistTemplate.filter({ status: 'active' });

    // Make visible those with due_date matching today
    for (const checklist of activeChecklists) {
      if (checklist.due_date === today && checklist.is_visible === false) {
        await base44.asServiceRole.entities.ChecklistTemplate.update(checklist.id, { is_visible: true });
      }
    }

    return Response.json({ success: true, updated: activeChecklists.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});