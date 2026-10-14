import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consumeResponseEvents, streamPrompt } from '../api-stream.mjs';

const encoder = new TextEncoder();
async function* pieces(input, width) {
  for (let i = 0; i < input.length; i += width) yield encoder.encode(input.slice(i, i + width));
}
test('streams incremental text from split SSE data events', async () => {
  const sse = 'data: {"type":"response.output_text.delta","delta":"Hello "}\n\n' +
    'data: {"type":"response.output_text.delta","delta":"world"}\n\n' +
    'data: {"type":"response.completed"}\n\n';
  const deltas = [];
  await consumeResponseEvents(pieces(sse, 7), delta => deltas.push(delta));
  assert.deepEqual(deltas, ['Hello ', 'world']);
});
test('rejects upstream failures and incomplete stream termination', async () => {
  await assert.rejects(consumeResponseEvents(pieces('data: {"type":"response.failed"}\n\n', 9), () => {}), /could not complete/);
  await assert.rejects(consumeResponseEvents(pieces('data: {"type":"response.output_text.delta","delta":"only"}\n\n', 8), () => {}), /without completion/);
});
test('passes only the server-side API key to the OpenAI endpoint', async () => {
  let call;
  await streamPrompt({
    prompt: 'hello', apiKey: 'server-only-test', onDelta: () => {},
    fetchImpl: async (url, options) => {
      call = { url, options };
      return { ok: true, body: pieces('data: {"type":"response.completed"}\n\n', 20) };
    },
  });
  assert.equal(call.url, 'https://api.openai.com/v1/responses');
  assert.equal(call.options.headers.Authorization, 'Bearer server-only-test');
  assert.equal(JSON.parse(call.options.body).input, 'hello');
  assert.equal(JSON.parse(call.options.body).max_output_tokens, 1600);
});

test('accepts CRLF SSE delimiters split across chunks', async () => {
  const sse = 'data: {"type":"response.output_text.delta","delta":"Hello"}\r\n\r\n' +
    'data: {"type":"response.completed"}\r\n\r\n';
  const deltas = [];
  await consumeResponseEvents(pieces(sse, 1), delta => deltas.push(delta));
  assert.deepEqual(deltas, ['Hello']);
});
