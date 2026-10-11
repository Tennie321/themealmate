export type ResearchSource = { id: number; title: string; url: string; snippet: string; publishedAt?: string };
export type ResearchResult = { answer: string; sources: ResearchSource[]; researchedAt: string; provider: string; query: string };
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
