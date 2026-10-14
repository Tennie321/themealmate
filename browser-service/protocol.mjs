import { createHmac, timingSafeEqual } from 'node:crypto';

export const MAX_PROMPT_LENGTH = 10_000;
export function verifyTicket(ticket, secret, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 32 || typeof ticket !== 'string') return null;
  const m = /^v1\.(\d{13})\.([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(ticket);
  if (!m) return null;
  const expires = Number(m[1]);
  if (!Number.isSafeInteger(expires) || expires < now || expires > now + 60_000) return null;
  const expected = createHmac('sha256', secret).update('v1.' + m[1] + '.' + m[2]).digest();
  const actual = Buffer.from(m[3], 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? { nonce: m[2], expires } : null;
}
export function isAllowedOrigin(origin, allowed) { return Boolean(origin && allowed && origin === allowed); }
export function parseAction(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 16_384) throw new Error('Message too large.');
  let m;
  try { m = JSON.parse(raw); } catch { throw new Error('Invalid JSON.'); }
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('Invalid action.');
  if (m.type === 'click' || m.type === 'move') {
    if (![m.x, m.y].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 5000)) throw new Error('Invalid coordinates.');
    return { type: m.type, x: m.x, y: m.y };
  }
  if (m.type === 'scroll') {
    if (![m.deltaX, m.deltaY].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1500)) throw new Error('Invalid scroll.');
    return { type: m.type, deltaX: m.deltaX, deltaY: m.deltaY };
  }
  if (m.type === 'type') {
    if (typeof m.text !== 'string' || !m.text || m.text.length > 2000) throw new Error('Invalid text.');
    return { type: m.type, text: m.text };
  }
  if (m.type === 'key') {
    if (!['Enter','Tab','Escape','Backspace','Delete','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown','Space','ControlOrMeta+A','ControlOrMeta+C','ControlOrMeta+V'].includes(m.key)) throw new Error('Unsupported key.');
    return { type: m.type, key: m.key };
  }
  if (m.type === 'run_prompt') {
    if (typeof m.prompt !== 'string' || !m.prompt.trim() || m.prompt.length > MAX_PROMPT_LENGTH) throw new Error('Prompt must be 1–10,000 characters.');
    if (typeof m.requestId !== 'string' || !/^[\w-]{1,64}$/.test(m.requestId)) throw new Error('Invalid request ID.');
    return { type: m.type, prompt: m.prompt.trim(), requestId: m.requestId };
  }
  if (m.type === 'cancel') return { type: 'cancel' };
  throw new Error('Unsupported action.');
}
