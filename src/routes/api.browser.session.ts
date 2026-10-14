import { createFileRoute } from '@tanstack/react-router';
import { issueBrowserTicket } from '../lib/browser-ticket.server';
import { accessSetupError, denyIfPrivate, privateBetaEnabled } from '../lib/private-access.server';
import { denyExpensiveRequest } from '../lib/request-safety.server';

async function startSession(request: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  // Public/local builds with no access gate must not expose a remote browser.
  if (!privateBetaEnabled() || accessSetupError()) {
    return Response.json({ error: 'Configure private access before enabling browser control.' }, { status: 503, headers });
  }
  const denied = await denyIfPrivate(request);
  if (denied) return denied;
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'Same-origin access required.' }, { status: 403, headers });
  }
  const limited = denyExpensiveRequest(request, 'browser-session-ticket', 60);
  if (limited) return limited;
  const secret = process.env.ASTRA_BROWSER_SHARED_SECRET || '';
  const target = process.env.ASTRA_BROWSER_PUBLIC_WS_URL || '';
  let wsUrl: URL;
  try {
    wsUrl = new URL(target);
    if (
      (wsUrl.protocol !== 'wss:' && !(wsUrl.protocol === 'ws:' && ['localhost', '127.0.0.1'].includes(wsUrl.hostname))) ||
      wsUrl.username || wsUrl.password || wsUrl.search || wsUrl.hash
    ) throw new Error('Invalid browser websocket URL');
  } catch {
    return Response.json({ error: 'Browser service URL is not configured.' }, { status: 503, headers });
  }
  if (secret.length < 32) {
    return Response.json({ error: 'Browser service signing secret is missing.' }, { status: 503, headers });
  }
  const ticket = await issueBrowserTicket(secret);
  return Response.json({ websocketUrl: wsUrl.toString(), ticket }, { headers });
}

export const Route = createFileRoute('/api/browser/session')({
  server: { handlers: { POST: async ({ request }) => startSession(request) } },
});
