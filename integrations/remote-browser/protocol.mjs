import { createHash, timingSafeEqual } from 'node:crypto';
export const VIEWPORT = Object.freeze({ width: 1200, height: 800 });
export const MAX_PROMPT_LENGTH = 8000;
export function safeTokenEqual(candidate, secret) {
  if (typeof candidate !== 'string' || typeof secret !== 'string' || !secret || candidate.length > 512) return false;
  return timingSafeEqual(createHash('sha256').update(candidate).digest(), createHash('sha256').update(secret).digest());
}
export function originAllowed(origin, configured) {
  return typeof origin === 'string' && !!origin && typeof configured === 'string' && configured.split(',').map(x => x.trim()).includes(origin);
}
export function validProfileId(id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(id); }
export function isChatGPTURL(input) {
  try { const url = new URL(input); return url.protocol === 'https:' && ['chatgpt.com','www.chatgpt.com'].includes(url.hostname); }
  catch { return false; }
}
export function parseMessage(raw) {
  let value;
  try { value = JSON.parse(String(raw)); } catch { throw new Error('Invalid JSON message.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.type !== 'string') throw new Error('Invalid action.');
  switch (value.type) {
    case 'auth':
      if (typeof value.token !== 'string' || value.token.length > 512) throw new Error('Invalid access token.');
      return { type: 'auth', token: value.token };
    case 'open':
      if (!validProfileId(value.profileId)) throw new Error('Invalid browser profile ID.');
      return { type: 'open', profileId: value.profileId };
    case 'navigate':
      if (!isChatGPTURL(value.url)) throw new Error('Navigation is restricted to chatgpt.com.');
      return { type: 'navigate', url: value.url };
    case 'click':
    case 'move':
      if (!Number.isFinite(value.x) || !Number.isFinite(value.y) || value.x < 0 || value.x > 1 || value.y < 0 || value.y > 1) throw new Error('Invalid pointer position.');
      if (value.type === 'click' && value.button !== undefined && !['left','right'].includes(value.button)) throw new Error('Invalid mouse button.');
      return { type: value.type, x: value.x, y: value.y, button: value.button || 'left' };
    case 'wheel':
      if (!Number.isFinite(value.deltaX) || !Number.isFinite(value.deltaY) || Math.abs(value.deltaX) > 1000 || Math.abs(value.deltaY) > 1000) throw new Error('Invalid scroll offset.');
      return { type: 'wheel', deltaX: value.deltaX, deltaY: value.deltaY };
    case 'key':
      if (typeof value.key !== 'string' || !/^[A-Za-z0-9+_-]{1,64}$/.test(value.key)) throw new Error('Invalid key.');
      return { type: 'key', key: value.key };
    case 'type':
      if (typeof value.text !== 'string' || !value.text.length || value.text.length > 2048) throw new Error('Invalid typing input.');
      return { type: 'type', text: value.text };
    case 'prompt':
      if (typeof value.text !== 'string' || !value.text.trim() || value.text.length > MAX_PROMPT_LENGTH) throw new Error('Enter a prompt of 1–8000 characters.');
      return { type: 'prompt', text: value.text.trim() };
    case 'back': case 'reload': case 'cancel': return { type: value.type };
    default: throw new Error('Unknown browser action.');
  }
}
