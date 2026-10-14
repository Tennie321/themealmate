import { createHmac, randomUUID } from 'node:crypto';

export function browserAvailable() {
  return Boolean((process.env.ASTRA_BROWSER_SECRET || '').length >= 32);
}

export function issueBrowserTicket(now = Date.now()): string {
  const secret = process.env.ASTRA_BROWSER_SECRET || '';
  if (secret.length < 32) throw new Error('Remote browser shared secret is missing.');
  const payload = Buffer.from(JSON.stringify({
    scope: 'astra-remote-browser',
    exp: now + 60_000,
    nonce: randomUUID(),
  })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return payload + '.' + signature;
}

export function browserSocketURL(request: Request): string {
  const configured = process.env.ASTRA_BROWSER_PUBLIC_WS_URL?.trim();
  const url = configured
    ? new URL(configured)
    : new URL('/remote-browser/ws', request.url.replace(/^http/, 'ws'));
  if (!['wss:', 'ws:'].includes(url.protocol) ||
    (url.protocol === 'ws:' && !['localhost', '127.0.0.1'].includes(url.hostname)) ||
    url.username || url.password || url.search || url.hash ||
    url.pathname !== '/remote-browser/ws') {
    throw new Error('Remote browser WebSocket URL must be secure and end with /remote-browser/ws.');
  }
  return url.toString();
}
