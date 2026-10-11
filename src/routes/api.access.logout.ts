import { createFileRoute } from '@tanstack/react-router';
import { clearAccessCookie } from '../lib/private-access.server';
export const Route = createFileRoute('/api/access/logout')({
  server: { handlers: {
    POST: async ({ request }) => {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'Cross-origin request forbidden.' }, { status: 403 });
      return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearAccessCookie(request), 'Cache-Control': 'no-store' } });
    },
  } },
});
