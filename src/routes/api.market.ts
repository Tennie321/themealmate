import { createFileRoute } from '@tanstack/react-router';
import kalshi from '../lib/kalshi-server.mjs';
export const Route = createFileRoute('/api/market')({ server: { handlers: { GET: ({ request }) => kalshi.fetch(request) } } });
