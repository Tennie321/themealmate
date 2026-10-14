import http from 'node:http';
import { chromium } from 'playwright';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyTicket } from './auth.mjs';

const PORT = Number(process.env.PORT || 8787);
const secret = process.env.ASTRA_BROWSER_SECRET || '';
const allowedOrigin = process.env.ASTRA_BROWSER_ORIGIN || '';
const profilePath = process.env.BROWSER_PROFILE_DIR || '/home/pwuser/astra-browser';
const VIEWPORT = { width: 1280, height: 800 };
const MAX_PROMPT = 8000;
if (secret.length < 32 || !/^https?:\/\/[^/]+$/.test(allowedOrigin)) {
  throw new Error('Set ASTRA_BROWSER_SECRET (32+ characters) and ASTRA_BROWSER_ORIGIN (exact Astra app origin).');
}

let browserContext;
let browserPage;
let browserStarting;
let active;
const usedTickets = new Map();

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}
function error(ws, message) { send(ws, { type: 'error', message }); }
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getPage() {
  if (browserPage && !browserPage.isClosed()) return browserPage;
  if (!browserStarting) {
    browserStarting = (async () => {
      browserContext = await chromium.launchPersistentContext(profilePath, {
        headless: true, viewport: VIEWPORT, acceptDownloads: false,
        args: ['--disable-dev-shm-usage'],
      });
      const page = browserContext.pages()[0] || await browserContext.newPage();
      page.setDefaultTimeout(15_000);
      if (page.url() === 'about:blank') await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
      browserPage = page;
      page.on('close', () => { if (browserPage === page) browserPage = null; });
      return page;
    })().finally(() => { browserStarting = null; });
  }
  return browserStarting;
}

async function streamPage(ws, page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    send(ws, { type: 'frame', jpeg: data, width: VIEWPORT.width, height: VIEWPORT.height });
    void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 65, maxWidth: 1280, maxHeight: 800, everyNthFrame: 1 });
  // CDP does not guarantee a new frame if the initial page is static.
  try { send(ws, { type: 'frame', jpeg: (await page.screenshot({ type: 'jpeg', quality: 65 })).toString('base64'), ...VIEWPORT }); } catch {}
  return async () => {
    try { await cdp.send('Page.stopScreencast'); } catch {}
    try { await cdp.detach(); } catch {}
  };
}
function requireNumber(value, max) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max; }
function isChatGPTUrl(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && (u.hostname === 'chatgpt.com' || u.hostname.endsWith('.chatgpt.com')); }
  catch { return false; }
}

async function executePrompt(ws, page, prompt, state) {
  if (state.job) { error(ws, 'A prompt is already running.'); return; }
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT) { error(ws, 'Prompt must be 1–8000 characters.'); return; }
  const job = new AbortController();
  state.job = job;
  send(ws, { type: 'run_status', state: 'starting' });
  try {
    if (!isChatGPTUrl(page.url())) throw new Error('Finish signing in to ChatGPT in the browser view first.');
    const composer = page.locator('#prompt-textarea, [data-testid="composer-input"], [contenteditable="true"][role="textbox"]').first();
    await composer.waitFor({ state: 'visible', timeout: 12_000 });
    const assistant = page.locator('[data-message-author-role="assistant"]');
    const count = await assistant.count();
    await composer.fill(prompt.trim());
    const sendButton = page.locator('button[data-testid="send-button"]').first();
    if (await sendButton.isVisible().catch(() => false)) await sendButton.click();
    else await composer.press('Enter');
    send(ws, { type: 'run_status', state: 'running' });
    let lastText = '';
    let lastChange = Date.now();
    let startedAt = Date.now();
    let appeared = false;
    while (Date.now() - startedAt < 180_000) {
      if (job.signal.aborted) throw new Error('Prompt stopped.');
      if (await assistant.count() > count) {
        appeared = true;
        const current = await assistant.last().innerText().catch(() => '');
        if (current !== lastText) {
          lastText = current;
          lastChange = Date.now();
          send(ws, { type: 'reply', text: current, done: false });
        }
        const generating = await page.locator('button[data-testid="stop-button"], button[aria-label="Stop generating"]').first().isVisible().catch(() => false);
        if (lastText.trim() && !generating && Date.now() - lastChange > 1500 && Date.now() - startedAt > 2500) {
          send(ws, { type: 'reply', text: lastText, done: true });
          send(ws, { type: 'run_status', state: 'done' });
          return;
        }
      }
      await sleep(200);
    }
    throw new Error(appeared ? 'Response timed out before completion.' : 'No assistant response appeared. Check the ChatGPT page.');
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown browser error';
    error(ws, message);
    send(ws, { type: 'run_status', state: job.signal.aborted ? 'cancelled' : 'error' });
  } finally {
    if (state.job === job) state.job = null;
  }
}

