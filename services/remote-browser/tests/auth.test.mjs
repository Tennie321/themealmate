import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { authenticate } from '../auth.mjs';

const secret = 'test-only-secret-with-more-than-thirty-two-characters';
const origin = 'https://astra.example';
const now = 1_800_000_000_000;
function headers({ expiry = now + 120_000, nonce = randomUUID(), source = origin, signature } = {}) {
  const value = String(expiry) + '.' + nonce;
  const mac = signature || createHmac('sha256', secret).update(value).digest('hex');
  return { origin: source, cookie: 'astra_beta_session=' + value + '.' + mac };
}
test('accepts a valid same-origin signed beta cookie', () => {
  const result = authenticate(headers(), { origin, secret, now });
  assert.equal(result.ok, true);
  assert.match(result.profileId, /^[a-f0-9]{32}$/);
});
test('rejects missing origin, expired cookie, and modified signature', () => {
  assert.equal(authenticate(headers({ source: 'https://evil.example' }), { origin, secret, now }).status, 403);
  assert.equal(authenticate(headers({ expiry: now - 1 }), { origin, secret, now }).status, 401);
  assert.equal(authenticate(headers({ signature: '0'.repeat(64) }), { origin, secret, now }).status, 401);
  assert.equal(authenticate({ origin }, { origin, secret, now }).status, 401);
});
test('refuses server missing the signing secret', () => {
  assert.equal(authenticate(headers(), { origin, secret: '', now }).status, 503);
});
