import { setTimeout as sleep } from 'node:timers/promises';
const COMPOSER = '#prompt-textarea, [data-testid="composer-input"][contenteditable="true"], [contenteditable="true"][role="textbox"]';
const REPLIES = '[data-message-author-role="assistant"]';
const STOP = 'button[data-testid="stop-button"], button[aria-label="Stop streaming"], button[aria-label="Stop generating"]';

export async function sendChatGPTPrompt(page, input, emit, timeoutMs = 180_000) {
  const prompt = typeof input === 'string' ? input.trim() : '';
  if (!prompt || prompt.length > 8000) throw new Error('Prompt must contain 1 to 8000 characters.');
  if (!page.url().startsWith('https://chatgpt.com/')) throw new Error('Open ChatGPT before sending prompts.');
  const composer = page.locator(COMPOSER).first();
  try { await composer.waitFor({ state: 'visible', timeout: 12_000 }); }
  catch { throw new Error('Composer unavailable. Sign in or complete the on-screen challenge manually.'); }
  const replies = page.locator(REPLIES);
  const before = await replies.count();
  await composer.fill(prompt);
  const sendButton = page.locator('button[data-testid="send-button"], button[aria-label="Send prompt"]').first();
  await sendButton.waitFor({ state: 'visible', timeout: 8000 });
  await sendButton.click({ timeout: 8000 });
  emit({ type: 'prompt-sent' });
  const start = Date.now();
  let last = '';
  let seen = false;
  let stable = 0;
  while (Date.now() - start < timeoutMs) {
    if (await replies.count() > before) {
      seen = true;
      const reply = replies.last();
      const markdown = reply.locator('.markdown').first();
      let current = '';
      try { current = (await (await markdown.count() ? markdown.innerText() : reply.innerText())).trim().slice(0, 100_000); }
      catch { /* response rerendered */ }
      if (current !== last) {
        last = current;
        stable = Date.now();
        emit({ type: 'response', text: current, complete: false });
      }
    }
    if (seen && last && !(await page.locator(STOP).count()) && Date.now() - stable >= 1800) {
      emit({ type: 'response', text: last, complete: true });
      return last;
    }
    await sleep(350);
  }
  throw new Error(seen ? 'Reply timed out; partial text remains visible.' : 'No reply appeared before timeout.');
}
