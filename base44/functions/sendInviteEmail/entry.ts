import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'super_admin', 'manager'].includes(user.role)) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { email, firstName, lastName, pin } = await req.json();

    if (!email || !pin) {
      return Response.json({ error: 'Missing email or PIN' }, { status: 400 });
    }

    const subject = 'You\'re invited to join our team!';
    const body = `Hello${firstName ? ' ' + firstName : ''},

You've been invited to join our team. Here are your login details:

Email: ${email}
PIN: ${pin}

Please use these credentials to access the application.

Welcome aboard!`;

    await base44.integrations.Core.SendEmail({
      to: email,
      subject,
      body,
      from_name: "Pet's Favorite Hub",
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});