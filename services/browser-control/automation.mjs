// This controller drives only the foreground ChatGPT webpage: no private APIs or CAPTCHA bypass.
export const COMPOSER_SELECTOR = '[data-testid="prompt-textarea"], #prompt-textarea, [contenteditable="true"][data-placeholder]';
export const RESPONSE_SELECTOR = '[data-message-author-role="assistant"]';

export async function executePrompt(page, prompt, onUpdate, signal) {
  if (signal?.aborted) throw new Error('Cancelled');
  const composer = page.locator(COMPOSER_SELECTOR).first();
  await composer.waitFor({ state: 'visible', timeout: 15000 });
  const previousCount = await page.locator(RESPONSE_SELECTOR).count();
  await composer.click();
  await composer.fill(prompt);
  const sendButton = page.locator('[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"]').first();
  if (await sendButton.count() && await sendButton.isEnabled()) await sendButton.click();
  else await composer.press('Enter');

  let text = '';
  let lastChange = Date.now();
  let sawGeneration = false;
  const began = Date.now();
  while (Date.now() - began < 180_000) {
    if (signal?.aborted) throw new Error('Cancelled');
    if (page.isClosed()) throw new Error('Browser page closed');
    const replies = page.locator(RESPONSE_SELECTOR);
    const count = await replies.count();
    const busy = await page.locator('[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Stop streaming"]').count() > 0;
    if (busy) sawGeneration = true;
    if (count > previousCount) {
      const latest = (await replies.last().innerText().catch(() => '')).trim();
      if (latest !== text) {
        text = latest;
        lastChange = Date.now();
        onUpdate(text);
      }
      // Let the new message stabilize after the stop button disappears.
      if (text && !busy && Date.now() - lastChange >= (sawGeneration ? 1200 : 3000)) return text;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(text ? 'Timed out waiting for ChatGPT to finish; partial reply was streamed.' : 'Timed out waiting for a ChatGPT response.');
}
