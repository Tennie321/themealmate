import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveCapabilities } from '../src/lib/capabilities.ts';

test('missing AI key reports setup problem without treating search as operational', () => {
  const data = resolveCapabilities({ aiKeyPresent: false, searchKeyPresent: true, accessReady: true });
  assert.equal(data.ai, false);
  assert.equal(data.research, false);
  assert.equal(data.setup.ai, 'missing-ai-key');
  assert.equal(data.setup.research, 'ai-unavailable');
});

test('configured AI without beta credentials stays locked', () => {
  const data = resolveCapabilities({ aiKeyPresent: true, searchKeyPresent: true, accessReady: false });
  assert.equal(data.ai, false);
  assert.equal(data.research, false);
  assert.equal(data.setup.ai, 'access-configuration-required');
});

test('chat works without optional live search and both work when configured', () => {
  const chatOnly = resolveCapabilities({ aiKeyPresent: true, searchKeyPresent: false, accessReady: true });
  assert.equal(chatOnly.ai, true);
  assert.equal(chatOnly.research, false);
  assert.equal(chatOnly.setup.research, 'missing-search-key');

  const complete = resolveCapabilities({ aiKeyPresent: true, searchKeyPresent: true, accessReady: true });
  assert.equal(complete.ai, true);
  assert.equal(complete.research, true);
  assert.deepEqual(complete.setup, { ai: 'ready', research: 'ready' });
});