async function control(ws, page, message, state) {
  try {
    switch (message.type) {
      case 'mouse': {
        const { x, y, action } = message;
        if (!requireNumber(x, VIEWPORT.width) || !requireNumber(y, VIEWPORT.height)) return;
        await page.mouse.move(x, y);
        if (action === 'down') await page.mouse.down();
        if (action === 'up') await page.mouse.up();
        return;
      }
      case 'scroll':
        if (Number.isFinite(message.dy) && Math.abs(message.dy) <= 1500) await page.mouse.wheel(0, message.dy);
        return;
      case 'text':
        if (typeof message.text === 'string' && message.text.length <= 1000) await page.keyboard.insertText(message.text);
        return;
      case 'key': {
        const allowed = ['Enter', 'Tab', 'Backspace', 'Delete', 'Escape', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
        if (!allowed.includes(message.key)) return;
        const modifiers = ['Control', 'Meta', 'Alt', 'Shift'].filter(k => message[k.toLowerCase()] === true);
        await page.keyboard.press([...modifiers, message.key].join('+'));
        return;
      }
      case 'navigate':
        await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
        return;
      case 'prompt':
        void executePrompt(ws, page, message.prompt, state);
        return;
      case 'cancel':
        state.job?.abort();
        await page.locator('button[data-testid="stop-button"]').first().click({ timeout: 800 }).catch(() => {});
        return;
      default: error(ws, 'Unsupported browser action.');
    }
  } catch (cause) { error(ws, cause instanceof Error ? cause.message : 'Browser control failed.'); }
}

async function attach(ws) {
  if (active && active !== ws && active.readyState === WebSocket.OPEN) active.close(4001, 'Another controller connected');
  active = ws;
  const state = { job: null };
  let stopStream = null;
  try {
    const page = await getPage();
    if (ws.readyState !== WebSocket.OPEN || active !== ws) return;
    stopStream = await streamPage(ws, page);
    send(ws, { type: 'ready', url: page.url(), width: VIEWPORT.width, height: VIEWPORT.height });
    page.on('framenavigated', onNavigate);
    function onNavigate(frame) { if (frame === page.mainFrame()) send(ws, { type: 'location', url: frame.url() }); }
    ws.on('message', (raw, binary) => {
      if (binary || raw.length > 20_000) return error(ws, 'Invalid browser message.');
      let message;
      try { message = JSON.parse(raw.toString('utf8')); } catch { return error(ws, 'Malformed browser message.'); }
      if (!message || typeof message !== 'object') return;
      void control(ws, page, message, state);
    });
    ws.on('close', () => { state.job?.abort(); page.off('framenavigated', onNavigate); void stopStream?.(); if (active === ws) active = null; });
  } catch (cause) {
    error(ws, cause instanceof Error ? cause.message : 'Browser could not start.');
    ws.close(1011, 'Browser unavailable');
    if (active === ws) active = null;
    if (stopStream) void stopStream();
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/remote-browser/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404); res.end();
});
const sockets = new WebSocketServer({ noServer: true, maxPayload: 20_000 });
server.on('upgrade', (req, socket, head) => {
  let path;
  try { path = new URL(req.url, 'http://localhost').pathname; } catch { socket.destroy(); return; }
  if (path !== '/remote-browser/ws' || req.headers.origin !== allowedOrigin) { socket.destroy(); return; }
  sockets.handleUpgrade(req, socket, head, ws => {
    const timer = setTimeout(() => ws.close(4003, 'Authentication timeout'), 5000);
    ws.once('message', (raw, binary) => {
      clearTimeout(timer);
      let obj;
      try { if (binary || raw.length > 2048) throw Error(); obj = JSON.parse(raw.toString()); } catch { ws.close(4003, 'Invalid ticket'); return; }
      const ticket = verifyTicket(obj?.ticket, secret);
      if (!ticket || usedTickets.has(ticket.nonce)) { ws.close(4003, 'Unauthorized'); return; }
      usedTickets.set(ticket.nonce, ticket.exp);
      for (const [nonce, exp] of usedTickets) if (exp < Date.now()) usedTickets.delete(nonce);
      void attach(ws);
    });
    ws.once('close', () => clearTimeout(timer));
  });
});
server.listen(PORT, '0.0.0.0', () => console.log('Remote browser listening on port', PORT));
async function shutdown() {
  active?.close(1001, 'Server shutting down');
  server.close();
  await browserContext?.close().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });
