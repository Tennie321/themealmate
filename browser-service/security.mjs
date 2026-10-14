import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'astra_beta_session';
const MAX_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Verify the same signed HttpOnly cookie minted by Astra's private-access.server.
 * This deployment is single-owner; it is not multi-user identity isolation.
 * The browser service must never be exposed to the internet except through the
 * same-origin reverse proxy, and these secrets must never enter the client.
 */
export function authenticateUpgrade(req, env = process.env, now = Date.now()) {
  if ((env.ASTRA_ACCESS_CODE || '').length < 12 ||
      (env.ASTRA_SESSION_SECRET || '').length < 32 ||
      !env.ASTRA_PUBLIC_ORIGIN ||
      req.headers.origin !== env.ASTRA_PUBLIC_ORIGIN) return false;

  let path;
  try { path = new URL(req.url, 'http://localhost').pathname; }
  catch { return false; }
  if (path !== '/browser/ws') return false;
  const cookie = (req.headers.cookie || '').split(';').map(s => s.trim())
    .find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  const match = cookie?.match(/^(\d{13})\.([0-9a-f-]{36})\.([0-9a-f]{64})$/);
  if (!match) return false;
  const expires = Number(match[1]);
  if (!Number.isSafeInteger(expires) || expires < now || expires > now + MAX_SESSION_MS) return false;
  const expected = createHmac('sha256', env.ASTRA_SESSION_SECRET)
    .update(match[1] + '.' + match[2]).digest('hex');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(match[3]));
}

export function parseCommand(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 12_000) throw new Error('Message exceeds the size limit.');
  let input;
  try { input = JSON.parse(raw); } catch { throw new Error('Invalid JSON.'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid command.');
  if (input.type === 'send_prompt') {
    if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 8000)
      throw new Error('Prompt must be between 1 and 8000 characters.');
    return { type: 'send_prompt', prompt: input.prompt.trim() };
  }
  if (input.type === 'click' || input.type === 'move') {
    if (!Number.isFinite(input.x) || !Number.isFinite(input.y) ||
      input.x < 0 || input.x > 1 || input.y < 0 || input.y > 1)
      throw new Error('Coordinates must be normalized.');
    return { type: input.type, x: input.x, y: input.y };
  }
  if (input.type === 'scroll') {
    if (!Number.isFinite(input.deltaX) || !Number.isFinite(input.deltaY) ||
      Math.abs(input.deltaX) > 1600 || Math.abs(input.deltaY) > 1600)
      throw new Error('Invalid scroll offset.');
    return { type: 'scroll', deltaX: input.deltaX, deltaY: input.deltaY };
  }
  if (input.type === 'key') {
    if (typeof input.key !== 'string' || !/^[\w+ -]{1,45}$/.test(input.key))
      throw new Error('Invalid key.');
    return { type: 'key', key: input.key };
  }
  if (input.type === 'text') {
    if (typeof input.text !== 'string' || !input.text || input.text.length > 2000)
      throw new Error('Text must be between 1 and 2000 characters.');
    return { type: 'text', text: input.text };
  }
  if (input.type === 'refresh') return { type: 'refresh' };
  throw new Error('Unknown command.');
}
