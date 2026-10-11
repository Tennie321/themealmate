import { createFileRoute } from '@tanstack/react-router';
import { accessSetupError, checkAccessCode, createAccessCookie, privateBetaEnabled } from '../lib/private-access.server';
import { denyExpensiveRequest, readValidatedBody } from '../lib/request-safety.server';
export const Route = createFileRoute('/api/access/login')({
  server: { handlers: {
    POST: async ({ request }) => {
      if (!privateBetaEnabled()) return Response.json({ error: 'Private access is not enabled.' }, { status: 409 });
      if (accessSetupError()) return Response.json({ error: 'Private beta is incorrectly configured.' }, { status: 503 });
      const rejected = denyExpensiveRequest(request, 'beta-login', 6);
      if (rejected) return rejected;
      let raw: unknown;
      try { raw = await readValidatedBody(request, 1500); }
      catch { return Response.json({ error: 'Invalid login request.' }, { status: 400 }); }
      const input = raw as { code?: unknown } | null;
      if (!input || typeof input.code !== 'string' || input.code.length > 512 || !await checkAccessCode(input.code)) {
        return Response.json({ error: 'Incorrect access code.' }, { status: 401 });
      }
      return Response.json({ ok: true }, { headers: { 'Set-Cookie': await createAccessCookie(request), 'Cache-Control': 'no-store' } });
    },
  } },
});
