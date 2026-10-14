import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { verifyTicket } from '../src/ticket.mjs';
const secret = 'a'.repeat(48);
const sid = 'b'.repeat(32);
const sign = (exp, id = sid) => {
  const body = Buffer.from(JSON.stringify({ sid: id, exp, aud: 'astra-browser-v1' })).toString('base64url');
  return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
};
test('signed browser tickets are scoped and expire quickly', () => {
  assert.equal(verifyTicket(sign(120_000), secret, 10_000), sid);
  assert.equal(verifyTicket(sign(120_000), secret, 120_000), null);
  assert.equal(verifyTicket(sign(500_000), secret, 10_000), null);
});
test('forged tickets and path-like profiles cannot authenticate', () => {
  assert.equal(verifyTicket(sign(120_000), 'x'.repeat(40), 10_000), null);
  assert.equal(verifyTicket(sign(120_000, '../escape'), secret, 10_000), null);
  assert.equal(verifyTicket('not-a-ticket', secret, 10_000), null);
});
