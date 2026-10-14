import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executePrompt } from '../prompt.mjs';

test('sends through composer and streams a newly created assistant reply', async () => {
  let sent = false, written = '', stopCalls = 0;
  const streamed = [];
  const page = {
    url: () => 'https://chatgpt.com/',
    isClosed: () => false,
    waitForTimeout: ms => new Promise(resolve => setTimeout(resolve, ms)),
    locator: selector => {
      if (selector.includes('data-message-author-role')) return {
        count: async () => sent ? 1 : 0,
        last: () => ({ innerText: async () => 'Hello from ChatGPT' }),
      };
      if (selector.includes('stop-button')) return {
        first: () => ({ isVisible: async () => stopCalls++ < 1 }),
      };
      if (selector.includes('send-button')) return {
        first: () => ({ isVisible: async () => true, click: async () => { sent = true; } }),
      };
      return { first: () => ({ isVisible: async () => true, fill: async value => { written = value; } }) };
    },
  };
  const result = await executePrompt(page, 'Hello', event => streamed.push(event));
  assert.equal(written, 'Hello');
  assert.equal(result, 'Hello from ChatGPT');
  assert.ok(streamed.some(event => event.type === 'prompt_sent'));
  assert.ok(streamed.some(event => event.type === 'response' && event.text === result && !event.final));
  assert.ok(streamed.some(event => event.type === 'response' && event.final));
});

test('rejects prompt injection on non-ChatGPT origins', async () => {
  await assert.rejects(executePrompt({ url: () => 'https://example.org/' }, 'Hello', () => {}), /chatgpt.com/);
});
