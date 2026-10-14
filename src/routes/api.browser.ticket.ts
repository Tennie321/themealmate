import { createFileRoute } from '@tanstack/react-router';
import { accessSetupError, isAccessGranted, privateBetaEnabled } from '../lib/private-access.server';
import { denyExpensiveRequest } from '../lib/request-safety.server';
import { issueTicket, validSecret } from '../../browser/token.mjs';

export const Route = createFileRoute('/api/browser/ticket')({
  server: { handlers: {
    POST: async ({ request }) => {
      const headers = { 'Cache-Control': 'no-store' };
      // Browser control is never allowed under Astra's unprotected dev-mode gate.
      if (!privateBetaEnabled() || accessSetupError() || !validSecret(process.env.ASTRA_BROWSER_SECRET)) {
        return Response.json({ error: 'Remote browser is unavailable. Configure private access and ASTRA_BROWSER_SECRET.' }, { status: 503, headers });
      }
      const origin = request.headers.get('origin');
      if (origin !== new URL(request.url).origin) {
        return Response.json({ error: 'Cross-origin request denied.' }, { status: 403, headers });
      }
      if (!await isAccessGranted(request)) {
        return Response.json({ error: 'Unlock Astra to control the browser.' }, { status: 401, headers });
      }
      const denied = denyExpensiveRequest(request, 'browser-ticket', 90);
      if (denied) return denied;
      return Response.json({ ticket: issueTicket(process.env.ASTRA_BROWSER_SECRET) }, { headers });
    },
  } },
});
