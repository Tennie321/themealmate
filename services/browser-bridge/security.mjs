import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';

export const MAX_PROMPT = 5000;
export const VIEWPORT = { width: 1280, height: 800 };

export function verifyTicket(ticket, { secret, origin, now = Date.now() }) {
  if (typeof ticket !== 'string' || ticket.length > 2000) throw new Error('Invalid ticket');
  const match = /^([A-Za-z0-9_-]{20,1200})\.([A-Za-z0-9_-]{43})$/.exec(ticket);
  if (!match || typeof secret !== 'string' || secret.length < 32) throw new Error('Invalid ticket');
  const signature = createHmac('sha256', secret).update(match[1]).digest();
  const received = Buffer.from(match[2], 'base64url');
  if (received.length !== signature.length || !timingSafeEqual(signature, received)) throw new Error('Invalid ticket');
  let payload;
  try { payload = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')); }
  catch { throw new Error('Invalid ticket'); }
  if (!payload || payload.aud !== 'astra-browser-v1' ||
      payload.origin !== origin || payload.sub !== 'owner' ||
      typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp) ||
      payload.exp < now || payload.exp > now + 90_000 ||
      typeof payload.nonce !== 'string' || !/^[0-9a-f-]{36}$/.test(payload.nonce)) {
    throw new Error('Invalid or expired ticket');
  }
  return payload.sub;
}

export function profilePath(root, subject) {
  if (!subject || typeof subject !== 'string' || subject.length > 128) throw new Error('Invalid owner');
  return join(root, createHash('sha256').update(subject).digest('hex'));
}

export function parseMessage(input) {
  if (typeof input !== 'string' || input.length > 12_000) throw new Error('Invalid message');
  let message;
  try { message = JSON.parse(input); } catch { throw new Error('Invalid JSON'); }
  if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid message');
  if (message.type === 'prompt') {
    if (typeof message.text !== 'string' || !message.text.trim() ||
        message.text.length > MAX_PROMPT) throw new Error('Prompt must be 1–5000 characters');
    return { type: 'prompt', text: message.text.trim() };
  }
  if (message.type === 'cancel') return { type: 'cancel' };
  if (message.type === 'pointer') {
    if (!['move', 'down', 'up', 'click'].includes(message.action) ||
        !Number.isInteger(message.x) || !Number.isInteger(message.y) ||
        message.x < 0 || message.x >= VIEWPORT.width ||
        message.y < 0 || message.y >= VIEWPORT.height) throw new Error('Invalid pointer event');
    return { type: 'pointer', action: message.action, x: message.x, y: message.y };
  }
  if (message.type === 'wheel') {
    if (!Number.isFinite(message.dx) || !Number.isFinite(message.dy) ||
        Math.abs(message.dx) > 1200 || Math.abs(message.dy) > 1200) throw new Error('Invalid scroll');
    return { type: 'wheel', dx: message.dx, dy: message.dy };
  }
  if (message.type === 'key') {
    if (!['down', 'up'].includes(message.action) || typeof message.key !== 'string' ||
        message.key.length > 32 || !/^[\x20-\x7E]+$/.test(message.key)) throw new Error('Invalid key');
    return { type: 'key', action: message.action, key: message.key };
  }
  if (message.type === 'type') {
    if (typeof message.text !== 'string' || message.text.length < 1 ||
        message.text.length > 2000) throw new Error('Invalid text');
    return { type: 'type', text: message.text };
  }
  throw new Error('Unknown action');
}
