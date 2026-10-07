import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { sendViaGmail } from '../../shared/gmailSend.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { email, firstName } = await req.json();

    if (!email) {
      return Response.json({ error: 'Missing email' }, { status: 400 });
    }

    // Welcome email only — the PIN is never emailed in cleartext.
    // The admin shares the PIN with the user via a secure channel.
    const subject = 'You\'re invited to join our team!';
    const body = `Hello${firstName ? ' ' + firstName : ''},

You've been invited to join our team. Please contact your manager to receive your session PIN and complete your setup.

Welcome aboard!`;

    await sendViaGmail(base44, email, subject, body);

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});