import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runPrompt } from '../automation.js';

test('rejects invalid prompts before interacting with browser', async () => {
  await assert.rejects(() => runPrompt({ url: () => 'https://chatgpt.com/' }, '' , () => {}), /Prompt/);
});
test('refuses automation against another website', async () => {
  await assert.rejects(() => runPrompt({ url: () => 'https://example.com' }, 'test', () => {}), /chatgpt.com/);
});
test('prompts user to sign in when composer is unavailable', async () => {
  const page = { url: () => 'https://chatgpt.com/', locator: () => ({ first: () => ({
    waitFor: async () => { throw new Error('Not visible'); },
  }) }) };
  await assert.rejects(() => runPrompt(page, 'hello', () => {}), /Complete login or verification/);
});
