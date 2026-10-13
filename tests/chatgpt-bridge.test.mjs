import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildChatGPTHandoffURL, CHATGPT_HANDOFF_LIMIT } from '../src/lib/chatgpt-bridge.ts';

test('handoff link targets the real ChatGPT site without credentials', () => {
  const url = new URL(buildChatGPTHandoffURL('  Tell me about astronomy & stars  '));
  assert.equal(url.origin, 'https://chatgpt.com');
  assert.equal(url.pathname, '/');
  assert.equal(url.searchParams.get('q'), 'Tell me about astronomy & stars');
  assert.equal(url.searchParams.get('astra_send'), '1');
  assert.match(url.searchParams.get('astra_nonce'), /^[a-f0-9-]{36}$/i);
  assert.ok(!url.href.includes('LOVABLE_API_KEY'));
});
test('handoff rejects empty and unreasonably long URL prompts', () => {
  assert.throws(() => buildChatGPTHandoffURL('   '), /1–1200/);
  assert.throws(() => buildChatGPTHandoffURL('x'.repeat(CHATGPT_HANDOFF_LIMIT + 1)), /1–1200/);
});

const script = readFileSync(new URL('../integrations/chatgpt-safari-extension/content.js', import.meta.url), 'utf8');
function runExtension(url, displayedMessage) {
  let clicks = 0;
  let cleanedURL = '';
  const saved = new Map();
  const composer = { value: displayedMessage };
  const button = { disabled: false, getAttribute() { return null; }, click() { clicks++; } };
  const callbacks = [];
  const window = {
    location: { href: url },
    history: { state: null, replaceState(_state, _title, href) { cleanedURL = href; } },
    sessionStorage: {
      getItem(key) { return saved.get(key) ?? null; },
      setItem(key, value) { saved.set(key, value); },
    },
  };
  const document = {
    documentElement: {},
    querySelector(selector) {
      if (selector === '#prompt-textarea') return composer;
      if (selector === 'button[data-testid="send-button"]') return button;
      return null;
    },
  };
  class MutationObserver {
    observe() {}
    disconnect() {}
  }
  runInNewContext(script, { window, document, URL, MutationObserver, setTimeout(callback) { callbacks.push(callback); return callbacks.length; }, clearTimeout() {} });
  // Only run the first short-delay callback, not the 25-second timeout callback.
  if (callbacks[1]) callbacks[1]();
  return { clicks, cleanedURL, saved };
}

test('extension clicks only for an exact Astra-marked ChatGPT draft, and clears URL', () => {
  const url = buildChatGPTHandoffURL('A safe test prompt');
  const result = runExtension(url, 'A safe test prompt');
  assert.equal(result.clicks, 1);
  assert.equal(new URL(result.cleanedURL).searchParams.has('q'), false);
  assert.equal(new URL(result.cleanedURL).searchParams.has('astra_send'), false);
  assert.equal(new URL(result.cleanedURL).searchParams.has('astra_nonce'), false);
  assert.equal(result.saved.size, 1);
});
test('extension never sends an unmarked or mismatched prompt', () => {
  const marked = buildChatGPTHandoffURL('Intended text');
  assert.equal(runExtension(marked, 'Unrelated chat draft').clicks, 0);
  assert.equal(runExtension('https://chatgpt.com/?q=Intended%20text', 'Intended text').clicks, 0);
  const tooLong = new URL(marked);
  tooLong.searchParams.set('q', 'x'.repeat(1201));
  assert.equal(runExtension(tooLong.href, 'x'.repeat(1201)).clicks, 0);
});
