import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { verifyTicket, parseMessage, profilePath } from '../security.mjs';

const secret = 'test-only-32-character-secret-1234567890';
const origin = 'https://astra.example';
function token(changes = {}) {
  const p = Buffer.from(JSON.stringify({
    aud: 'astra-browser-v1', sub: 'owner', origin,
    exp: Date.now() + 30_000, nonce: randomUUID(), ...changes,
  })).toString('base64url');
  return p + '.' + createHmac('sha256', secret).update(p).digest('base64url');
}
test('a valid signed ticket authorizes a single owner', () => {
  assert.equal(verifyTicket(token(), { secret, origin }), 'owner');
});
test('expired, cross-origin and forged tickets fail closed', () => {
  for (const bad of [token({ exp: Date.now() - 1 }), token({ origin: 'https://evil.example' }), token({ sub: 'other' }), token() + 'x']) {
    assert.throws(() => verifyTicket(bad, { secret, origin }));
  }
});
test('controller validates prompt length, pointer bounds and input actions', () => {
  assert.deepEqual(parseMessage(JSON.stringify({ type: 'prompt', text: ' Hello ' })), { type: 'prompt', text: 'Hello' });
  assert.throws(() => parseMessage(JSON.stringify({ type: 'prompt', text: 'x'.repeat(5001) })));
  assert.throws(() => parseMessage(JSON.stringify({ type: 'pointer', action: 'click', x: -1, y: 1 })));
  assert.throws(() => parseMessage(JSON.stringify({ type: 'wheel', dx: Infinity, dy: 0 })));
  assert.throws(() => parseMessage(JSON.stringify({ type: 'navigate', url: 'http://localhost' })));
});
test('profile directories cannot be traversed', () => {
  assert.match(profilePath('/profiles', '../../secrets'), /^\/profiles\/[a-f0-9]{64}$/);
});
