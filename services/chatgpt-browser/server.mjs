import http from 'node:http';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyTicket } from './auth.mjs';

const port = Number(process.env.PORT || 8788);
const origin = process.env.ASTRA_BROWSER_ALLOWED_ORIGIN;
const secret = process.env.ASTRA_BROWSER_TOKEN_SECRET;
const profile = process.env.BROWSER_PROFILE_DIR || '/profiles/owner';
const viewport = { width: 1280, height: 800 };
if (!origin || !/^https?:\/\//.test(origin) || !secret || secret.length < 32) {
  throw new Error('Set ASTRA_BROWSER_ALLOWED_ORIGIN and a 32+ character ASTRA_BROWSER_TOKEN_SECRET.');
}
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
fs.chmodSync(profile, 0o700);

let contextPromise;
let selectedPage;
let controllerSocket = null;
let activeJob = null;
const usedTickets = new Set();
let lastTicketSweep = Date.now();

function emit(ws, message) {
  if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 4_000_000) {
    ws.send(JSON.stringify(message));
  }
}
function errorMessage(reason) {
  return reason instanceof Error ? reason.message : 'Browser operation failed.';
}
async function getBrowser() {
  if (!contextPromise) {
    contextPromise = chromium.launchPersistentContext(profile, {
      headless: true, viewport, acceptDownloads: false,
      args: ['--disable-dev-shm-usage'],
    }).catch(reason => { contextPromise = undefined; throw reason; });
  }
  const context = await contextPromise;
  if (!selectedPage || selectedPage.isClosed()) {
    selectedPage = context.pages().find(page => !page.isClosed()) || await context.newPage();
    selectedPage.setDefaultTimeout(15_000);
    if (selectedPage.url() === 'about:blank') {
      await selectedPage.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    }
  }
  return selectedPage;
}
function onStatus(ws, page) {
  // Never forward OAuth codes, state parameters or prompt-bearing query strings.
  let location = 'Browser';
  try { location = new URL(page.url()).hostname || 'Browser'; } catch { /* blank page */ }
  emit(ws, { type: 'status', url: location, busy: Boolean(activeJob) });
}
async function startScreen(ws, page) {
  const session = await page.context().newCDPSession(page);
  let lastFrame = 0;
  session.on('Page.screencastFrame', async event => {
    try {
      if (ws.readyState === WebSocket.OPEN && Date.now() - lastFrame >= 120 && ws.bufferedAmount < 2_000_000) {
        lastFrame = Date.now();
        emit(ws, { type: 'frame', jpeg: event.data, width: viewport.width, height: viewport.height });
      }
      await session.send('Page.screencastFrameAck', { sessionId: event.sessionId });
    } catch { /* A detached session is expected when the socket closes. */ }
  });
  await session.send('Page.startScreencast', { format: 'jpeg', quality: 65, maxWidth: viewport.width, maxHeight: viewport.height, everyNthFrame: 2 });
  return async () => {
    await session.send('Page.stopScreencast').catch(() => {});
    await session.detach().catch(() => {});
  };
}
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function executePrompt(ws, page, command) {
  if (activeJob) return emit(ws, { type: 'error', message: 'An automation run is already active.', id: command.id });
  const prompt = typeof command.prompt === 'string' ? command.prompt.trim() : '';
  if (!prompt || prompt.length > 8000 || typeof command.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(command.id)) {
    return emit(ws, { type: 'error', message: 'Enter a prompt up to 8,000 characters.', id: command.id });
  }
  if (!/^https:\/\/(chatgpt\.com|chat\.openai\.com)(\/|$)/.test(page.url())) {
    return emit(ws, { type: 'error', message: 'Open ChatGPT and finish signing in before sending prompts.', id: command.id });
  }
  const job = { id: command.id, cancelled: false };
  activeJob = job;
  emit(ws, { type: 'run:start', id: job.id });
  try {
    const answers = page.locator('[data-message-author-role="assistant"]');
    const priorCount = await answers.count();
    const composer = page.locator('#prompt-textarea, [data-testid="prompt-textarea"]').first();
    await composer.waitFor({ state: 'visible', timeout: 15_000 });
    if (job.cancelled) throw new Error('Run cancelled.');
    await composer.fill(prompt);
    const send = page.locator('button[data-testid="send-button"]').first();
    await send.waitFor({ state: 'visible', timeout: 15_000 });
    await send.click({ timeout: 15_000 });
    let previous = '';
    let lastChange = Date.now();
    let received = false;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 180_000) {
      if (job.cancelled || ws.readyState !== WebSocket.OPEN) throw new Error('Run cancelled.');
      if (await answers.count() > priorCount) {
        const text = await answers.nth(priorCount).innerText().catch(() => '');
        if (text && text !== previous) {
          const delta = text.startsWith(previous) ? text.slice(previous.length) : null;
          emit(ws, delta === null ? { type: 'run:replace', id: job.id, text } : { type: 'run:delta', id: job.id, text: delta });
          previous = text;
          received = true;
          lastChange = Date.now();
        }
      }
      const stopping = await page.locator('button[data-testid="stop-button"], button[aria-label="Stop streaming"]').first().isVisible().catch(() => false);
      if (received && !stopping && Date.now() - lastChange > 1800) {
        emit(ws, { type: 'run:done', id: job.id, text: previous });
        return;
      }
      await pause(200);
    }
    throw new Error('ChatGPT did not finish within three minutes. Check the browser view.');
  } catch (reason) {
    emit(ws, { type: 'run:error', id: job.id, message: errorMessage(reason) });
  } finally {
    if (activeJob === job) activeJob = null;
    onStatus(ws, page);
  }
}
async function onCommand(ws, page, raw) {
  let message;
  try { message = JSON.parse(raw.toString()); } catch { return emit(ws, { type: 'error', message: 'Invalid message.' }); }
  if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
    return emit(ws, { type: 'error', message: 'Invalid command.' });
  }
  if (message.type === 'status') return onStatus(ws, page);
  if (message.type === 'stop') {
    if (activeJob) {
      activeJob.cancelled = true;
      await page.locator('button[data-testid="stop-button"]').first().click({ timeout: 1000 }).catch(() => {});
    }
    return;
  }
  if (message.type === 'run') { void executePrompt(ws, page, message); return; }
  if (activeJob) return emit(ws, { type: 'error', message: 'Browser interaction is paused during automation.' });
  if (message.type === 'home') {
    await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } else if (message.type === 'mouse') {
    const x = Number(message.x);
    const y = Number(message.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > viewport.width || y < 0 || y > viewport.height) return;
    if (message.action === 'click') await page.mouse.click(x, y);
    else if (message.action === 'move') await page.mouse.move(x, y);
    else if (message.action === 'down') await page.mouse.move(x, y).then(() => page.mouse.down());
    else if (message.action === 'up') await page.mouse.move(x, y).then(() => page.mouse.up());
  } else if (message.type === 'scroll') {
    const deltaY = Number(message.deltaY);
    if (Number.isFinite(deltaY) && Math.abs(deltaY) <= 1600) await page.mouse.wheel(0, deltaY);
  } else if (message.type === 'type' && typeof message.text === 'string' && message.text.length <= 2000) {
    await page.keyboard.insertText(message.text);
  } else if (message.type === 'key' && typeof message.key === 'string' &&
    /^(Enter|Escape|Tab|Backspace|Delete|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|Space|Shift\+Enter)$/.test(message.key)) {
    await page.keyboard.press(message.key);
  }
  onStatus(ws, page);
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end('{"ok":true}');
    return;
  }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({
  noServer: true, maxPayload: 32_768, perMessageDeflate: false,
  handleProtocols: protocols => protocols.has('astra.browser.v1') ? 'astra.browser.v1' : false,
});
server.on('upgrade', (req, socket, head) => {
  const suppliedOrigin = req.headers.origin;
  const path = req.url?.split('?')[0];
  const protocols = String(req.headers['sec-websocket-protocol'] || '').split(',').map(value => value.trim());
  const ticket = protocols.find(value => value.startsWith('ticket.'))?.slice(7);
  if (Date.now() - lastTicketSweep > 60_000) { usedTickets.clear(); lastTicketSweep = Date.now(); }
  if (path !== '/socket' || suppliedOrigin !== origin || !protocols.includes('astra.browser.v1') ||
    !verifyTicket(ticket, { secret, origin: suppliedOrigin, used: usedTickets })) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});
wss.on('connection', async ws => {
  if (controllerSocket && controllerSocket.readyState === WebSocket.OPEN) {
    controllerSocket.close(4001, 'Another authorized browser controller connected.');
  }
  controllerSocket = ws;
  let stopScreen = async () => {};
  let page;
  try {
    page = await getBrowser();
    if (ws.readyState !== WebSocket.OPEN) return;
    stopScreen = await startScreen(ws, page);
    onStatus(ws, page);
  } catch (reason) {
    emit(ws, { type: 'error', message: 'Unable to launch remote browser: ' + errorMessage(reason) });
    ws.close(1011, 'Browser unavailable');
  }
  ws.on('message', raw => {
    if (!page || controllerSocket !== ws) return;
    void onCommand(ws, page, raw).catch(reason => emit(ws, { type: 'error', message: errorMessage(reason) }));
  });
  ws.on('close', () => {
    if (controllerSocket === ws) {
      controllerSocket = null;
      if (activeJob) activeJob.cancelled = true;
    }
    void stopScreen();
  });
});
server.listen(port, '0.0.0.0', () => console.log('Astra browser service listening on port ' + port));
process.on('SIGTERM', () => { server.close(); void contextPromise?.then(ctx => ctx.close()).finally(() => process.exit(0)); });
