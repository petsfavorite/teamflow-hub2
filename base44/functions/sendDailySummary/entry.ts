import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import moment from 'npm:moment-timezone@0.5.45';
import { requireAdminOnly } from '../../shared/auth.ts';

// Daily operations summary email for managers and above.
// Managers see only checklists/tasks scoped to their teams; admins see everything.
// Incidents, maintenance, SOPs, and pending approvals are shown to all recipients.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { error: authError } = await requireAdminOnly(base44);
    if (authError) return authError;

    const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    const tz = settings[0]?.global_timezone || 'America/New_York';
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz });
    const startOfTodayIso = moment.tz(todayStr + 'T00:00:00', tz).toISOString();
    const seventyTwoHoursAgoIso = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();
    const sevenDaysFromNowStr = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: tz });

    const [
      allUsers, teams, activeChecklists, openTasks,
      openIncidents, newIncidentsAll, openMaintenance, newMaintenanceAll,
      publishedSops, pendingSops, pendingChecklists,
    ] = await Promise.all([
      base44.asServiceRole.entities.User.list('full_name', 5000),
      base44.asServiceRole.entities.Team.list(),
      base44.asServiceRole.entities.ChecklistTemplate.filter({ status: 'active' }),
      base44.asServiceRole.entities.Task.filter({ status: { $in: ['pending', 'in_progress'] } }),
      base44.asServiceRole.entities.IncidentReport.filter({ status: { $in: ['open', 'under_review'] } }),
      base44.asServiceRole.entities.IncidentReport.filter({ created_date: { $gte: startOfTodayIso } }),
      base44.asServiceRole.entities.MaintenanceRequest.filter({ status: { $ne: 'completed' } }),
      base44.asServiceRole.entities.MaintenanceRequest.filter({ created_date: { $gte: startOfTodayIso } }),
      base44.asServiceRole.entities.SOP.filter({ status: 'published' }),
      base44.asServiceRole.entities.SOP.filter({ status: 'pending_approval' }),
      base44.asServiceRole.entities.ChecklistTemplate.filter({ status: 'pending_approval' }),
    ]);

    // Categorize checklists: due today, overdue, or no due date (skip future-dated)
    const dueTodayChecklists = activeChecklists.filter(c => c.due_date === todayStr);
    const overdueChecklists = activeChecklists.filter(c => c.due_date && c.due_date < todayStr);
    const noDateChecklists = activeChecklists.filter(c => !c.due_date);

    // Categorize tasks the same way
    const dueTodayTasks = openTasks.filter(t => t.due_date === todayStr);
    const overdueTasks = openTasks.filter(t => t.due_date && t.due_date < todayStr);
    const noDateTasks = openTasks.filter(t => !t.due_date);

    // Stalled = still open and no update in 72 hours
    const stalledIncidents = openIncidents.filter(i => (i.updated_date || i.created_date) < seventyTwoHoursAgoIso);
    const stalledMaintenance = openMaintenance.filter(m => (m.updated_date || m.created_date) < seventyTwoHoursAgoIso);

    // SOPs due for verification within 7 days (or already overdue)
    const sopsDueSoon = publishedSops.filter(s => s.verification_due_date && s.verification_due_date <= sevenDaysFromNowStr);

    const recipients = allUsers.filter(u =>
      ['manager', 'admin', 'super_admin'].includes(u.role) && !u.is_archived && u.email
    );

    const teamMap = new Map(teams.map(t => [t.id, t]));

    let sent = 0;
    let errors = 0;
    for (const recipient of recipients) {
      try {
        const isAdmin = recipient.role === 'admin' || recipient.role === 'super_admin';
        const scope = isAdmin ? null : getManagerScope(recipient, teamMap);

        const scopedChecklists = {
          dueToday: isAdmin ? dueTodayChecklists : dueTodayChecklists.filter(c => isInScope(c, scope)),
          overdue: isAdmin ? overdueChecklists : overdueChecklists.filter(c => isInScope(c, scope)),
          noDate: isAdmin ? noDateChecklists : noDateChecklists.filter(c => isInScope(c, scope)),
        };
        const scopedTasks = {
          dueToday: isAdmin ? dueTodayTasks : dueTodayTasks.filter(t => isInScope(t, scope)),
          overdue: isAdmin ? overdueTasks : overdueTasks.filter(t => isInScope(t, scope)),
          noDate: isAdmin ? noDateTasks : noDateTasks.filter(t => isInScope(t, scope)),
        };

        const html = buildEmail({
          recipientName: recipient.first_name || recipient.full_name || 'Team',
          todayStr, isAdmin,
          checklists: scopedChecklists,
          tasks: scopedTasks,
          newIncidents: newIncidentsAll,
          newMaintenance: newMaintenanceAll,
          stalledIncidents,
          stalledMaintenance,
          sopsDueSoon,
          pendingSops,
          pendingChecklists,
        });

        await base44.asServiceRole.integrations.Core.SendEmail({
          to: recipient.email,
          subject: `Daily Operations Summary — ${todayStr}`,
          html,
          from_name: "Pet's Favorite Hub",
        });
        sent++;
      } catch (e) {
        errors++;
      }
    }

    return Response.json({ success: true, sent, errors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// --- Helpers ---

function getManagerScope(manager, teamMap) {
  const managerTeamIds = manager.team_ids || [];
  const memberEmails = new Set();
  if (manager.email) memberEmails.add(manager.email);
  for (const teamId of managerTeamIds) {
    const team = teamMap.get(teamId);
    if (team?.member_emails) {
      team.member_emails.forEach(e => memberEmails.add(e));
    }
  }
  return { teamIds: new Set(managerTeamIds), memberEmails };
}

function isInScope(item, scope) {
  if (!scope) return true;
  if (item.assigned_teams) {
    for (const tid of item.assigned_teams) {
      if (scope.teamIds.has(tid)) return true;
    }
  }
  if (item.assigned_to_emails) {
    for (const email of item.assigned_to_emails) {
      if (scope.memberEmails.has(email)) return true;
    }
  }
  return false;
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function priorityBadge(priority) {
  const colors = { high: '#dc2626', medium: '#f59e0b', low: '#65a30d' };
  const color = colors[priority] || '#78716c';
  return ` <span style="background:${color};color:#fff;padding:1px 6px;border-radius:4px;font-size:11px;">${esc(priority || 'medium')}</span>`;
}

function sectionHeading(icon, title, count, color) {
  return `<h3 style="color:${color};border-bottom:2px solid ${color};padding-bottom:4px;margin-top:24px;">${icon} ${esc(title)} (${count})</h3>`;
}

function listStart() {
  return `<ul style="margin:0 0 12px;padding-left:20px;">`;
}

function buildEmail(p) {
  const { recipientName, todayStr, isAdmin, checklists, tasks, newIncidents, newMaintenance, stalledIncidents, stalledMaintenance, sopsDueSoon, pendingSops, pendingChecklists } = p;

  const totalChecklists = checklists.dueToday.length + checklists.overdue.length + checklists.noDate.length;
  const totalTasks = tasks.dueToday.length + tasks.overdue.length + tasks.noDate.length;
  const hasContent = totalChecklists || totalTasks || newIncidents.length || newMaintenance.length || stalledIncidents.length || stalledMaintenance.length || sopsDueSoon.length || (isAdmin && (pendingSops.length || pendingChecklists.length));

  let sections = '';

  // Open Checklists
  if (totalChecklists > 0) {
    sections += sectionHeading('📋', 'Open Checklists', totalChecklists, '#82bb32');
    if (checklists.dueToday.length) {
      sections += `<p style="margin:8px 0 4px;"><strong>Due Today:</strong></p>${listStart()}`;
      for (const c of checklists.dueToday) {
        sections += `<li style="margin-bottom:4px;">${esc(c.title || 'Untitled')}${c.assigned_to_names?.length ? ` — ${esc(c.assigned_to_names.join(', '))}` : ''}</li>`;
      }
      sections += `</ul>`;
    }
    if (checklists.overdue.length) {
      sections += `<p style="margin:8px 0 4px;"><strong style="color:#dc2626;">Overdue:</strong></p>${listStart()}`;
      for (const c of checklists.overdue) {
        sections += `<li style="margin-bottom:4px;color:#dc2626;">${esc(c.title || 'Untitled')} — was due ${esc(c.due_date)}${c.assigned_to_names?.length ? ` (${esc(c.assigned_to_names.join(', '))})` : ''}</li>`;
      }
      sections += `</ul>`;
    }
    if (checklists.noDate.length) {
      sections += `<p style="margin:8px 0 4px;"><strong>No due date:</strong></p>${listStart()}`;
      for (const c of checklists.noDate) {
        sections += `<li style="margin-bottom:4px;">${esc(c.title || 'Untitled')}${c.assigned_to_names?.length ? ` — ${esc(c.assigned_to_names.join(', '))}` : ''}</li>`;
      }
      sections += `</ul>`;
    }
  }

  // Open Tasks
  if (totalTasks > 0) {
    sections += sectionHeading('✅', 'Open Tasks', totalTasks, '#82bb32');
    if (tasks.dueToday.length) {
      sections += `<p style="margin:8px 0 4px;"><strong>Due Today:</strong></p>${listStart()}`;
      for (const t of tasks.dueToday) {
        sections += `<li style="margin-bottom:4px;">${esc(t.title || 'Untitled')}${priorityBadge(t.priority)}${t.assigned_to_names?.length ? ` — ${esc(t.assigned_to_names.join(', '))}` : ''}</li>`;
      }
      sections += `</ul>`;
    }
    if (tasks.overdue.length) {
      sections += `<p style="margin:8px 0 4px;"><strong style="color:#dc2626;">Overdue:</strong></p>${listStart()}`;
      for (const t of tasks.overdue) {
        sections += `<li style="margin-bottom:4px;color:#dc2626;">${esc(t.title || 'Untitled')} — was due ${esc(t.due_date)}${priorityBadge(t.priority)}${t.assigned_to_names?.length ? ` (${esc(t.assigned_to_names.join(', '))})` : ''}</li>`;
      }
      sections += `</ul>`;
    }
    if (tasks.noDate.length) {
      sections += `<p style="margin:8px 0 4px;"><strong>No due date:</strong></p>${listStart()}`;
      for (const t of tasks.noDate) {
        sections += `<li style="margin-bottom:4px;">${esc(t.title || 'Untitled')}${priorityBadge(t.priority)}${t.assigned_to_names?.length ? ` — ${esc(t.assigned_to_names.join(', '))}` : ''}</li>`;
      }
      sections += `</ul>`;
    }
  }

  // New Incidents
  if (newIncidents.length) {
    sections += sectionHeading('⚠️', 'New Incidents Today', newIncidents.length, '#82bb32');
    sections += listStart();
    for (const i of newIncidents) {
      sections += `<li style="margin-bottom:4px;"><strong>${esc(i.title)}</strong> — ${esc(i.category)}${i.reported_by_name ? ` — reported by ${esc(i.reported_by_name)}` : ''}${i.status ? ` — <em>${esc(i.status)}</em>` : ''}</li>`;
    }
    sections += `</ul>`;
  }

  // New Maintenance Requests
  if (newMaintenance.length) {
    sections += sectionHeading('🔧', 'New Maintenance Requests Today', newMaintenance.length, '#82bb32');
    sections += listStart();
    for (const m of newMaintenance) {
      sections += `<li style="margin-bottom:4px;"><strong>${esc(m.title)}</strong> — ${esc(m.priority || 'medium')} priority${m.location ? ` — ${esc(m.location)}` : ''}${m.requested_by_name ? ` — requested by ${esc(m.requested_by_name)}` : ''}</li>`;
    }
    sections += `</ul>`;
  }

  // Stalled Incidents
  if (stalledIncidents.length) {
    sections += sectionHeading('⏰', 'Stalled Incidents — 72+ hours without movement', stalledIncidents.length, '#f59e0b');
    sections += listStart();
    for (const i of stalledIncidents) {
      const updated = i.updated_date || i.created_date;
      sections += `<li style="margin-bottom:4px;"><strong>${esc(i.title)}</strong> — ${esc(i.status)} — last updated ${esc(updated ? new Date(updated).toLocaleDateString() : 'unknown')}</li>`;
    }
    sections += `</ul>`;
  }

  // Stalled Maintenance
  if (stalledMaintenance.length) {
    sections += sectionHeading('⏰', 'Stalled Maintenance Requests — 72+ hours without movement', stalledMaintenance.length, '#f59e0b');
    sections += listStart();
    for (const m of stalledMaintenance) {
      const updated = m.updated_date || m.created_date;
      sections += `<li style="margin-bottom:4px;"><strong>${esc(m.title)}</strong> — ${esc(m.status)} — last updated ${esc(updated ? new Date(updated).toLocaleDateString() : 'unknown')}</li>`;
    }
    sections += `</ul>`;
  }

  // SOPs Due for Verification
  if (sopsDueSoon.length) {
    sections += sectionHeading('📖', 'SOPs Due for Verification Soon', sopsDueSoon.length, '#82bb32');
    sections += listStart();
    for (const s of sopsDueSoon) {
      const isOverdue = s.verification_due_date < todayStr;
      sections += `<li style="margin-bottom:4px;${isOverdue ? 'color:#dc2626;' : ''}\"><strong>${esc(s.title)}</strong> — ${isOverdue ? 'OVERDUE — was due' : 'due'} ${esc(s.verification_due_date)}${s.category ? ` (${esc(s.category)})` : ''}</li>`;
    }
    sections += `</ul>`;
  }

  // Pending Approvals (admin only)
  if (isAdmin && (pendingSops.length || pendingChecklists.length)) {
    sections += `<h3 style="color:#7c3aed;border-bottom:2px solid #7c3aed;padding-bottom:4px;margin-top:24px;">🔔 Pending Approvals</h3>`;
    if (pendingSops.length) {
      sections += `<p style="margin:8px 0 4px;"><strong>SOPs awaiting approval (${pendingSops.length}):</strong></p>${listStart()}`;
      for (const s of pendingSops) {
        sections += `<li style="margin-bottom:4px;"><strong>${esc(s.title)}</strong>${s.pending_submitted_by_name ? ` — submitted by ${esc(s.pending_submitted_by_name)}` : ''}${s.pending_change_summary ? ` — ${esc(s.pending_change_summary)}` : ''}</li>`;
      }
      sections += `</ul>`;
    }
    if (pendingChecklists.length) {
      sections += `<p style="margin:8px 0 4px;"><strong>Checklists awaiting approval (${pendingChecklists.length}):</strong></p>${listStart()}`;
      for (const c of pendingChecklists) {
        sections += `<li style="margin-bottom:4px;"><strong>${esc(c.title)}</strong>${c.pending_submitted_by_name ? ` — submitted by ${esc(c.pending_submitted_by_name)}` : ''}${c.pending_change_summary ? ` — ${esc(c.pending_change_summary)}` : ''}</li>`;
      }
      sections += `</ul>`;
    }
  }

  if (!hasContent) {
    sections = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;"><p style="margin:0;color:#15803d;">✅ Everything is up to date — no open checklists, open tasks, new incidents, or pending approvals.</p></div>`;
  }

  return `<html><body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
<h2 style="color:#1c1917;margin-bottom:4px;">Daily Operations Summary</h2>
<p style="color:#78716c;margin-top:0;">${esc(todayStr)}</p>
<p>Hi ${esc(recipientName)},</p>
<p>Here's your daily summary of open items and recent activity${isAdmin ? '' : ' for your teams'}.</p>
${sections}
<hr style="border:none;border-top:1px solid #e7e5e4;margin:24px 0;">
<p style="font-size:12px;color:#a8a29e;">This is an automated daily summary from Pet's Favorite Hub.</p>
</body></html>`;
}