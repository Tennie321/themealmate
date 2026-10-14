/**
 * Short-lived signed grants for the separately deployed browser container.
 */
export async function issueBrowserTicket(secret: string, now = Date.now()): Promise<string> {
  if (secret.length < 32) throw new Error('Browser signing secret is not configured');
  const body = Buffer.from(JSON.stringify({
    aud: 'astra-remote-browser',
    sub: 'private-owner',
    exp: now + 60_000,
    nonce: crypto.randomUUID(),
  })).toString('base64url');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return body + '.' + Buffer.from(bytes).toString('base64url');
}
