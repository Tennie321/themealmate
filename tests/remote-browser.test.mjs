import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { verifyTicket } from '../services/chatgpt-browser/auth.mjs';

const secret = 'local-test-secret-not-a-deployment-secret-long';
const origin = 'https://astra.test';
function mint(options = {}) {
  const body = Buffer.from(JSON.stringify({ aud: 'astra-browser-v1', sub: 'owner',
    origin, exp: Date.now() + 45_000, nonce: randomUUID(), ...options })).toString('base64url');
  return body + '.' + createHmac('sha256', secret).update(body).digest('hex');
}
test('browser ticket is origin bound, signed, short lived and single use', () => {
  const grant = mint();
  const used = new Set();
  assert.equal(verifyTicket(grant, { secret, origin, used }), true);
  assert.equal(verifyTicket(grant, { secret, origin, used }), false);
  assert.equal(verifyTicket(mint(), { secret, origin: 'https://attacker.test', used: new Set() }), false);
  assert.equal(verifyTicket(mint({ exp: Date.now() - 1 }), { secret, origin, used: new Set() }), false);
  assert.equal(verifyTicket(mint({ sub: 'another-user' }), { secret, origin, used: new Set() }), false);
});
test('ticket endpoint requires beta auth and never exposes worker secret', () => {
  const file = readFileSync(new URL('../src/routes/api.browser.ticket.ts', import.meta.url), 'utf8');
  assert.match(file, /isAccessGranted\(request\)/);
  assert.match(file, /ASTRA_ACCESS_CODE/);
  assert.match(file, /ASTRA_SESSION_SECRET/);
  assert.match(file, /request\.headers\.get\('origin'\)/);
  assert.match(file, /ASTRA_BROWSER_TOKEN_SECRET/);
  assert.doesNotMatch(file, /return Response\.json\(\{[^}]*secret/);
});
test('worker requires origin, ticket, and CDP screen stream', () => {
  const file = readFileSync(new URL('../services/chatgpt-browser/server.mjs', import.meta.url), 'utf8');
  assert.match(file, /verifyTicket\(ticket/);
  assert.match(file, /suppliedOrigin !== origin/);
  assert.match(file, /Page\.startScreencast/);
  assert.match(file, /run:delta/);
  assert.match(file, /Page\.screencastFrameAck/);
  assert.doesNotMatch(file, /--disable-web-security|--remote-debugging-port/);
});
