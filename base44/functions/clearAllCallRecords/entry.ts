import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all CallRecords
    const allRecords = await base44.asServiceRole.entities.CallRecord.list('-created_date', 5000);
    
    // Delete each one
    let deleted = 0;
    for (const record of allRecords) {
      await base44.asServiceRole.entities.CallRecord.delete(record.id);
      deleted++;
    }

    return Response.json({ deleted, message: `Cleared ${deleted} call records` });
  } catch (error) {
    console.error("[ERROR]", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});