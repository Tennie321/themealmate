import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const WIDTH = 1280;
const HEIGHT = 800;
const CHATGPT_ORIGIN = 'https://chatgpt.com';

export class BrowserController {
  constructor(profileDirectory, broadcast) {
    this.profileDirectory = profileDirectory;
    this.broadcast = broadcast;
    this.context = null;
    this.page = null;
    this.cdp = null;
    this.boot = null;
    this.busy = false;
    this.lastFrame = null;
    this.lastFrameAt = 0;
  }

  async start() {
    if (this.context) return;
    if (this.boot) return this.boot;
    this.boot = this.launch();
    try { await this.boot; } finally { this.boot = null; }
  }

  async launch() {
    await mkdir(this.profileDirectory, { recursive: true, mode: 0o700 });
    this.context = await chromium.launchPersistentContext(this.profileDirectory, {
      headless: true, viewport: { width: WIDTH, height: HEIGHT },
      args: ['--disable-dev-shm-usage'],
      acceptDownloads: false,
    });
    this.page = this.context.pages()[0] || await this.context.newPage();
    // Keep the browser on the user's real ChatGPT session only.
    if (!this.page.url().startsWith(CHATGPT_ORIGIN)) {
      await this.page.goto(CHATGPT_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 45000 });
    }
    this.cdp = await this.context.newCDPSession(this.page);
    await this.cdp.send('Page.enable');
    this.cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
      if (Date.now() - this.lastFrameAt >= 125) {
        this.lastFrame = data;
        this.lastFrameAt = Date.now();
        this.broadcast({ type: 'frame', jpeg: data, width: WIDTH, height: HEIGHT });
      }
      void this.cdp?.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 65, everyNthFrame: 1 });
    await this.snapshot();
  }

  async snapshot() {
    if (!this.page || this.page.isClosed()) return;
    const jpeg = (await this.page.screenshot({ type: 'jpeg', quality: 65, timeout: 10000 })).toString('base64');
    this.lastFrame = jpeg;
    this.broadcast({ type: 'frame', jpeg, width: WIDTH, height: HEIGHT });
  }

  async control(command) {
    if (!this.page || this.page.isClosed()) throw new Error('Browser is not running.');
    if (this.busy) throw new Error('Finish the current prompt before taking manual control.');
    switch (command.type) {
      case 'click': await this.page.mouse.click(Math.round(command.x * WIDTH), Math.round(command.y * HEIGHT)); break;
      case 'move': await this.page.mouse.move(Math.round(command.x * WIDTH), Math.round(command.y * HEIGHT)); break;
      case 'scroll': await this.page.mouse.wheel(command.deltaX, command.deltaY); break;
      case 'key': await this.page.keyboard.press(command.key === ' ' ? 'Space' : command.key); break;
      case 'text': await this.page.keyboard.insertText(command.text); break;
      case 'refresh': await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }); break;
    }
    // CDP generally emits updated frames, but a snapshot also handles static pages.
    void this.snapshot().catch(() => {});
  }

  async runPrompt(prompt, emit) {
    if (this.busy) throw new Error('Another ChatGPT prompt is still running.');
    this.busy = true;
    try {
      if (new URL(this.page.url()).origin !== CHATGPT_ORIGIN) {
        throw new Error('Navigate to ChatGPT and sign in before sending a prompt.');
      }
      const composer = this.page.locator('#prompt-textarea, [data-testid="composer-input"]').first();
      await composer.waitFor({ state: 'visible', timeout: 15000 });
      const replies = this.page.locator('[data-message-author-role="assistant"]');
      const before = await replies.count();
      await composer.fill(prompt);
      await this.page.locator('button[data-testid="send-button"], button[aria-label="Send prompt"]').first().click({ timeout: 12000 });
      emit({ type: 'progress', message: 'Prompt sent; waiting for ChatGPT.' });

      const deadline = Date.now() + 180000;
      let text = '', firstReply = false, lastChange = Date.now();
      while (Date.now() < deadline) {
        const count = await replies.count();
        if (count > before) {
          firstReply = true;
          const reply = replies.last();
          const body = reply.locator('.markdown, [data-message-content]').last();
          const next = ((await body.count()) ? await body.innerText().catch(() => '') : await reply.innerText().catch(() => '')).trim().slice(0, 200000);
          if (next !== text) {
            text = next;
            lastChange = Date.now();
            emit({ type: 'reply', state: 'streaming', text });
          }
          const stopVisible = await this.page.locator('button[data-testid="stop-button"], button[aria-label="Stop generating"]').first().isVisible().catch(() => false);
          if (text && !stopVisible && Date.now() - lastChange > 3000) {
            emit({ type: 'reply', state: 'done', text });
            return;
          }
        }
        await this.page.waitForTimeout(350);
      }
      throw new Error(firstReply ? 'ChatGPT did not finish responding before the timeout.' : 'No assistant reply appeared. Check the browser for login, CAPTCHA, or errors.');
    } finally {
      this.busy = false;
    }
  }

  async close() {
    try { await this.cdp?.send('Page.stopScreencast'); } catch {}
    await this.context?.close();
    this.cdp = null; this.context = null; this.page = null;
  }
}
