import test from 'node:test'
import assert from 'node:assert/strict'
import { createSecEdgarClient, normalizeCik } from '../src/server/research/sec-edgar.ts'

test('normalizes CIK and rejects unsafe identifiers', () => {
  assert.equal(normalizeCik('320193'), '0000320193')
  assert.throws(() => normalizeCik('../320193'), /CIK/)
})
test('requires identifiable SEC User-Agent', () => {
  assert.throws(() => createSecEdgarClient({ userAgent: 'Astra' }), /contact email/)
})
test('parses SEC submissions with provenance', async () => {
  const client = createSecEdgarClient({
    userAgent: 'Astra Research dev@example.org',
    fetcher: async (url) => {
      assert.equal(url, 'https://data.sec.gov/submissions/CIK0000320193.json')
      return new Response(JSON.stringify({
        name: 'Apple Inc.', tickers: ['AAPL'], exchanges: ['Nasdaq'],
        filings: { recent: { form: ['10-K'], accessionNumber: ['0000320193-25-000001'], filingDate: ['2025-01-01'] } },
      }), { status: 200 })
    },
  })
  const result = await client.submissions('320193')
  assert.equal(result.tickers[0], 'AAPL')
  assert.equal(result.recentFilings[0].form, '10-K')
  assert.match(result.url, /data.sec.gov/)
})
test('extracts XBRL values without fabricating missing concepts', async () => {
  const client = createSecEdgarClient({
    userAgent: 'Astra Research dev@example.org',
    fetcher: async () => new Response(JSON.stringify({
      facts: { 'us-gaap': { NetIncomeLoss: { label: 'Net Income', units: { USD: [
        { val: 100, end: '2025-09-30', filed: '2025-11-01', form: '10-K', accn: '123' },
      ] } } } },
    }), { status: 200 }),
  })
  const facts = await client.companyFacts('320193', ['NetIncomeLoss', 'Assets'])
  assert.equal(facts.length, 1)
  assert.equal(facts[0].value, 100)
  assert.equal(facts[0].accession, '123')
})
