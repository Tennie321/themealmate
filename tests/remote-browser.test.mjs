import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import { verifyTicket } from '../integrations/remote-browser/auth.mjs';
import { issueBrowserTicket, browserSocketURL, browserAvailable } from '../src/lib/browser-ticket.server.ts';

const previous = process.env.ASTRA_BROWSER_SECRET;
const secret = 'test-secret-0123456789-abcdefghijklmnop';
function makeTicket(payload) {
  const value = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return value + '.' + createHmac('sha256', secret).update(value).digest('base64url');
}
test('browser tickets are signed, scoped and short-lived', () => {
  process.env.ASTRA_BROWSER_SECRET = secret;
  const now = Date.now();
  const ticket = issueBrowserTicket(now);
  const payload = verifyTicket(ticket, secret, now);
  assert.equal(payload.scope, 'astra-remote-browser');
  assert.ok(payload.exp - now <= 60_000);
  assert.equal(verifyTicket(ticket, 'another-secret-0123456789-abcdefghijklmnop', now), null);
  assert.equal(verifyTicket(ticket + 'a', secret, now), null);
  assert.equal(verifyTicket(ticket, secret, now + 61_000), null);
  assert.equal(verifyTicket(makeTicket({ scope: 'wrong', nonce: randomUUID(), exp: now + 1000 }), secret, now), null);
  assert.equal(verifyTicket(makeTicket({ scope: 'astra-remote-browser', nonce: randomUUID(), exp: now + 90_000 }), secret, now), null);
});
test('socket URL rejects insecure and credential-bearing endpoints', () => {
  process.env.ASTRA_BROWSER_SECRET = secret;
  assert.equal(browserAvailable(), true);
  const req = new Request('https://astra.example/api/browser/ticket');
  delete process.env.ASTRA_BROWSER_PUBLIC_WS_URL;
  assert.equal(browserSocketURL(req), 'wss://astra.example/remote-browser/ws');
  process.env.ASTRA_BROWSER_PUBLIC_WS_URL = 'wss://remote.example/remote-browser/ws';
  assert.equal(browserSocketURL(req), 'wss://remote.example/remote-browser/ws');
  for (const bad of ['ws://remote.example/remote-browser/ws', 'wss://user:pw@remote.example/remote-browser/ws', 'wss://remote.example/other']) {
    process.env.ASTRA_BROWSER_PUBLIC_WS_URL = bad;
    assert.throws(() => browserSocketURL(req));
  }
  delete process.env.ASTRA_BROWSER_PUBLIC_WS_URL;
});
test('missing shared secret disables browser feature', () => {
  delete process.env.ASTRA_BROWSER_SECRET;
  assert.equal(browserAvailable(), false);
  assert.throws(() => issueBrowserTicket(), /missing/);
  if (previous === undefined) delete process.env.ASTRA_BROWSER_SECRET;
  else process.env.ASTRA_BROWSER_SECRET = previous;
});
