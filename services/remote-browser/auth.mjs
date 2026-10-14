import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
const MAX_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE = 'astra_beta_session';
/** Verify Astra's existing signed HTTP-only beta session. */
export function authenticate(headers, { origin, secret, now = Date.now() }) {
  if (!origin || headers.origin !== origin) return { ok: false, status: 403 };
  if (typeof secret !== 'string' || secret.length < 32) return { ok: false, status: 503 };
  const cookies = (headers.cookie || '').split(';').map(part => part.trim());
  const token = cookies.find(part => part.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  const match = token?.match(/^(\d{13})\.([0-9a-f-]{36})\.([0-9a-f]{64})$/);
  if (!match) return { ok: false, status: 401 };
  const expires = Number(match[1]);
  if (!Number.isSafeInteger(expires) || expires < now || expires > now + MAX_SESSION_MS) {
    return { ok: false, status: 401 };
  }
  const actual = Buffer.from(match[3], 'hex');
  const expected = createHmac('sha256', secret).update(match[1] + '.' + match[2]).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, status: 401 };
  }
  const profileId = createHash('sha256').update(match[2]).digest('hex').slice(0, 32);
  return { ok: true, profileId };
}
