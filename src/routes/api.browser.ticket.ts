import { createFileRoute } from '@tanstack/react-router';
import { accessSetupError, isAccessGranted, privateBetaEnabled } from '../lib/private-access.server';
import { browserAvailable, browserSocketURL, issueBrowserTicket } from '../lib/browser-ticket.server';

export const Route = createFileRoute('/api/browser/ticket')({
  server: { handlers: {
    POST: async ({ request }) => {
      const origin = new URL(request.url).origin;
      if (request.headers.get('origin') !== origin) {
        return Response.json({ error: 'Cross-site browser access denied.' }, { status: 403 });
      }
      // Browser control must never fall back to the public/non-billable UI gate.
      if (!privateBetaEnabled() || accessSetupError() || !await isAccessGranted(request)) {
        return Response.json({ error: 'Unlock the configured private beta to use browser control.' }, { status: 401 });
      }
      if (!browserAvailable()) {
        return Response.json({ error: 'Remote browser is not configured on this deployment.' }, { status: 503 });
      }
      try {
        return Response.json({ url: browserSocketURL(request), ticket: issueBrowserTicket() },
          { headers: { 'Cache-Control': 'no-store' } });
      } catch {
        return Response.json({ error: 'Remote browser WebSocket address is misconfigured.' }, { status: 503 });
      }
    },
  } },
});
