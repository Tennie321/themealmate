/**
 * Read-only SEC EDGAR data adapter. Server-side use only.
 * Configure ASTRA_SEC_USER_AGENT with a descriptive app name and contact address.
 * This module never sends requests until a caller explicitly invokes a function.
 */
const SEC_ORIGIN = 'https://data.sec.gov'
const CIK_PATTERN = /^\d{1,10}$/
export type SecEvidence = {
  provider: 'sec-edgar'
  url: string
  retrievedAt: string
  cik: string
}
export type SecCompanyProfile = SecEvidence & {
  name: string
  tickers: string[]
  exchanges: string[]
  recentFilings: Array<{ form: string; accession: string; filed: string }>
}
export type SecFact = SecEvidence & {
  concept: string
  label: string
  unit: string
  value: number
  start?: string
  end: string
  filed: string
  form: string
  accession: string
  fiscalYear?: number
  fiscalPeriod?: string
}
export function normalizeCik(cik: string | number): string {
  const raw = String(cik).trim()
  if (!CIK_PATTERN.test(raw)) throw new Error('CIK must contain 1–10 digits')
  return raw.padStart(10, '0')
}
export type SecClientOptions = {
  userAgent: string
  fetcher?: typeof fetch
  timeoutMs?: number
}
export function createSecEdgarClient(options: SecClientOptions) {
  const userAgent = options.userAgent.trim()
  if (!userAgent || !/[^\s@]+@[^\s@]+\.[^\s@]+/.test(userAgent)) {
    throw new Error('SEC User-Agent must include a contact email')
  }
  const fetcher = options.fetcher ?? fetch
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 8000, 1000), 20000)
  async function readJson(path: string): Promise<{ data: any; url: string; retrievedAt: string }> {
    const url = SEC_ORIGIN + path
    const response = await fetcher(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    })
    if (!response.ok) throw new Error('SEC EDGAR request failed (HTTP ' + response.status + ')')
    const length = Number(response.headers.get('content-length'))
    if (Number.isFinite(length) && length > 15_000_000) throw new Error('SEC response too large')
    const reader = response.body?.getReader()
    if (!reader) throw new Error('SEC response has no body')
    const chunks: Uint8Array[] = []
    let total = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > 15_000_000) throw new Error('SEC response too large')
        chunks.push(value)
      }
    } catch (error) {
      await reader.cancel().catch(() => {})
      throw error
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { data: JSON.parse(body), url, retrievedAt: new Date().toISOString() }
  }
  return {
    async submissions(cikInput: string | number): Promise<SecCompanyProfile> {
      const cik = normalizeCik(cikInput)
      const { data, url, retrievedAt } = await readJson('/submissions/CIK' + cik + '.json')
      const recent = data?.filings?.recent ?? {}
      const forms = Array.isArray(recent.form) ? recent.form : []
      return {
        provider: 'sec-edgar', cik, url, retrievedAt,
        name: String(data.name ?? ''),
        tickers: Array.isArray(data.tickers) ? data.tickers.map(String) : [],
        exchanges: Array.isArray(data.exchanges) ? data.exchanges.map(String) : [],
        recentFilings: forms.slice(0, 100).map((form: unknown, i: number) => ({
          form: String(form),
          accession: String(recent.accessionNumber?.[i] ?? ''),
          filed: String(recent.filingDate?.[i] ?? ''),
        })),
      }
    },
    async companyFacts(cikInput: string | number, concepts: string[] = [
      'Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax',
      'NetIncomeLoss', 'Assets', 'Liabilities', 'StockholdersEquity',
      'CashAndCashEquivalentsAtCarryingValue',
    ]): Promise<SecFact[]> {
      const cik = normalizeCik(cikInput)
      const { data, url, retrievedAt } = await readJson('/api/xbrl/companyfacts/CIK' + cik + '.json')
      const facts: SecFact[] = []
      for (const concept of concepts) {
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(concept)) throw new Error('Invalid SEC concept')
        const entry = data?.facts?.['us-gaap']?.[concept]
        if (!entry?.units || typeof entry.units !== 'object') continue
        for (const [unit, observations] of Object.entries(entry.units)) {
          if (!Array.isArray(observations)) continue
          for (const item of observations) {
            if (!item || !Number.isFinite(item.val) || typeof item.end !== 'string') continue
            facts.push({
              provider: 'sec-edgar', cik, url, retrievedAt, concept,
              label: String(entry.label ?? concept), unit, value: item.val,
              start: item.start, end: item.end, filed: String(item.filed ?? ''),
              form: String(item.form ?? ''), accession: String(item.accn ?? ''),
              fiscalYear: item.fy, fiscalPeriod: item.fp,
            })
          }
        }
      }
      return facts
    },
  }
}
