import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyTicket(token, secret, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 32 || typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  const actual = Buffer.from(parts[1], 'base64url');
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { return null; }
  if (!payload || payload.scope !== 'astra-remote-browser' ||
      typeof payload.nonce !== 'string' || !/^[0-9a-f-]{36}$/.test(payload.nonce) ||
      !Number.isSafeInteger(payload.exp) || payload.exp < now || payload.exp > now + 60_000) return null;
  return payload;
}
