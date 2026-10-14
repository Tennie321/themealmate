import { createHmac, timingSafeEqual } from 'node:crypto';

/** Verify short-lived browser grants without ever storing the signing secret client-side. */
export function verifyTicket(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 2048 || secret.length < 32) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  let supplied;
  try { supplied = Buffer.from(parts[1], 'base64url'); } catch { return null; }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (
      payload?.aud !== 'astra-remote-browser' ||
      payload?.sub !== 'private-owner' ||
      typeof payload?.nonce !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(payload.nonce) ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp < now || payload.exp > now + 60_000
    ) return null;
    return payload;
  } catch { return null; }
}
