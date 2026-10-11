import { createFileRoute } from '@tanstack/react-router';
import { accessSetupError, isAccessGranted, privateBetaEnabled } from '../lib/private-access.server';
export const Route = createFileRoute('/api/access/status')({
  server: { handlers: {
    GET: async ({ request }) => Response.json({
      protected: privateBetaEnabled(),
      authenticated: await isAccessGranted(request),
      misconfigured: Boolean(accessSetupError()),
    }, { headers: { 'Cache-Control': 'no-store' } }),
  } },
});
