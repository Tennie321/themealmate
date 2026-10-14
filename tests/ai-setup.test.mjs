import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiSetupStatus } from '../src/lib/ai-setup.server.ts';

const keys = ['LOVABLE_API_KEY', 'ASTRA_ACCESS_CODE', 'ASTRA_SESSION_SECRET', 'PERPLEXITY_API_KEY'];
function withEnv(values, callback) {
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(values, key)) process.env[key] = values[key];
      else delete process.env[key];
    }
    callback();
  } finally {
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  }
}

test('missing Lovable key shows setup guidance without exposing secrets', () => {
  withEnv({}, () => {
    const status = aiSetupStatus();
    assert.equal(status.ai, false);
    assert.equal(status.research, false);
    assert.match(status.aiStatusMessage, /Lovable AI/);
  });
});

test('key alone is blocked until both private credentials exist', () => {
  withEnv({ LOVABLE_API_KEY: 'dummy-test-key' }, () => {
    const status = aiSetupStatus();
    assert.equal(status.ai, false);
    assert.match(status.aiStatusMessage, /ASTRA_ACCESS_CODE/);
  });
});

test('chat is available without optional live research', () => {
  withEnv({
    LOVABLE_API_KEY: 'dummy-test-key',
    ASTRA_ACCESS_CODE: 'long-test-access-code',
    ASTRA_SESSION_SECRET: 'long-test-signing-secret-01234567890',
  }, () => {
    const status = aiSetupStatus();
    assert.equal(status.ai, true);
    assert.equal(status.research, false);
    assert.equal(status.aiStatusMessage, null);
    assert.match(status.researchStatusMessage, /PERPLEXITY_API_KEY/);
  });
});

test('fully configured capabilities mark both features available', () => {
  withEnv({
    LOVABLE_API_KEY: 'dummy-test-key',
    ASTRA_ACCESS_CODE: 'long-test-access-code',
    ASTRA_SESSION_SECRET: 'long-test-signing-secret-01234567890',
    PERPLEXITY_API_KEY: 'dummy-research-key',
  }, () => {
    const status = aiSetupStatus();
    assert.equal(status.ai, true);
    assert.equal(status.research, true);
    assert.equal(status.aiStatusMessage, null);
    assert.equal(status.researchStatusMessage, null);
  });
});
