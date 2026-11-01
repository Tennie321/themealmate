import { safeSource, type ResearchSource } from './research-types.ts';

function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&#(x[\da-f]+|\d+);/gi, (_, n: string) => {
    const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : parseInt(n, 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }).replace(/&(?:amp|lt|gt|quot|apos);/g, match => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[match] || match);
}
export function parseNewsRss(xml: string): ResearchSource[] {
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
  const tag = (item: string, name: string) => decodeXml(item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '').replace(/<[^>]*>/g, '').trim();
  return items.slice(0, 15).map((item, index) => {
    const url = tag(item, 'link');
    try { if (new URL(url).hostname !== 'news.google.com') return null; } catch { return null; }
    return safeSource({ title: tag(item, 'title'), url, snippet: 'Headline only; the full article was not retrieved.', date: tag(item, 'pubDate') }, index);
  }).filter((source): source is ResearchSource => source !== null);
}
export async function searchSources(query: string, key?: string): Promise<{ sources: ResearchSource[]; provider: string }> {
  if (key) {
    const response = await fetch('https://api.perplexity.ai/search', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, max_results: 8, max_tokens_per_page: 1100 }), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('The configured live search service failed.');
    const data = await response.json() as { results?: unknown[] };
    const sources = (Array.isArray(data.results) ? data.results : []).map(safeSource).filter((x): x is ResearchSource => x !== null).slice(0, 8).map((x, i) => ({ ...x, id: i + 1 }));
    return { sources, provider: 'Perplexity Search excerpts' };
  }
  const url = new URL('https://news.google.com/rss/search');
  url.searchParams.set('q', query); url.searchParams.set('hl', 'en-US'); url.searchParams.set('gl', 'US'); url.searchParams.set('ceid', 'US:en');
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/rss+xml, application/xml' } });
  if (!response.ok) throw new Error('Live news search is unavailable.');
  return { sources: parseNewsRss(await response.text()).slice(0, 8).map((x, i) => ({ ...x, id: i + 1 })), provider: 'Google News RSS headlines only' };
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
