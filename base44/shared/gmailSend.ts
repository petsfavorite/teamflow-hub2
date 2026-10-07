// Sends a plain-text email through the app's connected Gmail account
// (helpers@petsfavoritevet.com) so it comes from the clinic's own domain.

const FROM_NAME = "Pet's Favorite Hub";

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function toBase64Url(str: string): string {
  return toBase64(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeHeader(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${toBase64(value)}?=`;
}

function wrapLines(str: string, width = 76): string {
  return (str.match(new RegExp(`.{1,${width}}`, 'g')) || []).join('\r\n');
}

export async function sendViaGmail(base44: any, to: string, subject: string, text: string): Promise<void> {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
  const headers = { Authorization: `Bearer ${accessToken}` };

  // The connected account's address (the send-only scope can't read the Gmail profile)
  let fromAddress = '';
  const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers });
  if (infoRes.ok) fromAddress = (await infoRes.json()).email || '';

  const raw = [
    `From: ${fromAddress ? `"${FROM_NAME}" <${fromAddress}>` : `"${FROM_NAME}"`}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapLines(toBase64(text)),
  ].join('\r\n');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: toBase64Url(raw) }),
  });
  if (!res.ok) {
    throw new Error(`Gmail send failed (${res.status}): ${await res.text()}`);
  }
}