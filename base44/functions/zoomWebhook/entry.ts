import { createHmac } from 'node:crypto';

Deno.serve(async (req) => {
  try {
    const bodyText = await req.text();
    let body;
    try { body = JSON.parse(bodyText); } catch { return Response.json({ received: true }); }

    if (body.event === "endpoint.url_validation") {
      const secret = Deno.env.get("ZOOM_WEBHOOK_SECRET");
      if (!secret) return Response.json({ error: "Webhook secret not configured" }, { status: 500 });
      const plainToken = body.payload?.plainToken;
      if (!plainToken) return Response.json({ error: "No plainToken" }, { status: 400 });
      const hash = createHmac("sha256", secret).update(plainToken).digest("hex");
      return Response.json({ plainToken, encryptedToken: hash });
    }

    return Response.json({ received: true, status: "disabled" });
  } catch (error) {
    return Response.json({ received: true });
  }
});