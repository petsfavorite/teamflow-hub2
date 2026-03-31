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

    // Fetch recent bonuses using v1 endpoint with Bearer token
    const response = await fetch('https://bonus.ly/api/v1/bonuses?limit=4', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      const error = await response.text();
      return Response.json({ error: `Bonusly API error: ${response.status} - ${error}` }, { status: 500 });
    }

    const data = await response.json();
    const bonuses = data.bonuses || [];

    // Map fields from response
    const recognitions = bonuses.map(bonus => ({
      giver: bonus.sender?.short_name || 'Unknown',
      receiver: bonus.receiver?.short_name || 'Unknown',
      message: bonus.reason || '',
      tags: bonus.hashtags || [],
      time: bonus.created_at
    }));

    return Response.json({ recognitions });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});