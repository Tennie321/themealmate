import { createFileRoute } from '@tanstack/react-router';
import { accessSetupError, isAccessGranted, privateBetaEnabled } from '../lib/private-access.server';
import { denyExpensiveRequest } from '../lib/request-safety.server';

/** The browser worker is a distinct deployment. Never give it the beta cookie. */
async function ticket(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') !== origin) {
    return Response.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  if (!privateBetaEnabled() || accessSetupError()) {
    return Response.json({ error: 'Private access must be configured for remote browser control.' }, { status: 503 });
  }
  if (!await isAccessGranted(request)) {
    return Response.json({ error: 'Unlock Astra first.' }, { status: 401 });
  }
  const limited = denyExpensiveRequest(request, 'browser-ticket', 120);
  if (limited) return limited;

  const secret = process.env.ASTRA_SESSION_SECRET;
  const configuredURL = process.env.BROWSER_BRIDGE_WS_URL;
  if (!secret || secret.length < 32 || !configuredURL) {
    return Response.json({ error: 'The remote browser worker is not configured.' }, { status: 503 });
  }
  let endpoint: URL;
  try {
    endpoint = new URL(configuredURL);
    const local = ['localhost', '127.0.0.1'].includes(endpoint.hostname);
    if (!((endpoint.protocol === 'wss:') || (local && endpoint.protocol === 'ws:')) ||
        endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
        endpoint.pathname !== '/v1/control') throw new Error('Invalid worker endpoint');
  } catch {
    return Response.json({ error: 'The remote browser worker endpoint is invalid.' }, { status: 503 });
  }
  const payload = Buffer.from(JSON.stringify({
    aud: 'astra-browser-v1', sub: 'owner', origin,
    exp: Date.now() + 90_000, nonce: crypto.randomUUID(),
  })).toString('base64url');
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))).toString('base64url');
  return Response.json({ url: endpoint.toString(), ticket: payload + '.' + signature }, {
    headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' },
  });
}
export const Route = createFileRoute('/api/browser/ticket')({
  server: { handlers: { POST: async ({ request }) => ticket(request) } },
});
