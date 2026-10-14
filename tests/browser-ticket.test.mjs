import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueTicket, verifyTicket, validSecret } from '../browser/token.mjs';

const secret='long-random-test-secret-not-for-production-12345';
test('short, missing, forged, and incorrectly signed tickets fail closed', () => {
  assert.equal(validSecret('short'),false);
  assert.throws(()=>issueTicket('short'),/secret/i);
  const issued=issueTicket(secret,1_900_000_000_000);
  assert.equal(verifyTicket(secret,issued,1_900_000_000_001)?.sub,'owner');
  assert.equal(verifyTicket('incorrect-but-very-long-test-secret-123',issued,1_900_000_000_001),null);
  const [payload,sig]=issued.split('.');
  assert.equal(verifyTicket(secret,payload+'.'+sig.slice(1)+'x',1_900_000_000_001),null);
  assert.equal(verifyTicket(secret,'made-up-token',1_900_000_000_001),null);
  assert.equal(verifyTicket(secret,issued,1_900_000_120_001),null);
});
test('ticket expiry is brief and cannot be expanded by changing unsigned payload', () => {
  const clock=1_900_000_000_000;
  const token=issueTicket(secret,clock);
  assert.ok(verifyTicket(secret,token,clock+119_999));
  assert.equal(verifyTicket(secret,token,clock+120_000),null);
  const [payload,sig]=token.split('.');
  const edited=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(payload,'base64url').toString()),exp:clock+99999999})).toString('base64url');
  assert.equal(verifyTicket(secret,edited+'.'+sig,clock),null);
});
test('chatgpt remote controls are absent from the original unauthenticated handoff',async()=>{
  const {readFile}=await import('node:fs/promises');
  const route=await readFile(new URL('../src/routes/api.browser.ticket.ts',import.meta.url),'utf8');
  assert.match(route,/privateBetaEnabled\(\)/);
  assert.match(route,/isAccessGranted\(request\)/);
  assert.match(route,/origin !== new URL\(request.url\).origin/);
});
