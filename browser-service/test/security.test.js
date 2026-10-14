import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SESSION_SECONDS, constantEqual, cookieValue, createSession, safeMessage,
  sameOrigin, validPrompt, validateConfig, verifySession,
} from '../security.js';

const config = { REMOTE_BROWSER_ACCESS_CODE: 'very-long-private-code', REMOTE_BROWSER_SESSION_SECRET: 'a'.repeat(64) };

test('refuses weak or unset remote service credentials', () => {
  assert.throws(() => validateConfig({}), /ACCESS_CODE/);
  assert.throws(() => validateConfig({ ...config, REMOTE_BROWSER_SESSION_SECRET: 'short' }), /SESSION_SECRET/);
  assert.doesNotThrow(() => validateConfig(config));
});
test('only signed unexpired sessions authenticate', () => {
  const secret = config.REMOTE_BROWSER_SESSION_SECRET;
  const token = createSession(secret, 1_000_000_000_000);
  assert.equal(verifySession(token, secret, 1_000_000_000_000), true);
  assert.equal(verifySession(token, 'other'.repeat(10), 1_000_000_000_000), false);
  assert.equal(verifySession(token + 'x', secret, 1_000_000_000_000), false);
  assert.equal(verifySession(token, secret, 1_000_000_000_000 + SESSION_SECONDS * 1000 + 1), false);
});
test('cookie extraction and passcode equality', () => {
  assert.equal(cookieValue('foo=bar; astra_remote_session=abc; x=y'), 'abc');
  assert.equal(constantEqual('example-pass', 'example-pass'), true);
  assert.equal(constantEqual('example-pass', 'wrong'), false);
});
test('same-origin check rejects cross-site and originless websocket requests', () => {
  const req = origin => ({ headers: { origin, host: 'localhost:8080' } });
  assert.equal(sameOrigin(req('http://localhost:8080')), true);
  assert.equal(sameOrigin(req('https://attacker.example')), false);
  assert.equal(sameOrigin(req(undefined)), false);
  assert.equal(sameOrigin(req('null')), false);
});
test('input validation and bounded JSON message parsing', () => {
  assert.equal(validPrompt('hello'), true);
  assert.equal(validPrompt('   '), false);
  assert.equal(validPrompt('a'.repeat(8001)), false);
  assert.deepEqual(safeMessage('{"type":"cancel"}'), { type: 'cancel' });
  assert.equal(safeMessage('{"oops":1}'), null);
  assert.equal(safeMessage('x'.repeat(25001)), null);
});
