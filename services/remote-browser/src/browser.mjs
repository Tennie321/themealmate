import { chromium } from 'playwright';

const CHATGPT_URL = 'https://chatgpt.com/';
const VIEWPORT = { width: 1280, height: 800 };
const poll = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class RemoteBrowser {
  constructor(profileDir) {
    this.profileDir = profileDir;
    this.context = null;
    this.page = null;
    this.creating = null;
    this.busy = false;
    this.cancelled = false;
  }

  async ensure() {
    if (this.page && !this.page.isClosed()) return this.page;
    if (this.creating) return this.creating;
    this.creating = (async () => {
      if (!this.context) {
        this.context = await chromium.launchPersistentContext(this.profileDir, {
          headless: true,
          viewport: VIEWPORT,
          acceptDownloads: false,
          args: ['--disable-dev-shm-usage'],
        });
      }
      this.page = this.context.pages().find((page) => !page.isClosed()) || await this.context.newPage();
      if (this.page.url() === 'about:blank') await this.page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
      return this.page;
    })();
    try { return await this.creating; } finally { this.creating = null; }
  }

  async startFrames(emit) {
    const page = await this.ensure();
    const cdp = await this.context.newCDPSession(page);
    let active = true;
    const onFrame = ({ data, sessionId }) => {
      if (active) emit({ type: 'frame', image: 'data:image/jpeg;base64,' + data });
      void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    };
    cdp.on('Page.screencastFrame', onFrame);
    await cdp.send('Page.enable');
    await cdp.send('Page.startScreencast', {
      format: 'jpeg', quality: 65,
      maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height, everyNthFrame: 1,
    });
    return async () => {
      if (!active) return;
      active = false;
      cdp.off('Page.screencastFrame', onFrame);
      await cdp.send('Page.stopScreencast').catch(() => {});
      await cdp.detach().catch(() => {});
    };
  }

  async input(message) {
    const page = await this.ensure();
    if (message.event === 'pointer') {
      const x = Number(message.x);
      const y = Number(message.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const px = Math.max(0, Math.min(VIEWPORT.width - 1, x));
      const py = Math.max(0, Math.min(VIEWPORT.height - 1, y));
      const button = ['left', 'middle', 'right'].includes(message.button) ? message.button : 'left';
      if (message.action === 'move') await page.mouse.move(px, py);
      else if (message.action === 'down') await page.mouse.down({ button });
      else if (message.action === 'up') await page.mouse.up({ button });
    } else if (message.event === 'wheel') {
      const dx = Math.max(-1000, Math.min(1000, Number(message.dx) || 0));
      const dy = Math.max(-1000, Math.min(1000, Number(message.dy) || 0));
      await page.mouse.wheel(dx, dy);
    } else if (message.event === 'key') {
      if (typeof message.key !== 'string' || message.key.length > 30) return;
      if (message.action === 'down') await page.keyboard.down(message.key);
      else if (message.action === 'up') await page.keyboard.up(message.key);
    } else if (message.event === 'paste') {
      if (typeof message.text !== 'string' || message.text.length > 8000) return;
      await page.keyboard.insertText(message.text);
    }
  }

  async home() {
    if (this.busy) throw new Error('Wait for the active prompt to finish.');
    await (await this.ensure()).goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }

  async reload() {
    if (this.busy) throw new Error('Wait for the active prompt to finish.');
    await (await this.ensure()).reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  }

  async cancel() {
    this.cancelled = true;
    const page = this.page;
    if (!page || page.isClosed()) return;
    const stop = page.locator('button[data-testid="stop-button"], button[aria-label*="Stop" i]').first();
    if (await stop.isVisible().catch(() => false)) await stop.click({ timeout: 2000 }).catch(() => {});
  }

  async runPrompt(prompt, emit) {
    if (this.busy) throw new Error('A prompt is already running.');
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000) throw new Error('Prompt must contain 1-8000 characters.');
    this.busy = true;
    this.cancelled = false;
    try {
      const page = await this.ensure();
      if (!['chatgpt.com', 'www.chatgpt.com'].includes(new URL(page.url()).hostname)) {
        throw new Error('Complete sign-in and open chatgpt.com in the remote browser first.');
      }
      const composer = page.locator(
        '#prompt-textarea, [data-testid="prompt-textarea"], [contenteditable="true"][role="textbox"]',
      ).first();
      await composer.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
        throw new Error('ChatGPT composer is unavailable. Sign in or finish the verification challenge in the browser view.');
      });
      const assistantMessages = page.locator('[data-message-author-role="assistant"]');
      const beforeCount = await assistantMessages.count();
      const beforeText = beforeCount ? await assistantMessages.last().innerText().catch(() => '') : '';
      await composer.fill(prompt.trim());
      const send = page.locator('button[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"]').first();
      if (await send.isVisible().catch(() => false) && await send.isEnabled().catch(() => false)) {
        await send.click();
      } else {
        await composer.press('Enter');
      }
      emit({ type: 'prompt_started' });
      const startedAt = Date.now();
      let lastText = '';
      let stable = 0;
      let sawGeneration = false;
      let observedReply = false;
      while (Date.now() - startedAt < 180000) {
        if (this.cancelled) {
          emit({ type: 'response_cancelled', text: lastText });
          return;
        }
        const count = await assistantMessages.count();
        const current = count ? await assistantMessages.last().innerText().catch(() => '') : '';
        const stopVisible = await page.locator(
          'button[data-testid="stop-button"], button[aria-label*="Stop generating" i], button[aria-label="Stop"]',
        ).first().isVisible().catch(() => false);
        if (stopVisible) sawGeneration = true;
        if ((count > beforeCount || current !== beforeText) && current) observedReply = true;
        if (observedReply && current !== lastText) {
          emit({ type: 'response_update', text: current });
          lastText = current;
          stable = 0;
        } else if (observedReply) stable++;
        // The Stop control is authoritative when present; stable fallback covers UI changes.
        if (observedReply && !stopVisible && stable >= 9 && Date.now() - startedAt >= 3000) {
          emit({ type: 'response_done', text: lastText });
          return;
        }
        await poll(250);
      }
      throw new Error(sawGeneration || observedReply
        ? 'ChatGPT response timed out before completion.'
        : 'No new assistant reply was detected. Check the remote browser.');
    } finally {
      this.busy = false;
      this.cancelled = false;
    }
  }

  async shutdown() {
    await this.context?.close().catch(() => {});
    this.context = null;
    this.page = null;
  }
}
