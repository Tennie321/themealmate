import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNewsRss, parseForecast, citedSources, gateForecast, searchSources, researchQueries } from '../src/lib/signal-search.server.ts';
import kalshi from '../src/lib/kalshi-server.mjs';
import { parseFredCpiCsv, cpiOfficialEvidence } from '../src/lib/official-evidence.server.ts';

test('official CPI history supplies cited observations but no forecast', async () => {
  const rows=['observation_date,CPIAUCSL'];
  for(let month=1;month<=13;month++) rows.push(`${2025+Math.floor((month-1)/12)}-${String((month-1)%12+1).padStart(2,'0')}-01,${100+month}`);
  const source=parseFredCpiCsv(rows.join('\n')+'\n');
  assert.equal(source?.url,'https://fred.stlouisfed.org/series/CPIAUCSL');
  assert.match(source.snippet,/2026-01: 113\.000/);
  assert.match(source.snippet,/historical observations, not an October forecast/);
  assert.equal(parseFredCpiCsv('not csv'),null);
  assert.equal(await cpiOfficialEvidence({ticker:'KXBTC-26NOV02',title:'Bitcoin price'}),null);
  const originalFetch=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response(rows.join('\n')+'\n');
    const result=await cpiOfficialEvidence({ticker:'KXCPI-26OCT-T0.5',title:'Will CPI rise?'});
    assert.equal(result?.attempt.outcome,'ok');
    assert.ok(result?.source);
  } finally { globalThis.fetch=originalFetch; }
});

test('RSS parsing limits sources to search URLs and decodes headlines', () => {
  const xml='<rss><item><title>Price &amp; wages</title><link>https://news.google.com/rss/articles/123</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item><item><title>Unsafe</title><link>javascript:alert(1)</link></item></rss>';
  const sources=parseNewsRss(xml); assert.equal(sources.length,1); assert.equal(sources[0].title,'Price & wages'); assert.match(sources[0].snippet,/Headline only/);
});
test('news lookup falls back to Bing headlines without treating them as excerpts', async () => {
  const originalFetch=globalThis.fetch;
  try {
    globalThis.fetch=async url => String(url).includes('news.google.com') ? new Response('',{status:503}) : new Response('<rss><item><title>CPI rises</title><link>http://www.bing.com/news/apiclick.aspx?url=test</link><description>Some text</description></item></rss>');
    const result=await searchSources('CPI');
    assert.equal(result.provider,'Bing News RSS headlines only');
    assert.equal(result.sources.length,1);
    assert.match(result.sources[0].snippet,/Headline only/);
    assert.match(result.sources[0].url,/^https:\/\/www\.bing\.com\//);
    assert.equal(result.attempts.find(x => x.provider === 'Google News 1').status,503);
    assert.deepEqual(parseNewsRss('<item><title>bad</title><link>https://evil.test/</link></item>','bing'),[]);
  } finally { globalThis.fetch=originalFetch; }
});
test('market-specific search gets a shorter second query and records empty feeds', async () => {
  assert.deepEqual(researchQueries(['Will CPI rise more than 1.0% in October 2026?', 'CPI in October']), ['Will CPI rise more than 1.0% in October 2026?', 'CPI rise more than 1.0% in October 2026']);
  const originalFetch=globalThis.fetch;
  try {
    globalThis.fetch=async url => new URL(String(url)).searchParams.get('q')?.startsWith('CPI rise') && String(url).includes('google') ? new Response('<rss><item><title>CPI data</title><link>https://news.google.com/rss/articles/test</link></item></rss>') : new Response('<rss></rss>');
    const result=await searchSources(researchQueries(['Will CPI rise more than 1.0% in October 2026?']));
    assert.equal(result.sources.length,1);
    assert.equal(result.attempts.length,4);
    assert.equal(result.attempts[0].outcome,'empty');
    assert.equal(result.attempts[2].outcome,'ok');
  } finally { globalThis.fetch=originalFetch; }
});
test('unavailable source providers return an explicitly empty result', async () => {
  const originalFetch=globalThis.fetch;
  try {
    globalThis.fetch=async () => new Response('',{status:503});
    const result=await searchSources('CPI');
    assert.equal(result.provider,'Unavailable: no live sources retrieved');
    assert.equal(result.sources.length,0);
  } finally { globalThis.fetch=originalFetch; }
});
test('forecast validates probability and source citations', () => {
  let p=parseForecast('{"probability_yes":0.7,"probability_low":0.5,"probability_high":0.8,"analysis":"Evidence [1]"}'); assert.equal(p.probability_yes,.7); assert.equal(p.probability_low,.5);
  assert.equal(parseForecast('{"probability_yes":0.7,"probability_low":0.9,"probability_high":1}').probability_low,null); assert.equal(parseForecast('not json').probability_yes,null);
  assert.deepEqual(citedSources('Evidence [2] and [99]',[{id:1,title:'A',url:'https://a.example',snippet:''},{id:2,title:'B',url:'https://b.example',snippet:''}]).map(x=>x.id),[2]);
});
test('headline-only evidence cannot produce numerical forecasts', () => {
  const forecast={probability_yes:.7,probability_low:.5,probability_high:.8,analysis:'Brief'};
  assert.deepEqual(gateForecast(forecast,false),{...forecast,probability_yes:null,probability_low:null,probability_high:null});
  assert.equal(gateForecast(forecast,true).probability_yes,.7);
});
test('Kalshi proxy rejects bad ticker without contacting network', async () => {
  let response=await kalshi.fetch(new Request('https://example.test/api/market?ticker=%2Fbad')); assert.equal(response.status,400);
});

test('headline-only research never becomes a ranked edge', async () => {
  const { readFileSync } = await import('node:fs'); const vm = await import('node:vm');
  const html=readFileSync(new URL('../public/desk.html',import.meta.url),'utf8');
  const code=html.match(/function takerFee\([\s\S]*?function addText/)?.[0].replace(/function addText$/, '');
  assert.ok(code); const ctx={Date,Number,Math,URL}; vm.createContext(ctx); vm.runInContext(code,ctx);
  const d={fresh:true,market:{status:'active',market_type:'binary'},evidenceQuality:'excerpts',sources:[{id:1,url:'https://example.com',note:'x'.repeat(80)}],quoteTime:new Date().toISOString(),depth:{yes_ask:.42,yes_size:10,no_ask:.6,no_size:10},fee:{multiplier:1},probability_yes:.70,review:{probability_yes:.65,annotations:[{id:1,url:'https://example.com'}]},annotations:[{id:1,url:'https://example.com'}]};
  assert.ok(Math.abs(ctx.conservativeEdge(d).edge-.2129)<1e-9); assert.ok(Math.abs(ctx.tradeMetrics(d).cost-.4371)<1e-9);
  d.sources[0].note='short'; assert.equal(ctx.conservativeEdge(d).edge,-Infinity); d.sources[0].note='x'.repeat(80); d.market.market_type='scalar'; assert.equal(ctx.conservativeEdge(d).edge,-Infinity); d.market.market_type='binary'; d.evidenceQuality='headline_only'; assert.equal(ctx.conservativeEdge(d).edge,-Infinity); assert.ok(Math.abs(ctx.takerFee(.5,{multiplier:1})-.0175)<1e-9); assert.ok(Math.abs(ctx.takerFee(.25,{multiplier:.5})-.0066)<1e-9);
});
