import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const SESSION_SECONDS = 12 * 60 * 60;
export const SESSION_COOKIE = 'astra_remote_session';

export function validateConfig(env) {
  if ((env.REMOTE_BROWSER_ACCESS_CODE || '').length < 16) throw new Error('REMOTE_BROWSER_ACCESS_CODE must have at least 16 characters');
  if ((env.REMOTE_BROWSER_SESSION_SECRET || '').length < 32) throw new Error('REMOTE_BROWSER_SESSION_SECRET must have at least 32 characters');
}

export function constantEqual(a, b) {
  const left = scryptSync(String(a), 'astra-remote-auth', 32);
  const right = scryptSync(String(b), 'astra-remote-auth', 32);
  return timingSafeEqual(left, right);
}

function signature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function createSession(secret, now = Date.now()) {
  const expiry = now + SESSION_SECONDS * 1000;
  const nonce = randomBytes(16).toString('hex');
  const payload = expiry + '.' + nonce;
  return payload + '.' + signature(payload, secret);
}

export function verifySession(value, secret, now = Date.now()) {
  if (typeof value !== 'string' || !/^\d{13}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(value)) return false;
  const lastDot = value.lastIndexOf('.');
  const payload = value.slice(0, lastDot);
  const mac = value.slice(lastDot + 1);
  const expiry = Number(payload.slice(0, 13));
  if (!Number.isSafeInteger(expiry) || expiry < now || expiry > now + SESSION_SECONDS * 1000) return false;
  return timingSafeEqual(Buffer.from(mac), Buffer.from(signature(payload, secret)));
}

export function cookieValue(header, name = SESSION_COOKIE) {
  const match = String(header || '').split(';').map(v => v.trim()).find(v => v.startsWith(name + '='));
  return match ? match.slice(name.length + 1) : '';
}

export function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.host === request.headers.host;
  } catch {
    return false;
  }
}

export function validPrompt(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 8000;
}

export function safeMessage(raw) {
  if (typeof raw !== 'string' || raw.length > 25000) return null;
  try {
    const m = JSON.parse(raw);
    return m && typeof m === 'object' && typeof m.type === 'string' ? m : null;
  } catch { return null; }
}
