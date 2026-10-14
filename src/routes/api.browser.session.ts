import { createFileRoute } from '@tanstack/react-router';
import { denyIfPrivate } from '../lib/private-access.server';

async function getBrowserSession(request: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'Cross-origin access denied.' }, { status: 403, headers });
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return Response.json({ error: 'Cross-site access denied.' }, { status: 403, headers });
  // Remote control is privileged even if the Lovable AI API key is absent.
  if ((process.env.ASTRA_ACCESS_CODE || '').length < 12 || (process.env.ASTRA_SESSION_SECRET || '').length < 32) {
    return Response.json({ error: 'Private access must be configured to enable the browser.' }, { status: 503, headers });
  }
  const denied = await denyIfPrivate(request);
  if (denied) return denied;
  const secret = process.env.ASTRA_BROWSER_SHARED_SECRET || '';
  const publicUrl = process.env.ASTRA_BROWSER_WS_URL || '';
  if (secret.length < 32 || !publicUrl) return Response.json({ error: 'Remote browser is not configured.' }, { status: 503, headers });
  let url: URL;
  try { url = new URL(publicUrl); } catch { return Response.json({ error: 'Invalid remote browser URL.' }, { status: 503, headers }); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'wss:' && !(local && url.protocol === 'ws:')) || url.username || url.password || url.search || url.hash) {
    return Response.json({ error: 'Remote browser requires WSS (WS permitted on localhost only).' }, { status: 503, headers });
  }
  // App config supplies the websocket service base origin, not credentials.
  url.pathname = url.pathname.replace(/\/$/, '') + '/control';
  const expires = Date.now() + 45_000;
  const nonce = crypto.randomUUID();
  const message = 'v1.' + expires + '.' + nonce;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
  const signature = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  url.searchParams.set('ticket', message + '.' + signature);
  return Response.json({ url: url.toString(), expiresAt: expires }, { headers });
}

export const Route = createFileRoute('/api/browser/session')({
  server: { handlers: { GET: ({ request }) => getBrowserSession(request) } },
});
