import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { verifyTicket } from './auth.mjs';

const secret = 'a-long-server-side-ticket-secret-with-at-least-32-characters';
const origin = 'https://astra.example';
const now = 1_800_000_000_000;
function ticket(overrides = {}) {
  const payload = { aud: 'astra-browser-v1', sub: 'owner', origin, exp: now + 45_000, nonce: randomUUID(), ...overrides };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + createHmac('sha256', secret).update(body).digest('hex');
}
test('accepts a single valid ticket and rejects replay', () => {
  const used = new Set();
  const grant = ticket();
  assert.equal(verifyTicket(grant, { secret, origin, used, now }), true);
  assert.equal(verifyTicket(grant, { secret, origin, used, now }), false);
});
test('rejects cross-origin, expired, far-future and tampered tickets', () => {
  for (const value of [ticket({ origin: 'https://evil.example' }), ticket({ exp: now - 1 }),
    ticket({ exp: now + 90_000 }), (() => { const t = ticket(); return t.slice(0, -1) + (t.endsWith('a') ? 'b' : 'a'); })()]) {
    assert.equal(verifyTicket(value, { secret, origin, used: new Set(), now }), false);
  }
  assert.equal(verifyTicket(ticket(), { secret, origin: 'https://evil.example', used: new Set(), now }), false);
});
test('fails closed when a server secret is missing', () => {
  assert.equal(verifyTicket(ticket(), { secret: '', origin, used: new Set(), now }), false);
});
