import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedOrigin, equalSecret, isAllowedNavigation, isPrivateHost, parseCommand } from '../protocol.mjs';

test('explicit origin allowlist is fail-closed', () => {
  assert.ok(allowedOrigin('https://astra.example', ['https://astra.example']));
  assert.equal(allowedOrigin('https://astra.example.attacker', ['https://astra.example']), false);
  assert.equal(allowedOrigin(null, ['https://astra.example']), false);
});
test('constant-time secret comparison checks full value', () => {
  assert.ok(equalSecret('a'.repeat(32), 'a'.repeat(32)));
  assert.equal(equalSecret('b'.repeat(32), 'a'.repeat(32)), false);
});
test('navigation limits browsing to login and ChatGPT domains', () => {
  assert.ok(isAllowedNavigation('https://chatgpt.com/'));
  assert.ok(isAllowedNavigation('https://auth.openai.com/authorize'));
  assert.equal(isAllowedNavigation('http://chatgpt.com'), false);
  assert.equal(isAllowedNavigation('https://evil-openai.com'), false);
  assert.equal(isAllowedNavigation('https://127.0.0.1/admin'), false);
  assert.ok(isPrivateHost('http://10.0.0.5/internal'));
  assert.ok(isPrivateHost('http://localhost:3000'));
});
test('protocol rejects malformed, excessive and out-of-bounds input', () => {
  assert.deepEqual(parseCommand(Buffer.from('{"type":"pointer","x":12.5,"y":100}')), { type: 'pointer', action: 'click', x: 13, y: 100 });
  assert.deepEqual(parseCommand(Buffer.from('{"type":"pointer","action":"down","x":30,"y":40}')).action, 'down');
  assert.throws(() => parseCommand(Buffer.from('{"type":"pointer","action":"secret","x":20,"y":30}')));
  assert.throws(() => parseCommand(Buffer.from('{"type":"pointer","x":50000,"y":1}')));
  assert.throws(() => parseCommand(Buffer.from('{"type":"key","key":"Control+Alt+Delete"}')));
  assert.throws(() => parseCommand(Buffer.from('{"type":"prompt","text":""}')));
  assert.throws(() => parseCommand(Buffer.from('a'.repeat(17000))));
  assert.equal(parseCommand(Buffer.from('{"type":"cancel"}')).type, 'cancel');
});
