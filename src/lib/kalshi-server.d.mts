type Market = Record<string, unknown> & { ticker: string; event_ticker?: string };
type Snapshot = { market: Market; depth: unknown; fee: unknown; quoteTime: string; fresh: boolean };
declare const handler: { fetch(request: Request): Promise<Response> };
export function contractContext(market: Market): Promise<unknown>;
export function executionSnapshot(market: Market): Promise<Snapshot>;
export default handler;
