// Shared helper for sending call log error emails.
// Each alert subject is throttled independently (1 email/hour per subject) so
// a noisy failure can't hide a different one. Timestamps live in AppSettings.

const ERROR_EMAIL_RECIPIENT = "drcaroline@petsfavoritevet.com";
const THROTTLE_MS = 3600000; // 1 hour per subject

export async function sendCallLogErrorEmail(base44, subject, body) {
  try {
    const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
    const settings = settingsList?.[0];
    const now = new Date().toISOString();
    const times = { ...(settings?.call_log_error_email_times || {}) };

    const lastEmailAt = times[subject];
    if (lastEmailAt && Date.now() - new Date(lastEmailAt).getTime() < THROTTLE_MS) return false;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: ERROR_EMAIL_RECIPIENT,
      subject: `[Call Log Alert] ${subject}`,
      body,
      from_name: "Pet's Favorite Hub",
    });

    times[subject] = now;
    const patch = { call_log_error_email_times: times, last_call_log_error_email_at: now };
    if (settings) {
      await base44.asServiceRole.entities.AppSettings.update(settings.id, patch);
    } else {
      await base44.asServiceRole.entities.AppSettings.create({ key: "global", ...patch });
    }
    return true;
  } catch (err) {
    console.error("Failed to send call log error email:", err.message);
    return false;
  }
}
