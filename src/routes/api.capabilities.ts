import { createFileRoute } from '@tanstack/react-router';
import { getCapabilityReadiness } from '../lib/private-access.server';

export const Route = createFileRoute('/api/capabilities')({
  server: {
    handlers: {
      GET: async () => Response.json(getCapabilityReadiness(), {
        headers: { 'Cache-Control': 'no-store' },
      }),
    },
  },
});
