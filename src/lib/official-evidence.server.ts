import { safeSource, type ResearchSource } from './research-types.ts';
import type { SearchAttempt } from './signal-search.server.ts';

const CPI_CSV = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL';
const CPI_PAGE = 'https://fred.stlouisfed.org/series/CPIAUCSL';

/** FRED republishes BLS's seasonally adjusted CPI index. A change in this series is context, not a forecast. */
export function parseFredCpiCsv(csv: string): ResearchSource | null {
  if (!csv.startsWith('observation_date,CPIAUCSL\n') || csv.length > 500_000) return null;
  const rows = csv.trim().split(/\r?\n/).slice(1).map(line => {
    const match = /^(\d{4})-(\d{2})-01,([0-9]+(?:\.[0-9]+)?)$/.exec(line.trim());
    return match ? { date: `${match[1]}-${match[2]}`, value: Number(match[3]) } : null;
  }).filter((row): row is { date: string; value: number } => !!row && Number.isFinite(row.value) && row.value > 0 && row.value < 10_000);
  if (rows.length < 13) return null;
  const changes: Array<{ date: string; percent: number }> = [];
  for (let i = 1; i < rows.length; i++) {
    const previous = rows[i - 1], current = rows[i];
    const gap = (Number(current.date.slice(0, 4)) - Number(previous.date.slice(0, 4))) * 12 + Number(current.date.slice(5)) - Number(previous.date.slice(5));
    if (gap === 1) changes.push({ date: current.date, percent: (current.value / previous.value - 1) * 100 });
  }
  if (changes.length < 12) return null;
  const latest = rows.at(-1)!;
  const recent = changes.slice(-12);
  const history = changes.slice(-120);
  const mean = history.reduce((total, row) => total + row.percent, 0) / history.length;
  const aboveHalf = history.filter(row => row.percent > 0.5).length;
  const snippet = `FRED CPIAUCSL (source: U.S. Bureau of Labor Statistics) is the seasonally adjusted all-items U.S. CPI index. Latest observation ${latest.date}: ${latest.value.toFixed(3)}. Latest 12 available month-over-month changes computed only from adjacent index months: ${recent.map(row => `${row.date} ${row.percent.toFixed(2)}%`).join('; ')}. Among the most recent ${history.length} available adjacent-month changes, mean ${mean.toFixed(2)}%; ${aboveHalf} exceeded 0.5% before rounding. Missing months are excluded. These are historical observations, not an October forecast or a calibrated probability. The contract's exact settlement series and rounding must be verified independently; CPIAUCSL may differ from the settlement measure.`;
  return safeSource({ title: 'FRED / BLS seasonally adjusted U.S. CPI history', url: CPI_PAGE, snippet, date: `${latest.date}-01` }, 0);
}

export async function cpiOfficialEvidence(market: { ticker?: unknown; title?: unknown }): Promise<{ source: ResearchSource | null; attempt: SearchAttempt } | null> {
  if (typeof market.ticker !== 'string' || !market.ticker.startsWith('KXCPI-') || typeof market.title !== 'string' || !/\bCPI\b/i.test(market.title)) return null;
  try {
    const response = await fetch(CPI_CSV, { signal: AbortSignal.timeout(8000), headers: { Accept: 'text/csv' } });
    if (!response.ok) return { source: null, attempt: { provider: 'FRED CPI history', outcome: 'http_error', status: response.status, count: 0 } };
    const source = parseFredCpiCsv(await response.text());
    return { source, attempt: { provider: 'FRED CPI history', outcome: source ? 'ok' : 'invalid_feed', count: source ? 1 : 0 } };
  } catch { return { source: null, attempt: { provider: 'FRED CPI history', outcome: 'network_error', count: 0 } }; }
}
