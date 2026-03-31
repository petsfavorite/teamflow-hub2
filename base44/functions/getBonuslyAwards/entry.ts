import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = Deno.env.get('BONUSLY_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'Bonusly API key not configured' }, { status: 500 });
    }

    // Fetch recent bonuses - Bonusly uses HTTP Basic Auth with token as password
    const authHeader = 'Basic ' + btoa(`${apiKey}:X`);
    const response = await fetch('https://bonus.ly/api/v2/bonuses?limit=50', {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      const error = await response.text();
      return Response.json({ error: `Bonusly API error: ${response.status} - ${error}` }, { status: 500 });
    }

    const data = await response.json();
    const awards = data.result?.bonuses || [];

    // Return top 3 awards
    return Response.json({
      awards: awards.slice(0, 3).map(award => ({
        id: award.id,
        giver_name: award.giver?.full_name || 'Unknown',
        receiver_name: award.receiver?.full_name || 'Unknown',
        reason: award.reason,
        amount: award.amount,
        created_at: award.created_at,
      }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});