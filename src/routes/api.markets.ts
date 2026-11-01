import { createFileRoute } from '@tanstack/react-router';
import kalshi from '../lib/kalshi-server.mjs';
export const Route = createFileRoute('/api/markets')({ server: { handlers: { GET: ({ request }) => kalshi.fetch(request) } } });
