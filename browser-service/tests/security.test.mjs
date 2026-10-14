import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { test } from 'node:test';
import { authenticateUpgrade, parseCommand } from '../security.mjs';

const now = Date.now();
const env = {
  ASTRA_ACCESS_CODE: 'private-access-code',
  ASTRA_SESSION_SECRET: 'a-different-cryptographically-random-secret-value',
  ASTRA_PUBLIC_ORIGIN: 'https://astra.example',
};
const until = now + 60 * 60 * 1000;
const value = until + '.' + randomUUID();
const token = value + '.' + createHmac('sha256', env.ASTRA_SESSION_SECRET).update(value).digest('hex');
const request = {
  url: '/browser/ws',
  headers: { origin: env.ASTRA_PUBLIC_ORIGIN, cookie: 'other=1; astra_beta_session=' + token },
};

test('accepts a valid signed, scoped Astra session cookie', () => {
  assert.equal(authenticateUpgrade(request, env, now), true);
});
test('rejects other origins, paths, tampered signatures, and missing setup', () => {
  assert.equal(authenticateUpgrade({ ...request, headers: { ...request.headers, origin: 'https://evil.example' } }, env, now), false);
  assert.equal(authenticateUpgrade({ ...request, url: '/other/ws' }, env, now), false);
  assert.equal(authenticateUpgrade({ ...request, headers: { ...request.headers, cookie: 'astra_beta_session=' + token.slice(0, -2) + 'ab' } }, env, now), false);
  assert.equal(authenticateUpgrade(request, { ...env, ASTRA_ACCESS_CODE: '' }, now), false);
  assert.equal(authenticateUpgrade(request, { ...env, ASTRA_PUBLIC_ORIGIN: '' }, now), false);
  assert.equal(authenticateUpgrade(request, env, now + 2 * 60 * 60 * 1000), false);
});
test('strictly validates browser commands and prompt lengths', () => {
  assert.deepEqual(parseCommand(JSON.stringify({ type: 'click', x: 0.25, y: 0.75 })), { type: 'click', x: 0.25, y: 0.75 });
  assert.deepEqual(parseCommand(JSON.stringify({ type: 'send_prompt', prompt: ' Hello ' })), { type: 'send_prompt', prompt: 'Hello' });
  assert.throws(() => parseCommand(JSON.stringify({ type: 'click', x: 123, y: 0 })), /normalized/);
  assert.throws(() => parseCommand(JSON.stringify({ type: 'send_prompt', prompt: 'x'.repeat(8001) })), /8000/);
  assert.throws(() => parseCommand(JSON.stringify({ type: 'navigate', url: 'http:\/\/127.0.0.1' })), /Unknown/);
  assert.throws(() => parseCommand(JSON.stringify({ type: 'key', key: 'Control+F1; rm -rf /' })), /Invalid key/);
  assert.throws(() => parseCommand('not JSON'), /Invalid JSON/);
});
