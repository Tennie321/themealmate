import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readValidatedBody } from '../src/lib/request-safety.server.ts';

test('rejects a JSON request exceeding its byte allowance', async () => {
  const request = new Request('https://astra.example/api/chat', { method: 'POST', body: JSON.stringify({ value: 'x'.repeat(200) }) });
  await assert.rejects(readValidatedBody(request, 100), /too large/);
});
