import { createFileRoute } from '@tanstack/react-router';
import { accessSetupError } from '../lib/private-access.server';

export const Route = createFileRoute('/api/capabilities')({
  server: {
    handlers: {
      GET: async () => Response.json({
        ai: Boolean(process.env.LOVABLE_API_KEY && !accessSetupError()),
        research: Boolean(process.env.PERPLEXITY_API_KEY && process.env.LOVABLE_API_KEY && !accessSetupError()),
        persistentMissions: false,
        backgroundExecution: false,
        oauthConnectors: false,
        computerUse: false,
      }, { headers: { 'Cache-Control': 'no-store' } }),
    },
  },
});
