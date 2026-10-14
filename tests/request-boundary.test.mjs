import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readValidatedBody } from '../src/lib/request-safety.server.ts';

const url = 'https://astra.example/api/chat';
const post = (body) => new Request(url, { method: 'POST', body });

test('accepts valid JSON at its exact UTF-8 byte limit', async () => {
  const value = { message: 'é'.repeat(12) };
  const body = JSON.stringify(value);
  assert.deepEqual(await readValidatedBody(post(body), Buffer.byteLength(body)), value);
  await assert.rejects(readValidatedBody(post(body), Buffer.byteLength(body) - 1), /too large/);
});

test('rejects oversized chunked bodies without buffering the rest', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(256))); },
    cancel() { cancelled = true; },
  });
  const request = new Request(url, { method: 'POST', body: stream, duplex: 'half' });
  await assert.rejects(readValidatedBody(request, 64), /too large/);
  assert.equal(cancelled, true);
});

test('rejects invalid UTF-8 and invalid JSON', async () => {
  await assert.rejects(readValidatedBody(post(new Uint8Array([0xff, 0xfe]))), /UTF-8/);
  await assert.rejects(readValidatedBody(post('{broken')), /Invalid JSON/);
});

test('rejects a declared oversized request before reading', async () => {
  const request = new Request(url, {
    method: 'POST', headers: { 'content-length': '9999' }, body: '{}',
  });
  await assert.rejects(readValidatedBody(request, 32), /too large/);
});
