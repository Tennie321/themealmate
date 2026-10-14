import { setTimeout as sleep } from 'node:timers/promises';
import { validPrompt } from './security.js';

const ASSISTANT = '[data-message-author-role="assistant"]';
const COMPOSER = '#prompt-textarea, [data-testid="prompt-textarea"], [contenteditable="true"][role="textbox"]';
const STOP = 'button[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Stop"]';

export async function runPrompt(page, prompt, onUpdate, signal, options = {}) {
  if (!validPrompt(prompt)) throw new Error('Prompt must be 1–8000 characters.');
  if (new URL(page.url()).origin !== 'https://chatgpt.com') {
    throw new Error('Open chatgpt.com in the remote browser first.');
  }
  if (signal?.aborted) throw new Error('Run cancelled.');
  const composer = page.locator(COMPOSER).first();
  try { await composer.waitFor({ state: 'visible', timeout: 8000 }); }
  catch { throw new Error('ChatGPT composer unavailable. Complete login or verification in the browser view.'); }
  const baseline = await page.locator(ASSISTANT).count();
  await composer.fill(prompt.trim());
  const send = page.locator('button[data-testid="send-button"]').first();
  if (await send.count() && await send.isEnabled()) await send.click();
  else await composer.press('Enter');
  const deadline = Date.now() + (options.timeoutMs ?? 180000);
  let previous = '';
  let changedAt = Date.now();
  let firstOutputAt = 0;
  while (Date.now() < deadline) {
    if (signal?.aborted) {
      await page.locator(STOP).first().click({ timeout: 1000 }).catch(() => {});
      throw new Error('Run cancelled.');
    }
    const responses = page.locator(ASSISTANT);
    const count = await responses.count();
    if (count > baseline) {
      const text = (await responses.nth(count - 1).innerText().catch(() => '')).trim();
      if (text !== previous) {
        previous = text;
        changedAt = Date.now();
        if (text && !firstOutputAt) firstOutputAt = Date.now();
        onUpdate(text);
      }
      const stillGenerating = await page.locator(STOP).count() > 0;
      // Absence of the stop button alone is unreliable before generation starts.
      if (firstOutputAt && !stillGenerating && Date.now() - changedAt > 2000 && Date.now() - firstOutputAt > 3000) {
        return previous;
      }
    }
    await sleep(350);
  }
  throw new Error('Timed out waiting for ChatGPT. The browser remains open so you can inspect the session.');
}
