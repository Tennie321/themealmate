import test from 'node:test';
import assert from 'node:assert/strict';
import { issueBrowserTicket } from '../src/lib/browser-ticket.server.ts';
import { verifyTicket } from '../services/remote-browser/src/auth.mjs';

const secret = 'example-only-long-secret-not-for-production-123456';

test('app ticket can authenticate to the browser container', async () => {
  const now = Date.now();
  const token = await issueBrowserTicket(secret, now);
  assert.equal(verifyTicket(token, secret, now + 1000)?.sub, 'private-owner');
  assert.equal(verifyTicket(token, secret, now + 61_000), null);
});
test('modified and incorrect-signature grants are rejected', async () => {
  const token = await issueBrowserTicket(secret);
  assert.equal(verifyTicket(token, 'another-super-long-key-12345678901234567890'), null);
  assert.equal(verifyTicket(token.slice(0, -2) + 'xx', secret), null);
  assert.equal(verifyTicket('', secret), null);
  assert.equal(verifyTicket(token, 'short'), null);
});
