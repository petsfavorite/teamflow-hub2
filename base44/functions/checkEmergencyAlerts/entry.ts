import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all checked-in boarding visits
    const visits = await base44.asServiceRole.entities.Visit.filter({
      status: 'checked_in',
      visit_type: 'boarding'
    });

    const now = new Date();
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    for (const visit of visits) {
      // Skip if pet hasn't been checked in for 48 hours
      const checkInTime = new Date(visit.check_in_time);
      if (now.getTime() - checkInTime.getTime() < 48 * 60 * 60 * 1000) {
        continue;
      }

      // Check if currently dismissed
      const isDismissed = visit.emergency_alert_dismissed_until && 
        new Date(visit.emergency_alert_dismissed_until) > now;

      let shouldTriggerAlert = false;
      let alertType = '';

      // Get pet info to check species
      const pet = await base44.asServiceRole.entities.Pet.filter({ id: visit.pet_id });
      if (!pet || pet.length === 0) continue;

      const species = pet[0].species;

      // Check care log for actual observed feces/urine in last 48 hours
      // Care log entries store time as "h:mm A" string and date as "YYYY-MM-DD"
      // Fall back to completed_iso on scheduled_tasks if care log timestamps are missing
      const recentCareLog = (visit.care_log || []).filter(log => {
        // Try ISO timestamp first (some entries may have it)
        if (log.timestamp) {
          return new Date(log.timestamp) > fortyEightHoursAgo;
        }
        // Use date field (YYYY-MM-DD) if available
        if (log.date) {
          const logDate = new Date(log.date + 'T23:59:59');
          return logDate > fortyEightHoursAgo;
        }
        // If only time string (no date), assume it's from today
        return true;
      });

      // Only count logged activities (not auto-removed tasks at 11:59 PM)
      const hasObservedFeces = recentCareLog.some(log =>
        log.activity && log.activity.toLowerCase().includes('feces') && log.staff
      );
      const hasObservedUrine = recentCareLog.some(log =>
        log.activity && log.activity.toLowerCase().includes('urine') && log.staff
      );
      const hasObservedAte = recentCareLog.some(log =>
        log.activity && log.activity.toLowerCase().includes('ate') && log.staff
      );

      // Also check completed scheduled tasks (they have completed_iso timestamps)
      const recentCompletedTasks = (visit.scheduled_tasks || []).filter(task => {
        if (!task.completed || !task.completed_iso) return false;
        return new Date(task.completed_iso) > fortyEightHoursAgo;
      });

      const hasCompletedFeces = recentCompletedTasks.some(t =>
        t.type && (t.type.toLowerCase().includes('feces') || t.type.toLowerCase().includes('fecal'))
      );
      const hasCompletedUrine = recentCompletedTasks.some(t =>
        t.type && t.type.toLowerCase().includes('urine')
      );
      const hasCompletedAte = recentCompletedTasks.some(t =>
        t.type && (t.type.toLowerCase().includes('ate') || t.type.toLowerCase().includes('meal') || t.type.toLowerCase().includes('food'))
      );

      const missingItems = [];
      if (!hasObservedFeces && !hasCompletedFeces) missingItems.push('feces');
      if (!hasObservedUrine && !hasCompletedUrine && species === 'Cat') missingItems.push('urine');
      if (!hasObservedAte && !hasCompletedAte) missingItems.push('ate');

      if (missingItems.length > 0) {
        shouldTriggerAlert = true;
        alertType = missingItems.length === 1 ? missingItems[0] : missingItems.join(',');
      }

      // Update visit with alert status
      if (shouldTriggerAlert && !isDismissed) {
        await base44.asServiceRole.entities.Visit.update(visit.id, {
          emergency_alert_active: true,
          emergency_alert_type: alertType,
          emergency_alert_dismissed_until: null
        });
      } else if (!shouldTriggerAlert && visit.emergency_alert_active) {
        // Clear alert if condition resolved
        await base44.asServiceRole.entities.Visit.update(visit.id, {
          emergency_alert_active: false,
          emergency_alert_type: null,
          emergency_alert_dismissed_until: null
        });
      }
    }

    return Response.json({ success: true, checked: visits.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});