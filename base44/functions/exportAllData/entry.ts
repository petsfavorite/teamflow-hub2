import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin' && user?.role !== 'super_admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const entities = [
      'Pet', 'Visit', 'Task', 'TaskHistory', 'SOP', 'SOPVersion', 'SOPAcknowledgement', 'SOPTag',
      'ChecklistTemplate', 'ChecklistCompletion', 'ChecklistVersion', 'ChecklistNotification',
      'ChecklistTimeoutNotification', 'RecurringChecklist', 'Team', 'Asset', 'MaintenanceRequest',
      'IncidentReport', 'ExternalLink', 'AppSettings', 'PendingInvite', 'CallRecord', 'Report'
    ];

    const exportData = { exported_at: new Date().toISOString(), entities: {} };

    for (const entityName of entities) {
      try {
        const records = [];
        let skip = 0;
        const limit = 500;
        while (true) {
          const batch = await base44.asServiceRole.entities[entityName].list(null, limit, skip);
          if (!batch || batch.length === 0) break;
          records.push(...batch);
          if (batch.length < limit) break;
          skip += limit;
        }
        exportData.entities[entityName] = records;
      } catch {
        exportData.entities[entityName] = [];
      }
    }

    return Response.json(exportData);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});