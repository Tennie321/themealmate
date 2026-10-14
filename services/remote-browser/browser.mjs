import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { VIEWPORT } from './protocol.mjs';

export class RemoteBrowser {
  constructor(profileId, send) {
    this.profileId = profileId;
    this.send = send;
    this.closed = false;
    this.context = null;
    this.page = null;
    this.cdp = null;
    this.lastFrameAt = 0;
  }
  async start() {
    const folder = join(process.env.BROWSER_DATA_DIR || '/data', 'profiles', this.profileId);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    this.context = await chromium.launchPersistentContext(folder, {
      headless: true,
      viewport: VIEWPORT,
      chromiumSandbox: false, // Dedicated, network-restricted container; never expose the port directly.
      args: ['--disable-dev-shm-usage'],
    });
    if (this.closed) { await this.context.close(); return; }
    this.page = this.context.pages()[0] || await this.context.newPage();
    this.context.on('page', page => { void this.attach(page).catch(() => {}); });
    if (!this.page.url().startsWith('https://chatgpt.com/')) {
      await this.page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
    }
    if (!this.closed) await this.attach(this.page);
  }
  async attach(page) {
    if (this.closed) return;
    if (this.cdp) await this.cdp.detach().catch(() => {});
    this.page = page;
    this.cdp = await this.context.newCDPSession(page);
    const cdp = this.cdp;
    await cdp.send('Page.enable');
    cdp.on('Page.screencastFrame', event => {
      void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
      if (this.closed || cdp !== this.cdp || Date.now() - this.lastFrameAt < 120) return;
      this.lastFrameAt = Date.now();
      this.send({ type: 'frame', mime: 'image/jpeg', data: event.data, width: VIEWPORT.width, height: VIEWPORT.height }, true);
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 62, everyNthFrame: 2 });
  }
  async input(command) {
    if (this.closed || !this.page) throw new Error('Browser is disconnected.');
    if (command.type === 'input.mouse') {
      if (command.action === 'move') await this.page.mouse.move(command.x, command.y);
      else if (command.action === 'down') {
        await this.page.mouse.move(command.x, command.y);
        await this.page.mouse.down({ button: command.button });
      } else await this.page.mouse.up({ button: command.button });
    } else if (command.type === 'input.wheel') {
      await this.page.mouse.wheel(0, command.deltaY);
    } else if (command.type === 'input.key') {
      await this.page.keyboard.press(command.key);
    } else if (command.type === 'input.text') {
      await this.page.keyboard.insertText(command.text);
    } else if (command.type === 'browser.reload') {
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 25_000 });
    }
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.context) await this.context.close().catch(() => {});
    this.cdp = null;
    this.page = null;
  }
}
