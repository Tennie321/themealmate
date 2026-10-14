import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import { verifyTicket, isAllowedOrigin, parseAction } from '../protocol.mjs';
const secret = 'test-secret-with-at-least-thirty-two-characters';
function ticket(expires, nonce = randomUUID()) {
  const payload = 'v1.' + expires + '.' + nonce;
  return payload + '.' + createHmac('sha256', secret).update(payload).digest('hex');
}
test('accepts only valid short-lived tickets', () => {
  const now = 1792000000000, good = ticket(now + 30_000);
  assert.ok(verifyTicket(good, secret, now));
  assert.equal(verifyTicket(good, 'another-secret-with-at-least-thirty-two-characters', now), null);
  assert.equal(verifyTicket(ticket(now - 1), secret, now), null);
  assert.equal(verifyTicket(ticket(now + 60_001), secret, now), null);
  assert.equal(verifyTicket('invalid', secret, now), null);
});
test('origin check is exact', () => {
  assert.equal(isAllowedOrigin('https://astra.example', 'https://astra.example'), true);
  assert.equal(isAllowedOrigin('https://astra.example.attacker.net', 'https://astra.example'), false);
  assert.equal(isAllowedOrigin(undefined, 'https://astra.example'), false);
});
test('action parser denies unsupported and oversized actions', () => {
  assert.deepEqual(parseAction('{"type":"click","x":2,"y":3}'), { type: 'click', x: 2, y: 3 });
  assert.deepEqual(parseAction('{"type":"down","x":2,"y":3}'), { type: 'down', x: 2, y: 3 });
  assert.deepEqual(parseAction('{"type":"up","x":2,"y":3}'), { type: 'up', x: 2, y: 3 });
  assert.throws(() => parseAction('{"type":"click","x":-2,"y":3}'), /coordinates/);
  assert.throws(() => parseAction(JSON.stringify({ type: 'run_prompt', requestId: 'x', prompt: 'p'.repeat(10001) })), /too large|10,000/);
  assert.throws(() => parseAction('{"type":"navigate","url":"http://localhost"}'), /Unsupported/);
  assert.throws(() => parseAction('not-json'), /JSON/);
});
