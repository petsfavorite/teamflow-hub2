// Shared helper for sending call log error emails with 1-hour throttle.
// Stores last email timestamp in AppSettings to avoid spamming.

const ERROR_EMAIL_RECIPIENT = "drcaroline@petsfavoritevet.com";
const THROTTLE_MS = 3600000; // 1 hour

export async function sendCallLogErrorEmail(base44, subject, body) {
  try {
    const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
    const settings = settingsList?.[0];
    const now = new Date().toISOString();
    const lastEmailAt = settings?.last_call_log_error_email_at;

    // Throttle: only send if > 1 hour since last error email
    if (lastEmailAt) {
      const elapsed = Date.now() - new Date(lastEmailAt).getTime();
      if (elapsed < THROTTLE_MS) return false;
    }

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: ERROR_EMAIL_RECIPIENT,
      subject: `[Call Log Alert] ${subject}`,
      body,
      from_name: "Pet's Favorite Hub",
    });

    // Update throttle timestamp
    if (settings) {
      await base44.asServiceRole.entities.AppSettings.update(settings.id, {
        last_call_log_error_email_at: now,
      });
    } else {
      await base44.asServiceRole.entities.AppSettings.create({
        key: "global",
        last_call_log_error_email_at: now,
      });
    }
    return true;
  } catch (err) {
    console.error("Failed to send call log error email:", err.message);
    return false;
  }
}