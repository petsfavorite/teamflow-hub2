import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Runs on ChecklistCompletion create — deletes completions older than 60 days for the same template.
// Also runs a global sweep to catch any orphaned old records.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const cutoff = sixtyDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD

    let deleted = 0;

    if (payload.event?.type === 'create' && payload.event?.entity_name === 'ChecklistCompletion') {
      // Targeted cleanup: only for the template that just got a new completion
      const templateId = payload.data?.checklist_template_id;
      if (templateId) {
        const old = await base44.asServiceRole.entities.ChecklistCompletion.filter({
          checklist_template_id: templateId,
        });
        for (const c of old) {
          const recordDate = (c.completion_date || c.created_date || '').slice(0, 10);
          if (recordDate && recordDate < cutoff) {
            await base44.asServiceRole.entities.ChecklistCompletion.delete(c.id);
            deleted++;
          }
        }
      }
    } else {
      // Global sweep (e.g. called from a scheduled automation)
      const allCompletions = await base44.asServiceRole.entities.ChecklistCompletion.list('completion_date', 2000);
      for (const c of allCompletions) {
        const recordDate = (c.completion_date || c.created_date || '').slice(0, 10);
        if (recordDate && recordDate < cutoff) {
          await base44.asServiceRole.entities.ChecklistCompletion.delete(c.id);
          deleted++;
        }
      }
    }

    return Response.json({ success: true, deleted });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});