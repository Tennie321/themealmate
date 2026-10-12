export type ResearchSource = { id: number; title: string; url: string; snippet: string; publishedAt?: string };
export type ResearchResult = { answer: string; sources: ResearchSource[]; citationAudit: CitationAudit; researchedAt: string; provider: string; query: string };
export function safeSource(value: unknown, index: number): ResearchSource | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.url !== 'string') return null;
  try {
    const url = new URL(item.url);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    return {
      id: index + 1,
      title: typeof item.title === 'string' ? item.title.slice(0, 180) : url.hostname,
      url: url.toString(),
      snippet: typeof item.snippet === 'string' ? item.snippet.slice(0, 1250) : '',
      publishedAt: typeof item.date === 'string' ? item.date.slice(0, 32) : undefined,
    };
  } catch { return null; }
}

/**
 * Check model-generated numeric citations against the actual search response.
 * This checks reference existence only, not whether an excerpt proves a claim.
 * Never treat model-provided URLs or citation numbers as independent evidence.
 */
export type CitationAudit = {
  citedSourceIds: number[];
  unsupportedSourceIds: number[];
  status: 'linked' | 'partial' | 'unlinked';
};

export function auditResearchCitations(answer: string, sources: ResearchSource[]): { answer: string; audit: CitationAudit } {
  const allowed = new Set(sources.map(source => source.id));
  const cited = new Set<number>();
  const unsupported = new Set<number>();
  const cleaned = answer.replace(/\[\s*(\d+(?:\s*[,;]\s*\d+)*)\s*\]/g, (_match, values: string) => {
    const ids = values.split(/[,;]/).map(value => Number(value.trim()));
    for (const id of ids) {
      if (allowed.has(id)) cited.add(id);
      else unsupported.add(id);
    }
    // A mixed citation must never be presented as wholly supported.
    return ids.map(id => allowed.has(id) ? `[${id}]` : '[source unavailable]').join(' ');
  });
  const citedSourceIds = [...cited].sort((a, b) => a - b);
  const unsupportedSourceIds = [...unsupported].sort((a, b) => a - b);
  return {
    answer: cleaned,
    audit: {
      citedSourceIds,
      unsupportedSourceIds,
      status: unsupportedSourceIds.length ? 'partial' : citedSourceIds.length ? 'linked' : 'unlinked',
    },
  };
}
