import { createFileRoute } from '@tanstack/react-router';
import { aiSetupStatus } from '../lib/ai-setup.server';

export const Route = createFileRoute('/api/capabilities')({
  server: {
    handlers: {
      GET: async () => Response.json({
        ...aiSetupStatus(),
        persistentMissions: false,
        backgroundExecution: false,
        oauthConnectors: false,
        computerUse: false,
      }, { headers: { 'Cache-Control': 'no-store' } }),
    },
  },
});
