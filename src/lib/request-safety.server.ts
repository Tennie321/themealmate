// Small first-line defense, NOT production multi-instance rate limiting.
// Never treat the browser-provided IP header as trustworthy authentication.
const requests = new Map<string, { count: number; expires: number }>();
const WINDOW = 60 * 60 * 1000;
export function denyExpensiveRequest(request: Request, scope: string, maximum: number): Response | null {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  }
  const trustedIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown';
  const key = scope + ':' + trustedIp;
  const now = Date.now();
  if (requests.size > 3000) {
    for (const [id, value] of requests) if (value.expires < now) requests.delete(id);
  }
  const previous = requests.get(key);
  const current = previous && previous.expires > now ? previous : { count: 0, expires: now + WINDOW };
  if (current.count >= maximum) {
    return Response.json({ error: 'Usage limit reached. Try again later.' }, { status: 429 });
  }
  current.count++;
  requests.set(key, current);
  return null;
}
/** Bound memory before parsing even when Content-Length is absent or wrong. */
export async function readValidatedBody(request: Request, maxBytes = 12_000): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid request size limit.');
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > maxBytes)) {
    throw new Error('Request is too large.');
  }
  if (!request.body) throw new Error('Invalid JSON request.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new Error('Request is too large.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body: string;
  try { body = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('Invalid UTF-8 request.'); }
  try { return JSON.parse(body) as unknown; }
  catch { throw new Error('Invalid JSON request.'); }
}

/**
 * Conservative, deployment-instance-wide AI request fuse, shared by all routes.
 * Units are NOT currency or token accounting. This does not provide a durable,
 * distributed spending cap; multi-instance deployments need a shared quota store.
 * Failed or aborted upstream calls still consume a unit reservation.
 */
const AI_HOUR = 60 * 60 * 1000;
let aiBudget = { used: 0, resetAt: 0 };
export function denyAIUnitBudget(units: number): Response | null {
  const limit = Number(process.env.ASTRA_AI_HOURLY_UNITS ?? '40');
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    return Response.json({ error: 'AI request budget is misconfigured.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!Number.isInteger(units) || units < 1 || units > 10) throw new Error('Invalid AI budget units.');
  const now = Date.now();
  if (now >= aiBudget.resetAt) aiBudget = { used: 0, resetAt: now + AI_HOUR };
  if (aiBudget.used + units > limit) {
    return Response.json({ error: 'This server has reached its hourly AI request budget. Try again later.' }, {
      status: 429,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': String(Math.max(1, Math.ceil((aiBudget.resetAt - now) / 1000))) },
    });
  }
  aiBudget.used += units;
  return null;
}
