const ASSISTANT = '[data-message-author-role="assistant"]';
const STOP = '[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Stop streaming"]';
const COMPOSER = '[data-testid="prompt-textarea"], #prompt-textarea, textarea[placeholder], [contenteditable="true"][role="textbox"]';

export async function executePrompt(page, prompt, emit, signal, maxWaitMs = 240_000) {
  let host;
  try { host = new URL(page.url()).hostname; } catch { host = ''; }
  if (host !== 'chatgpt.com') throw new Error('Open and sign in to chatgpt.com before running a prompt.');
  const editor = page.locator(COMPOSER).first();
  if (!await editor.isVisible().catch(() => false)) throw new Error('ChatGPT composer is not available. Sign in or finish verification.');
  const assistant = page.locator(ASSISTANT);
  const baseline = await assistant.count();
  await editor.fill(prompt);
  const send = page.locator('[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"]').first();
  if (await send.isVisible().catch(() => false)) await send.click();
  else await editor.press('Enter');
  emit({ type: 'prompt_sent' });
  const startedAt = Date.now();
  let text = '', lastChange = startedAt, sawStop = false;
  while (Date.now() - startedAt < maxWaitMs) {
    if (signal?.aborted) throw new Error('Prompt monitoring cancelled.');
    if (page.isClosed()) throw new Error('ChatGPT tab closed.');
    if (await assistant.count() > baseline) {
      const next = (await assistant.last().innerText({ timeout: 3000 })).trim();
      if (next !== text) {
        text = next; lastChange = Date.now();
        emit({ type: 'response', text, final: false });
      }
      const stopping = await page.locator(STOP).first().isVisible().catch(() => false);
      if (stopping) sawStop = true;
      if (text && !stopping && Date.now() - lastChange > (sawStop ? 1800 : 6000)) {
        emit({ type: 'response', text, final: true });
        return text;
      }
    }
    await page.waitForTimeout(350);
  }
  throw new Error('Timed out waiting for the ChatGPT response. Inspect the browser view.');
}
