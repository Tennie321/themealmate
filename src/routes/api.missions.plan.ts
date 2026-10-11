import { createFileRoute } from '@tanstack/react-router';
import { createMissionPlan } from '../lib/mission-plan.server';
import { DEFAULT_MODEL, isModelId } from '../lib/models';
import { denyExpensiveRequest, readValidatedBody } from '../lib/request-safety.server';

async function handle(request: Request): Promise<Response> {
  if (!process.env.LOVABLE_API_KEY) return Response.json({ error: 'Lovable AI has not been configured.' }, { status: 503 });
  const rejected = denyExpensiveRequest(request, 'plan', 10);
  if (rejected) return rejected;
  let raw: unknown;
  try { raw = await readValidatedBody(request, 4000); }
  catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
  const body = raw as { goal?: unknown; model?: unknown } | null;
  if (!body || typeof body.goal !== 'string' || body.goal.trim().length < 8 || body.goal.length > 1500) {
    return Response.json({ error: 'Describe a goal between 8 and 1500 characters.' }, { status: 400 });
  }
  if (body.model !== undefined && !isModelId(body.model)) return Response.json({ error: 'Unsupported model.' }, { status: 400 });
  try {
    const steps = await createMissionPlan(body.goal.trim(), isModelId(body.model) ? body.model : DEFAULT_MODEL);
    return Response.json({ steps }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Unable to create mission plan', error);
    return Response.json({ error: 'Mission planning failed. Check the AI model and try again.' }, { status: 502 });
  }
}
export const Route = createFileRoute('/api/missions/plan')({ server: { handlers: { POST: async ({ request }) => handle(request) } } });
