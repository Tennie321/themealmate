import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNewsRss, parseForecast, citedSources } from '../src/lib/signal-search.server.ts';
import { accessSetupError, denyIfPrivate } from '../src/lib/private-access.server.ts';
import kalshi from '../src/lib/kalshi-server.mjs';

test('RSS parsing limits sources to search URLs and decodes headlines', () => {
  const xml='<rss><item><title>Price &amp; wages</title><link>https://news.google.com/rss/articles/123</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item><item><title>Unsafe</title><link>javascript:alert(1)</link></item></rss>';
  const sources=parseNewsRss(xml); assert.equal(sources.length,1); assert.equal(sources[0].title,'Price & wages'); assert.match(sources[0].snippet,/Headline only/);
});
test('forecast validates probability and source citations', () => {
  let p=parseForecast('{"probability_yes":0.7,"probability_low":0.5,"probability_high":0.8,"analysis":"Evidence [1]"}'); assert.equal(p.probability_yes,.7); assert.equal(p.probability_low,.5);
  assert.equal(parseForecast('{"probability_yes":0.7,"probability_low":0.9,"probability_high":1}').probability_low,null); assert.equal(parseForecast('not json').probability_yes,null);
  assert.deepEqual(citedSources('Evidence [2] and [99]',[{id:1,title:'A',url:'https://a.example',snippet:''},{id:2,title:'B',url:'https://b.example',snippet:''}]).map(x=>x.id),[2]);
});
test('AI access fails closed without server access secrets', async () => {
  const previous={...process.env}; try {process.env.LOVABLE_API_KEY='test-only'; delete process.env.ASTRA_ACCESS_CODE;delete process.env.ASTRA_SESSION_SECRET;assert.match(accessSetupError(),/ASTRA_ACCESS_CODE/);assert.equal((await denyIfPrivate(new Request('https://example.test/api/research'))).status,503);} finally {process.env=previous;}
});
test('Kalshi proxy rejects bad ticker without contacting network', async () => {
  let response=await kalshi.fetch(new Request('https://example.test/api/market?ticker=%2Fbad')); assert.equal(response.status,400);
});

test('headline-only research never becomes a ranked edge', async () => {
  const { readFileSync } = await import('node:fs'); const vm = await import('node:vm');
  const html=readFileSync(new URL('../public/desk.html',import.meta.url),'utf8');
  const code=html.match(/function takerFee\([\s\S]*?function addText/)?.[0].replace(/function addText$/, '');
  assert.ok(code); const ctx={Date,Number,Math,URL}; vm.createContext(ctx); vm.runInContext(code,ctx);
  const d={fresh:true,market:{status:'active'},quoteTime:new Date().toISOString(),depth:{yes_ask:.42,yes_size:10,no_ask:.6,no_size:10},fee:{multiplier:1},probability_yes:.70,review:{probability_yes:.65,annotations:[{url:'https://example.com'}]},annotations:[{url:'https://example.com'}]};
  assert.ok(Math.abs(ctx.conservativeEdge(d).edge-.2129)<1e-9); assert.ok(Math.abs(ctx.tradeMetrics(d).cost-.4371)<1e-9);
  d.evidenceQuality='headline_only'; assert.equal(ctx.conservativeEdge(d).edge,-Infinity);
});
