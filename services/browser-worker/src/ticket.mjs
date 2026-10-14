import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyTicket(ticket, secret, now = Date.now()) {
  if (typeof ticket !== 'string' || ticket.length > 1024 || typeof secret !== 'string' || secret.length < 32) return null;
  const parts = ticket.split('.');
  if (parts.length !== 2 || !/^[\w-]+$/.test(parts[0]) || !/^[\w-]+$/.test(parts[1])) return null;
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  const actual = Buffer.from(parts[1], 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (claims.aud !== 'astra-browser-v1' || !/^[a-f0-9]{32}$/.test(claims.sid)) return null;
    if (!Number.isSafeInteger(claims.exp) || claims.exp <= now || claims.exp > now + 120_000) return null;
    return claims.sid;
  } catch { return null; }
}
