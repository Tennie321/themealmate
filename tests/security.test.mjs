import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accessSetupError, checkAccessCode, createAccessCookie, denyIfPrivate, getCapabilityReadiness, isAccessGranted, privateBetaEnabled } from '../src/lib/private-access.server.ts';
import { denyAIUnitBudget, readValidatedBody } from '../src/lib/request-safety.server.ts';

const original = {
  LOVABLE_API_KEY: process.env.LOVABLE_API_KEY,
  PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
  ASTRA_ACCESS_CODE: process.env.ASTRA_ACCESS_CODE,
  ASTRA_SESSION_SECRET: process.env.ASTRA_SESSION_SECRET,
  ASTRA_AI_HOURLY_UNITS: process.env.ASTRA_AI_HOURLY_UNITS,
};
function resetEnv() {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
const request = (cookie) => new Request('https://astra.example/api/chat', cookie ? { headers: { cookie } } : undefined);

test('billable AI key fails closed without private access credentials', async () => {
  delete process.env.ASTRA_ACCESS_CODE;
  delete process.env.ASTRA_SESSION_SECRET;
  process.env.LOVABLE_API_KEY = 'test-key-never-used';
  try {
    assert.equal(privateBetaEnabled(), true);
    assert.match(accessSetupError(), /ASTRA_ACCESS_CODE/);
    assert.equal(await isAccessGranted(request()), false);
    assert.equal((await denyIfPrivate(request())).status, 503);
  } finally { resetEnv(); }
});

test('partial credentials fail closed, and valid signed cookies cannot be forged', async () => {
  process.env.LOVABLE_API_KEY = 'test-key-never-used';
  process.env.ASTRA_ACCESS_CODE = 'a-long-test-only-access-code';
  delete process.env.ASTRA_SESSION_SECRET;
  try {
    assert.match(accessSetupError(), /ASTRA_SESSION_SECRET/);
    assert.equal((await denyIfPrivate(request())).status, 503);
    process.env.ASTRA_SESSION_SECRET = 'a-very-long-test-only-signing-secret-123456789';
    assert.equal(accessSetupError(), null);
    assert.equal(await checkAccessCode('wrong'), false);
    assert.equal(await checkAccessCode(process.env.ASTRA_ACCESS_CODE), true);
    assert.equal((await denyIfPrivate(request())).status, 401);
    const cookieHeader = await createAccessCookie(request());
    assert.match(cookieHeader, /HttpOnly; SameSite=Strict; Secure/);
    const cookie = cookieHeader.split(';')[0];
    assert.equal(await isAccessGranted(request(cookie)), true);
    assert.equal(await denyIfPrivate(request(cookie)), null);
    const parts = cookie.split('.');
    const forged = [parts[0], parts[1], parts[2], '0'.repeat(64)].join('.');
    assert.equal(await isAccessGranted(request(forged)), false);
    process.env.ASTRA_SESSION_SECRET = 'another-long-test-only-signing-secret-123456';
    assert.equal(await isAccessGranted(request(cookie)), false);
  } finally { resetEnv(); }
});

test('no AI key and no access settings allow only the non-billable UI', async () => {
  delete process.env.LOVABLE_API_KEY;
  delete process.env.ASTRA_ACCESS_CODE;
  delete process.env.ASTRA_SESSION_SECRET;
  try {
    assert.equal(privateBetaEnabled(), false);
    assert.equal(accessSetupError(), null);
    assert.equal(await denyIfPrivate(request()), null);
  } finally { resetEnv(); }
});

test('hourly instance fuse blocks requests and resets after the window', () => {
  process.env.ASTRA_AI_HOURLY_UNITS = '2';
  const oldNow = Date.now;
  let now = oldNow() + 10_000_000;
  Date.now = () => now;
  try {
    assert.equal(denyAIUnitBudget(1), null);
    assert.equal(denyAIUnitBudget(1), null);
    const denied = denyAIUnitBudget(1);
    assert.equal(denied.status, 429);
    assert.ok(Number(denied.headers.get('Retry-After')) > 0);
    now += 3_600_001;
    assert.equal(denyAIUnitBudget(2), null);
    process.env.ASTRA_AI_HOURLY_UNITS = 'invalid';
    assert.equal(denyAIUnitBudget(1).status, 503);
  } finally { Date.now = oldNow; resetEnv(); }
});

test('request parser enforces actual UTF-8 bytes without calling a provider', async () => {
  await assert.rejects(readValidatedBody(new Request('https://astra.example/api/chat', { method: 'POST', body: JSON.stringify({ message: 'é'.repeat(40) }) }), 50), /too large/);
});

test('capabilities distinguish unconfigured services from protected and ready AI', () => {
  delete process.env.LOVABLE_API_KEY;
  delete process.env.PERPLEXITY_API_KEY;
  delete process.env.ASTRA_ACCESS_CODE;
  delete process.env.ASTRA_SESSION_SECRET;
  try {
    let status = getCapabilityReadiness();
    assert.equal(status.ai, false);
    assert.equal(status.research, false);
    assert.equal(status.aiStatus, 'missing_lovable_api_key');
    assert.equal(status.researchStatus, 'missing_lovable_api_key');

    process.env.LOVABLE_API_KEY = 'test-only-not-a-real-key';
    status = getCapabilityReadiness();
    assert.equal(status.ai, false);
    assert.equal(status.aiStatus, 'access_setup_required');

    process.env.ASTRA_ACCESS_CODE = 'long-test-only-access-code';
    process.env.ASTRA_SESSION_SECRET = 'test-only-secret-with-at-least-thirty-two-characters';
    status = getCapabilityReadiness();
    assert.equal(status.ai, true);
    assert.equal(status.research, false);
    assert.equal(status.researchStatus, 'missing_perplexity_api_key');

    process.env.PERPLEXITY_API_KEY = 'test-only-search-key';
    status = getCapabilityReadiness();
    assert.equal(status.ai, true);
    assert.equal(status.research, true);
    assert.equal(status.aiStatus, 'ready');
    assert.equal(status.researchStatus, 'ready');
    assert.equal('key' in status, false);
  } finally { resetEnv(); }
});
