import { createHash, timingSafeEqual } from 'node:crypto';

export const VIEWPORT = Object.freeze({ width: 1280, height: 800 });
const NAV_HOSTS = ['chatgpt.com', 'openai.com', 'accounts.google.com', 'appleid.apple.com', 'login.microsoftonline.com'];

export function isAllowedNavigation(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return NAV_HOSTS.some((host) => url.hostname === host || (host === 'openai.com' && url.hostname.endsWith('.openai.com')));
  } catch { return false; }
}

export function isPrivateHost(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return hostname === 'localhost' || hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') || hostname === '::1' || hostname.startsWith('fc') ||
      hostname.startsWith('fd') || hostname.startsWith('fe80:') ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  } catch { return true; }
}

export function allowedOrigin(origin, allowed) {
  if (!origin || !Array.isArray(allowed)) return false;
  try { return allowed.some((item) => item === new URL(origin).origin && item === origin); }
  catch { return false; }
}
export function equalSecret(received, expected) {
  if (typeof received !== 'string' || typeof expected !== 'string') return false;
  const a = createHash('sha256').update(received).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
const finite = (value, lo, hi) => typeof value === 'number' && Number.isFinite(value) && value >= lo && value <= hi;
export function parseCommand(raw) {
  if (raw.length > 16_384) throw new Error('Message too large');
  let data;
  try { data = JSON.parse(raw.toString()); } catch { throw new Error('Invalid JSON'); }
  if (!data || typeof data !== 'object') throw new Error('Invalid message');
  switch (data.type) {
    case 'auth':
      if (typeof data.token !== 'string' || data.token.length < 32 || data.token.length > 512) break;
      return { type: 'auth', token: data.token };
    case 'prompt':
      if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 8000) break;
      return { type: 'prompt', text: data.text.trim() };
    case 'pointer':
      if (!finite(data.x, 0, VIEWPORT.width) || !finite(data.y, 0, VIEWPORT.height)) break;
      if (data.action !== undefined && !['click', 'down', 'move', 'up'].includes(data.action)) break;
      return { type: 'pointer', action: data.action || 'click', x: Math.round(data.x), y: Math.round(data.y) };
    case 'wheel':
      if (!finite(data.dx, -1200, 1200) || !finite(data.dy, -1200, 1200)) break;
      return { type: 'wheel', dx: data.dx, dy: data.dy };
    case 'key':
      if (typeof data.key !== 'string' || !/^(?:Enter|Tab|Escape|Backspace|Delete|Home|End|Arrow(?:Up|Down|Left|Right)|(?:Control|Meta|Shift)\+A)$/.test(data.key)) break;
      return { type: 'key', key: data.key };
    case 'type':
      if (typeof data.text !== 'string' || !data.text || data.text.length > 2000) break;
      return { type: 'type', text: data.text };
    case 'cancel': case 'status':
      return { type: data.type };
  }
  throw new Error('Invalid command');
}
