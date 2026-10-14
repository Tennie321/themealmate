import test from 'node:test';
import assert from 'node:assert/strict';
import { originAllowed, parseMessage, safeTokenEqual, validProfileId, isChatGPTURL } from '../protocol.mjs';
test('tokens reject wrong or empty secrets', () => {
  assert.equal(safeTokenEqual('abc','abc'), true);
  assert.equal(safeTokenEqual('abc','abx'), false);
  assert.equal(safeTokenEqual('',''), false);
});
test('websocket origin requires an exact allowlist match', () => {
  assert.equal(originAllowed('https://astra.example','https://astra.example,http://localhost:5173'),true);
  assert.equal(originAllowed('https://astra.example.evil.test','https://astra.example'),false);
  assert.equal(originAllowed(undefined,'https://astra.example'),false);
});
test('profile IDs cannot traverse persistent profile folder', () => {
  assert.equal(validProfileId('work_profile-1'),true);
  for (const id of ['../secrets','/','.', 'x/y','']) assert.equal(validProfileId(id),false);
});
test('only HTTPS ChatGPT URLs are accepted', () => {
  assert.equal(isChatGPTURL('https://chatgpt.com/'),true);
  assert.equal(isChatGPTURL('https://www.chatgpt.com/c/123'),true);
  assert.equal(isChatGPTURL('https://chatgpt.com.evil.test'),false);
  assert.equal(isChatGPTURL('javascript:alert(1)'),false);
});
test('message protocol validates bounds and types', () => {
  assert.deepEqual(parseMessage('{"type":"open","profileId":"default"}'),{type:'open',profileId:'default'});
  for (const value of [{type:'open',profileId:'../a'},{type:'prompt',text:' '},{type:'prompt',text:'x'.repeat(8001)},{type:'click',x:2,y:0},{type:'navigate',url:'https://evil.test/'},{type:'unknown'}]) assert.throws(()=>parseMessage(JSON.stringify(value)));
});
