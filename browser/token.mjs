import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
const aud = 'astra-browser-v1';
const sign = (key, payload) => createHmac('sha256', key).update(payload).digest('base64url');
export const validSecret = secret => typeof secret === 'string' && secret.length >= 32;
export function issueTicket(secret, now=Date.now()) {
  if (!validSecret(secret)) throw new Error('Browser secret not configured');
  const payload = Buffer.from(JSON.stringify({ aud, sub:'owner', exp:now+120000, jti:randomUUID() })).toString('base64url');
  return payload + '.' + sign(secret, payload);
}
export function verifyTicket(secret, token, now=Date.now()) {
  if (!validSecret(secret) || typeof token !== 'string' || token.length > 1200) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  const actual = Buffer.from(parts[1], 'base64url'), expected = Buffer.from(sign(secret,parts[0]),'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual,expected)) return null;
  try {
    const claim = JSON.parse(Buffer.from(parts[0],'base64url').toString());
    return claim.aud===aud && claim.sub==='owner' && Number.isSafeInteger(claim.exp)
      && claim.exp > now && claim.exp <= now+120000 && /^[0-9a-f-]{36}$/.test(claim.jti) ? claim : null;
  } catch { return null; }
}
