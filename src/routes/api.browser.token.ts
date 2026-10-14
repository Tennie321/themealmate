import { createFileRoute } from '@tanstack/react-router';
import { createBrowserToken } from '../../integrations/remote-browser/token.mjs';
import { accessSetupError, isAccessGranted, privateBetaEnabled } from '../lib/private-access.server';

const headers = { 'Cache-Control': 'no-store', 'Vary': 'Cookie' };
export const Route = createFileRoute('/api/browser/token')({
  server: { handlers: {
    GET: async ({ request }) => {
      // Browser access always requires a configured private gate, even when
      // the regular (non-billable) Astra UI is usable without credentials.
      if (!privateBetaEnabled() || accessSetupError()) {
        return Response.json({ error: 'Configure Astra private access before enabling remote browser control.' }, { status: 503, headers });
      }
      if (!await isAccessGranted(request)) {
        return Response.json({ error: 'Unlock Astra before connecting the browser.' }, { status: 401, headers });
      }
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) {
        return Response.json({ error: 'Invalid request origin.' }, { status: 403, headers });
      }
      const secret = process.env.BROWSER_BRIDGE_SECRET;
      if (!secret || secret.length < 32) {
        return Response.json({ error: 'Remote browser service is not configured.' }, { status: 503, headers });
      }
      const cookie = request.headers.get('cookie')?.split(';').map(value => value.trim())
        .find(value => value.startsWith('astra_beta_session='))?.slice('astra_beta_session='.length);
      if (!cookie) return Response.json({ error: 'Missing private session.' }, { status: 401, headers });
      return Response.json({ token: createBrowserToken(cookie, secret), expiresInSeconds: 90 }, { headers });
    },
  } },
});
