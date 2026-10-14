import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBrowserToken, verifyBrowserToken } from '../integrations/remote-browser/token.mjs';

const secret = 'a-dedicated-browser-secret-longer-than-32-chars';
const cookie = '1790000000000.12345678-1234-1234-1234-123456789abc.' + 'a'.repeat(64);

test('browser tickets are short lived, signed, and bound to an Astra session', () => {
  const ticket = createBrowserToken(cookie, secret, 100_000);
  const verified = verifyBrowserToken(ticket, secret, 100_001);
  assert.match(verified.sid, /^[a-f0-9]{40}$/);
  assert.equal(verifyBrowserToken(ticket, secret, 190_000), null);
  assert.equal(verifyBrowserToken(ticket, secret + '-different', 100_001), null);
  assert.equal(verifyBrowserToken(ticket.slice(0, -4) + 'xxxx', secret, 100_001), null);
  assert.equal(createBrowserToken(cookie, secret, 100_000).split('.')[0] === ticket.split('.')[0], false);
  assert.equal(verifyBrowserToken(createBrowserToken(cookie.replace('a'.repeat(64), 'b'.repeat(64)), secret, 100_001), secret, 100_001), undefined);
});
test('rejects missing private session and weak signing secrets', () => {
  assert.throws(() => createBrowserToken('', secret), /authenticated/);
  assert.throws(() => createBrowserToken(cookie, 'short'), /32 characters/);
  assert.equal(verifyBrowserToken('x.y', secret), null);
});
