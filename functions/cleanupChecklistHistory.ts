import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json();

        // Trigger only on ChecklistCompletion creation
        if (payload.event?.type !== 'create' || payload.event?.entity_name !== 'ChecklistCompletion') {
            return Response.json({ success: true, skipped: true });
        }

        const completionId = payload.event?.entity_id;
        const completion = payload.data;

        if (!completion || !completion.checklist_template_id) {
            return Response.json({ success: true, skipped: true });
        }

        // Get all completions for this checklist template, sorted by creation date
        const allCompletions = await base44.asServiceRole.entities.ChecklistCompletion.filter(
            { checklist_template_id: completion.checklist_template_id },
            'created_date'
        );

        // If more than 60, delete the oldest ones
        if (allCompletions.length > 60) {
            const toDelete = allCompletions.slice(0, allCompletions.length - 60);
            
            for (const item of toDelete) {
                await base44.asServiceRole.entities.ChecklistCompletion.delete(item.id);
            }

            return Response.json({ 
                success: true, 
                deleted: toDelete.length,
                kept: 60,
                checklist_template_id: completion.checklist_template_id
            });
        }

        return Response.json({ success: true, deletedCount: 0 });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});