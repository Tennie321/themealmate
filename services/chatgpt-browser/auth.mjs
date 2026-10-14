import { createHmac, timingSafeEqual } from 'node:crypto';

/** Validate a short-lived, origin-bound, one-use grant from the Astra backend. */
export function verifyTicket(token, { secret, origin, used, now = Date.now() }) {
  if (typeof token !== 'string' || token.length > 2048) return false;
  if (typeof secret !== 'string' || secret.length < 32 || !origin) return false;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[0-9a-f]{64}$/.test(parts[1])) return false;
  const actual = Buffer.from(parts[1], 'hex');
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  if (!timingSafeEqual(actual, expected)) return false;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); }
  catch { return false; }
  if (!payload || payload.aud !== 'astra-browser-v1' || payload.sub !== 'owner' || payload.origin !== origin) return false;
  if (!Number.isSafeInteger(payload.exp) || payload.exp <= now || payload.exp > now + 60_000) return false;
  if (typeof payload.nonce !== 'string' || !/^[0-9a-f-]{36}$/.test(payload.nonce) || used.has(payload.nonce)) return false;
  used.add(payload.nonce);
  return true;
}
