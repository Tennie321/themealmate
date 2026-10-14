import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { verifyTicket } from '../src/auth.mjs';

const secret = 'local-test-secret-not-for-production-123456';
const issue = (payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
};
test('accepts a valid, short-lived ticket', () => {
  const now = Date.now();
  const ticket = issue({ aud: 'astra-remote-browser', sub: 'private-owner', exp: now + 30_000, nonce: randomUUID() });
  assert.equal(verifyTicket(ticket, secret, now)?.sub, 'private-owner');
});
test('rejects expired, modified and wrong-audience tickets', () => {
  const now = Date.now();
  const valid = { aud: 'astra-remote-browser', sub: 'private-owner', exp: now + 30_000, nonce: randomUUID() };
  const ticket = issue(valid);
  assert.equal(verifyTicket(ticket, secret, now + 31_000), null);
  assert.equal(verifyTicket(issue({ ...valid, aud: 'other' }), secret, now), null);
  assert.equal(verifyTicket(ticket + 'garbage', secret, now), null);
  assert.equal(verifyTicket(ticket, 'wrong-key-but-sufficiently-long-for-test', now), null);
});
