import { createFileRoute } from '@tanstack/react-router';
import { isAccessGranted } from '../lib/private-access.server';

const encoder = new TextEncoder();

async function issueBrowserTicket(request: Request): Promise<Response> {
  const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') !== origin) {
    return Response.json({ error: 'Same-origin access only.' }, { status: 403, headers: noStore });
  }
  // This sidecar exposes a signed-in browser: NEVER inherit the permissive
  // unconfigured-AI fallback from denyIfPrivate.
  const configured = (process.env.ASTRA_ACCESS_CODE || '').length >= 12 &&
    (process.env.ASTRA_SESSION_SECRET || '').length >= 32;
  if (!configured) {
    return Response.json({ error: 'Set Astra private beta access credentials before enabling browser control.' }, { status: 503, headers: noStore });
  }
  if (!await isAccessGranted(request)) {
    return Response.json({ error: 'Unlock Astra before connecting to the browser.' }, { status: 401, headers: noStore });
  }
  const secret = process.env.ASTRA_BROWSER_TOKEN_SECRET || '';
  const publicURL = process.env.ASTRA_BROWSER_PUBLIC_WS_URL || '';
  if (secret.length < 32 || !publicURL) {
    return Response.json({ error: 'Browser sidecar is not configured on the server.' }, { status: 503, headers: noStore });
  }
  let endpoint: URL;
  try { endpoint = new URL(publicURL); }
  catch { return Response.json({ error: 'Invalid browser endpoint.' }, { status: 503, headers: noStore }); }
  const local = endpoint.hostname === 'localhost' || endpoint.hostname === '127.0.0.1';
  if ((endpoint.protocol !== 'wss:' && !(local && origin.startsWith('http://') && endpoint.protocol === 'ws:')) ||
    endpoint.pathname !== '/socket' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    return Response.json({ error: 'Browser endpoint must be a secure wss:// URL ending in /socket.' }, { status: 503, headers: noStore });
  }
  const payload = { aud: 'astra-browser-v1', sub: 'owner', origin, exp: Date.now() + 45_000, nonce: crypto.randomUUID() };
  const body = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  const hex = Array.from(signature).map(value => value.toString(16).padStart(2, '0')).join('');
  return Response.json({ wsUrl: endpoint.toString(), ticket: body + '.' + hex }, { headers: noStore });
}
export const Route = createFileRoute('/api/browser/ticket')({
  server: { handlers: { POST: ({ request }) => issueBrowserTicket(request) } },
});
