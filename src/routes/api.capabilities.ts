import { createFileRoute } from '@tanstack/react-router';
import { accessSetupError } from '../lib/private-access.server';
import { resolveCapabilities } from '../lib/capabilities';

export const Route = createFileRoute('/api/capabilities')({
  server: {
    handlers: {
      GET: async () => Response.json(resolveCapabilities({
        aiKeyPresent: Boolean(process.env.LOVABLE_API_KEY?.trim()),
        searchKeyPresent: Boolean(process.env.PERPLEXITY_API_KEY?.trim()),
        accessReady: !accessSetupError(),
      }), { headers: { 'Cache-Control': 'no-store' } }),
    },
  },
});
