const ENDPOINT = 'https://api.openai.com/v1/responses';

/** Reassemble SSE event boundaries across arbitrary network chunks. */
export async function consumeResponseEvents(chunks, onDelta) {
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  const processEvent = block => {
    const data = block.split('\n').filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    let event;
    try { event = JSON.parse(data); } catch { throw new Error('Malformed upstream response.'); }
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') onDelta(event.delta);
    if (event.type === 'response.completed') completed = true;
    if (event.type === 'response.failed' || event.type === 'error') {
      throw new Error('The API could not complete this response.');
    }
  };
  for await (const chunk of chunks) {
    buffer += decoder.decode(chunk, { stream: true });
    // Normalize the accumulated buffer so CR and LF may arrive in separate chunks.
    buffer = buffer.replace(/\r\n/g, '\n');
    if (buffer.length > 256_000) throw new Error('Upstream response event is too large.');
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      processEvent(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) processEvent(buffer);
  if (!completed) throw new Error('Upstream response ended without completion.');
}
export async function streamPrompt({ prompt, signal, onDelta, fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY }) {
  if (!apiKey) throw new Error('OpenAI API is not configured on the browser service.');
  const result = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5-mini', input: prompt, stream: true }),
    signal,
  });
  if (!result.ok || !result.body) {
    throw new Error('The OpenAI API request failed. Verify API billing, model access and credentials.');
  }
  await consumeResponseEvents(result.body, onDelta);
}
