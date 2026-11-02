import { safeSource, type ResearchSource } from './research-types.ts';

function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&#(x[\da-f]+|\d+);/gi, (_, n: string) => {
    const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : parseInt(n, 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }).replace(/&(?:amp|lt|gt|quot|apos);/g, match => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[match] || match);
}
export function parseNewsRss(xml: string, feed: 'google' | 'bing' = 'google'): ResearchSource[] {
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
  const tag = (item: string, name: string) => decodeXml(item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '').replace(/<[^>]*>/g, '').trim();
  return items.slice(0, 15).map((item, index) => {
    let url = tag(item, 'link');
    try {
      const parsed = new URL(url);
      if (feed === 'google' ? parsed.hostname !== 'news.google.com' : !['bing.com', 'www.bing.com'].includes(parsed.hostname)) return null;
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
      if (feed === 'bing') parsed.protocol = 'https:';
      url = parsed.toString();
    } catch { return null; }
    return safeSource({ title: tag(item, 'title'), url, snippet: 'Headline only; the full article was not retrieved.', date: tag(item, 'pubDate') }, index);
  }).filter((source): source is ResearchSource => source !== null);
}
export type SearchAttempt = { provider: string; outcome: 'ok' | 'empty' | 'http_error' | 'network_error' | 'invalid_feed'; status?: number; count: number };
export type SearchResult = { sources: ResearchSource[]; provider: string; attempts: SearchAttempt[] };

/** Search terms should describe the underlying event, not repeat the whole contract. */
export function researchQueries(parts: Array<string | undefined | null>): string[] {
  const cleaned = parts.map(part => (part || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const primary = cleaned[0] || '';
  const shorter = primary.replace(/^(will|does|is|are|how much|how many)\s+/i, '').replace(/[?!.]+$/g, '').trim();
  return [...new Set([primary, shorter, cleaned[1]].filter((q): q is string => typeof q === 'string' && q.length >= 4))].slice(0, 2);
}

export async function searchSources(query: string | string[], key?: string): Promise<SearchResult> {
  const queries = (Array.isArray(query) ? query : [query]).map(q => q.trim()).filter(Boolean).slice(0, 2);
  const attempts: SearchAttempt[] = [];
  if (key) {
    try {
    const response = await fetch('https://api.perplexity.ai/search', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queries[0], max_results: 8, max_tokens_per_page: 1100 }), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) attempts.push({ provider: 'Perplexity', outcome: 'http_error', status: response.status, count: 0 });
    else {
      const data = await response.json() as { results?: unknown[] };
      const sources = (Array.isArray(data.results) ? data.results : []).map(safeSource).filter((x): x is ResearchSource => x !== null).slice(0, 8).map((x, i) => ({ ...x, id: i + 1 }));
      attempts.push({ provider: 'Perplexity', outcome: sources.length ? 'ok' : 'empty', count: sources.length });
      if (sources.length) return { sources, provider: 'Perplexity Search excerpts', attempts };
    }
    } catch { attempts.push({ provider: 'Perplexity', outcome: 'network_error', count: 0 }); }
  }
  const jobs = queries.flatMap((q, index) => {
    const google = new URL('https://news.google.com/rss/search');
    google.searchParams.set('q', q); google.searchParams.set('hl', 'en-US'); google.searchParams.set('gl', 'US'); google.searchParams.set('ceid', 'US:en');
    const bing = new URL('https://www.bing.com/news/search');
    bing.searchParams.set('q', q); bing.searchParams.set('format', 'rss');
    return [{ url: google, feed: 'google' as const, provider: 'Google News RSS headlines only', label: `Google News ${index + 1}` }, { url: bing, feed: 'bing' as const, provider: 'Bing News RSS headlines only', label: `Bing News ${index + 1}` }];
  });
  const results = await Promise.all(jobs.map(async ({ url, feed, provider, label }) => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/rss+xml, application/xml' } });
      if (!response.ok) return { sources: [], provider, attempt: { provider: label, outcome: 'http_error' as const, status: response.status, count: 0 } };
      const body = await response.text();
      const sources = parseNewsRss(body, feed).slice(0, 8);
      const outcome: SearchAttempt['outcome'] = sources.length ? 'ok' : /<item(?:\s|>)/i.test(body) ? 'invalid_feed' : 'empty';
      return { sources, provider, attempt: { provider: label, outcome, count: sources.length } };
    } catch { return { sources: [], provider, attempt: { provider: label, outcome: 'network_error' as const, count: 0 } }; }
  }));
  attempts.push(...results.map(x => x.attempt));
  const found = results.find(x => x.sources.length);
  return found ? { sources: found.sources.map((x, i) => ({ ...x, id: i + 1 })), provider: found.provider, attempts } : { sources: [], provider: 'Unavailable: no live sources retrieved', attempts };

}
export function parseForecast(text: string): { probability_yes: number | null; probability_low: number | null; probability_high: number | null; analysis: string } {
  try {
    const parsed = JSON.parse(text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')) as Record<string, unknown>;
    const number = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1 ? x : null;
    const p = number(parsed.probability_yes), lo = number(parsed.probability_low), hi = number(parsed.probability_high);
    const rangeValid = p !== null && lo !== null && hi !== null && lo <= p && p <= hi;
    return { probability_yes: p, probability_low: rangeValid ? lo : null, probability_high: rangeValid ? hi : null, analysis: typeof parsed.analysis === 'string' ? parsed.analysis.slice(0, 20000) : '' };
  } catch { return { probability_yes: null, probability_low: null, probability_high: null, analysis: text.slice(0, 20000) }; }
}
export function citedSources(text: string, sources: ResearchSource[]) {
  const ids = new Set(Array.from(text.matchAll(/\[(\d{1,3})\]/g), m => Number(m[1])));
  return sources.filter(source => ids.has(source.id)).map(source => ({ id: source.id, title: source.title, url: source.url }));
}

/** Headlines alone cannot support a numerical forecast. */
export function gateForecast<T extends { probability_yes: number | null; probability_low: number | null; probability_high: number | null }>(forecast: T, sufficientExcerpts: boolean): T {
  return sufficientExcerpts ? forecast : { ...forecast, probability_yes: null, probability_low: null, probability_high: null };
}
