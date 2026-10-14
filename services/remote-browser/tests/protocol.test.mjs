import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../protocol.mjs';

const parse = data => parseCommand(JSON.stringify(data));
test('allows bounded browser input', () => {
  assert.deepEqual(parse({ type: 'input.mouse', action: 'down', x: 120, y: 90 }), {
    type: 'input.mouse', action: 'down', x: 120, y: 90, button: 'left',
  });
  assert.equal(parse({ type: 'input.text', text: 'hello' }).text, 'hello');
  assert.equal(parse({ type: 'prompt.submit', id: 'abc', prompt: ' hi ' }).prompt, 'hi');
});
test('blocks arbitrary CDP commands, URL navigation and oversized inputs', () => {
  for (const value of [
    { type: 'CDP.send', method: 'Runtime.evaluate' },
    { type: 'browser.navigate', url: 'http://internal' },
    { type: 'input.mouse', action: 'down', x: -1, y: 5 },
    { type: 'input.key', key: 'Runtime.evaluate' },
    { type: 'input.text', text: 'a'.repeat(2001) },
    { type: 'prompt.submit', id: 'one', prompt: '' },
  ]) assert.throws(() => parse(value));
  assert.throws(() => parseCommand('x'.repeat(10001)));
});
