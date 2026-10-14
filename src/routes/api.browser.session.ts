import { createHmac } from 'node:crypto';
import { createFileRoute } from '@tanstack/react-router';
import { accessSetupError, denyIfPrivate } from '../lib/private-access.server';

/** Grants a short-lived, browser-only worker connection. Never exposes the shared secret. */
async function issueSession(request: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const denied = await denyIfPrivate(request);
  if (denied) return denied;
  // The remote browser is more privileged than AI chat: fail closed without the private gate.
  if (!process.env.ASTRA_ACCESS_CODE || !process.env.ASTRA_SESSION_SECRET || accessSetupError()) {
    return Response.json({ error: 'Private access must be configured before enabling browser control.' }, { status: 503, headers });
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: 'Cross-origin request denied.' }, { status: 403, headers });
  }
  const workerUrl = process.env.ASTRA_BROWSER_WS_URL;
  const secret = process.env.ASTRA_BROWSER_SHARED_SECRET;
  if (!workerUrl || !secret || secret.length < 32) {
    return Response.json({ error: 'Remote browser worker is not configured.' }, { status: 503, headers });
  }
  let wsUrl: URL;
  try {
    wsUrl = new URL(workerUrl);
    const localhost = ['localhost', '127.0.0.1'].includes(wsUrl.hostname);
    if (!(wsUrl.protocol === 'wss:' || (localhost && wsUrl.protocol === 'ws:')) || wsUrl.pathname !== '/ws' || wsUrl.username || wsUrl.password) throw Error();
  } catch {
    return Response.json({ error: 'Browser worker URL must be a secure wss:// address ending in /ws.' }, { status: 503, headers });
  }
  const cookie = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith('astra_beta_session='));
  if (!cookie) return Response.json({ error: 'Unlock Astra first.' }, { status: 401, headers });
  // One persistent disk profile per authenticated private-beta browser session.
  const sid = createHmac('sha256', secret).update(cookie).digest('hex').slice(0, 32);
  const body = Buffer.from(JSON.stringify({ sid, exp: Date.now() + 120_000, aud: 'astra-browser-v1' })).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return Response.json({ wsUrl: wsUrl.toString(), ticket: body + '.' + signature }, { headers });
}
export const Route = createFileRoute('/api/browser/session')({
  server: { handlers: { POST: async ({ request }) => issueSession(request) } },
});
