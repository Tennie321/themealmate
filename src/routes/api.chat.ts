import { createFileRoute } from '@tanstack/react-router';
import { denyIfPrivate } from '../lib/private-access.server';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';
import { DEFAULT_MODEL, MODELS, isModelId } from '../lib/models';
import { denyAIUnitBudget, readValidatedBody } from '../lib/request-safety.server';

type ChatRole = 'user' | 'assistant';
type ChatTurn = { role: ChatRole; content: string };
type ChatMode = 'chat' | 'research' | 'agent';

// Best-effort abuse brake per server instance. A production public release needs
// authenticated users and a shared persistent rate limiter / quota.
const limits = new Map<string, { count: number; premiumCount: number; resetAt: number }>();
const HOUR = 60 * 60 * 1000;

const prompts: Record<ChatMode, string> = {
  chat: 'You are Astra, a highly capable mobile AI assistant. Be accurate, clear, direct and helpful. Use formatting when it improves readability. Be honest about uncertainty. Do not imply you browsed the web, accessed personal data, or completed an external action unless actual tools were provided and used. No tools are connected to this conversation.',
  research: 'You are Astra in RESEARCH PLANNING mode. IMPORTANT: you have NO live web search or external source access. You may develop investigative questions, research hypotheses, search strings, source checklists, methodologies and frameworks using prior knowledge. Explicitly label factual claims that require live verification, never fabricate citations, and NEVER claim that research was performed or a source was opened. Start with a brief note that live research is not connected.',
  agent: 'You are Astra in AGENT PLANNING mode. NO external tools, connectors, browser, computer control or workflows are connected. You can decompose goals into executable steps, distinguish assumptions from confirmed facts, and propose exactly what access is needed. NEVER say you took an action or executed a step. The user must approve any future external side effect. Present an actionable plan, not fictional run logs.',
};

function rateLimit(request: Request, premium: boolean): Response | null {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  // Bound memory growth on long-lived worker instances.
  if (limits.size > 3000) for (const [key, entry] of limits) if (entry.resetAt <= now) limits.delete(key);
  const current = limits.get(ip);
  const next = current && current.resetAt > now ? current : { count: 0, premiumCount: 0, resetAt: now + HOUR };
  if (next.count >= 20 || (premium && next.premiumCount >= 5)) {
    return Response.json({ error: 'Hourly usage limit reached. Try again later or choose a standard model.' }, { status: 429, headers: { 'Cache-Control': 'no-store' } });
  }
  next.count += 1;
  if (premium) next.premiumCount += 1;
  limits.set(ip, next);
  return null;
}

async function handleChat(request: Request): Promise<Response> {
  const denied = await denyIfPrivate(request);
  if (denied) return denied;
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  }
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'Lovable AI is not configured for this deployment. Enable the built-in AI connector and project Cloud key in Lovable.' }, { status: 503 });
  }
  let raw: unknown;
  try { raw = await readValidatedBody(request, 48_000); }
  catch { return Response.json({ error: 'Invalid or oversized conversation.' }, { status: 400 }); }
  if (!raw || typeof raw !== 'object') return Response.json({ error: 'Invalid conversation.' }, { status: 400 });
  const input = raw as { model?: unknown; messages?: unknown; mode?: unknown };
  if (input.model !== undefined && !isModelId(input.model)) {
    return Response.json({ error: 'Unsupported AI model.' }, { status: 400 });
  }
  const model = isModelId(input.model) ? input.model : DEFAULT_MODEL;
  const mode: ChatMode = input.mode === 'agent' || input.mode === 'research' ? input.mode : 'chat';
  if (!Array.isArray(input.messages) || input.messages.length === 0 || input.messages.length > 20) {
    return Response.json({ error: 'Please provide up to 20 messages.' }, { status: 400 });
  }
  let totalCharacters = 0;
  const messages: ChatTurn[] = [];
  for (const entry of input.messages) {
    if (!entry || typeof entry !== 'object' || !('role' in entry) || !('content' in entry)) {
      return Response.json({ error: 'Invalid message format.' }, { status: 400 });
    }
    const { role, content } = entry as ChatTurn;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || content.length > 8000) {
      return Response.json({ error: 'Unsupported message content.' }, { status: 400 });
    }
    const text = content.trim();
    totalCharacters += text.length;
    if (text) messages.push({ role, content: text });
  }
  if (totalCharacters > 30_000 || messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return Response.json({ error: 'Conversation is too large or has no new user message.' }, { status: 400 });
  }
  const tier = MODELS.find((m) => m.id === model)?.tier;
  const blocked = rateLimit(request, tier === 'Premium');
  if (blocked) return blocked;
  const budgetDenied = denyAIUnitBudget(tier === 'Premium' ? 3 : 1);
  if (budgetDenied) return budgetDenied;

  try {
    const gateway = createOpenAICompatible({
      name: 'lovable',
      baseURL: 'https://ai.gateway.lovable.dev/v1',
      apiKey,
      headers: {
        'Lovable-API-Key': apiKey,
        'X-Lovable-AIG-SDK': 'vercel-ai-sdk',
      },
    });
    let providerError: unknown = null;
    const result = streamText({
      model: gateway.chatModel(model),
      system: prompts[mode],
      messages,
      maxOutputTokens: tier === 'Premium' ? 1800 : 2400,
      abortSignal: request.signal,
      onError: ({ error }) => {
        providerError = error;
        console.error('Lovable AI request failed', error);
      },
    });

    // Check that the provider can actually start responding BEFORE returning
    // HTTP 200. Otherwise a rejected gateway key/model looks like an empty reply.
    const iterator = result.textStream[Symbol.asyncIterator]();
    let first: IteratorResult<string>;
    try {
      first = await iterator.next();
    } catch (error) {
      console.error('Lovable AI could not start streaming', error);
      return Response.json({ error: 'AI gateway rejected the request. Check Lovable AI availability, model access, and usage credits.' }, { status: 502 });
    }
    if (first.done || providerError) {
      return Response.json({ error: 'AI gateway returned no answer. Check Lovable AI configuration, model access, and usage credits.' }, { status: 502 });
    }

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(first.value));
        void (async () => {
          try {
            for (;;) {
              const part = await iterator.next();
              if (part.done) break;
              controller.enqueue(encoder.encode(part.value));
            }
            if (providerError) controller.error(new Error('AI gateway stopped responding.'));
            else controller.close();
          } catch (error) {
            console.error('Lovable AI stream interrupted', error);
            controller.error(error);
          }
        })();
      },
      cancel() { void iterator.return?.(); },
    });
    return new Response(body, { headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    console.error('Could not start AI stream', error);
    return Response.json({ error: 'Could not start an AI request. Check the model and Lovable AI usage balance.' }, { status: 502 });
  }
}

export const Route = createFileRoute('/api/chat')({
  server: { handlers: { POST: async ({ request }) => handleChat(request) } },
});
