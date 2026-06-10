import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch and delete in pages to avoid rate limits
    let deleted = 0;
    let page;
    do {
      page = await base44.asServiceRole.entities.CallRecord.list('-created_date', 100);
      if (page.length === 0) break;
      await Promise.all(page.map(r => base44.asServiceRole.entities.CallRecord.delete(r.id)));
      deleted += page.length;
    } while (page.length === 100);

    return Response.json({ deleted, message: `Cleared ${deleted} call records` });
  } catch (error) {
    console.error("[ERROR]", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});