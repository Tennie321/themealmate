import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { WebSocketServer, WebSocket } from 'ws';
import { runPrompt } from './automation.js';
import {
  SESSION_COOKIE, SESSION_SECONDS, constantEqual, cookieValue, createSession,
  sameOrigin, safeMessage, validPrompt, validateConfig, verifySession,
} from './security.js';

validateConfig(process.env);
const PORT = Number(process.env.PORT || 8787);
const PROFILE_DIR = path.resolve(process.env.PROFILE_DIR || './profile');
const CHATGPT = 'https://chatgpt.com/';
const clients = new Set();
const attempts = new Map();
const wss = new WebSocketServer({ noServer: true, maxPayload: 25000, perMessageDeflate: false });
let context;
let page;
let cdp;
let busy = false;
let controller = null;
let lastRun = null;
let lastFrameAt = 0;

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 2_000_000) {
    ws.send(JSON.stringify(data));
  }
}
function broadcast(data) { for (const ws of clients) send(ws, data); }
function status() {
  return { type: 'status', ready: Boolean(page && !page.isClosed()), busy,
    url: page?.url() || null, run: lastRun };
}
function error(ws, message) { send(ws, { type: 'error', message }); }
function authenticated(req) {
  return verifySession(cookieValue(req.headers.cookie), process.env.REMOTE_BROWSER_SESSION_SECRET);
}
function json(res, code, payload, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(payload));
}
function requestBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 4096) { reject(new Error('Request too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}
function cookie(req, value, maxAge = SESSION_SECONDS) {
  const secure = req.headers.origin?.startsWith('https://') ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; HttpOnly; Path=/browser; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (pathname === '/health' && req.method === 'GET') return json(res, page ? 200 : 503, { ok: Boolean(page) });
  if (pathname === '/status' && req.method === 'GET') {
    return json(res, 200, authenticated(req) ? { authenticated: true, ...status() } : { authenticated: false });
  }
  if ((pathname === '/auth' || pathname === '/auth/logout') && req.method === 'POST') {
    if (!sameOrigin(req)) return json(res, 403, { error: 'Origin mismatch' });
    if (pathname === '/auth/logout') {
      return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });
    }
    const ip = req.socket.remoteAddress || 'unknown';
    const prev = attempts.get(ip) || { count: 0, until: Date.now() + 900_000 };
    if (Date.now() > prev.until) { prev.count = 0; prev.until = Date.now() + 900_000; }
    if (prev.count >= 8) return json(res, 429, { error: 'Too many attempts. Try again later.' });
    let input;
    try { input = await requestBody(req); }
    catch { return json(res, 400, { error: 'Invalid request' }); }
    if (typeof input?.code !== 'string' || !constantEqual(input.code, process.env.REMOTE_BROWSER_ACCESS_CODE)) {
      prev.count++; attempts.set(ip, prev);
      return json(res, 401, { error: 'Invalid remote-browser access code.' });
    }
    attempts.delete(ip);
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, createSession(process.env.REMOTE_BROWSER_SESSION_SECRET)) });
  }
  return json(res, 404, { error: 'Not found' });
});

server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (pathname !== '/ws' || !sameOrigin(req) || !authenticated(req)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});

async function attachScreen() {
  if (cdp) await cdp.detach().catch(() => {});
  cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', async frame => {
    try {
      const now = Date.now();
      if (now - lastFrameAt >= 120 && clients.size) {
        lastFrameAt = now;
        broadcast({ type: 'frame', image: frame.data });
      }
    } finally {
      await cdp?.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
    }
  });
  await cdp.send('Page.enable');
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60,
    maxWidth: 1280, maxHeight: 800, everyNthFrame: 1 });
}
async function selectPage(next) {
  if (page === next && cdp) return;
  page = next;
  next.on('framenavigated', frame => {
    if (page === next && frame === next.mainFrame()) broadcast(status());
  });
  next.on('close', () => {
    if (page !== next) return;
    page = null;
    broadcast(status());
    void (async () => {
      const fallback = context.pages().filter(p => !p.isClosed()).at(-1) || await context.newPage();
      await selectPage(fallback);
      if (fallback.url() === 'about:blank') await fallback.goto(CHATGPT, { waitUntil: 'domcontentloaded', timeout: 30000 });
    })().catch(reason => console.error('Browser tab recovery:', reason.message));
  });
  await attachScreen();
  broadcast(status());
}
async function openBrowser() {
  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true, viewport: { width: 1280, height: 800 },
    acceptDownloads: false, locale: 'en-US',
  });
  await selectPage(context.pages()[0] || await context.newPage());
  context.on('page', next => {
    void selectPage(next).catch(reason => console.error('New browser tab:', reason.message));
  });
  if (page.url() === 'about:blank') {
    await page.goto(CHATGPT, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(reason => {
      console.error('Initial ChatGPT navigation:', reason.message);
    });
  }
  broadcast(status());
}
async function interact(ws, m) {
  if (!page || page.isClosed()) return error(ws, 'Browser is starting. Try again.');
  switch (m.type) {
    case 'pointer': {
      const x = Number(m.x), y = Number(m.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1280 || y < 0 || y > 800) return;
      if (m.action === 'move') await page.mouse.move(x, y);
      else if (m.action === 'down' || m.action === 'up') {
        await page.mouse.move(x, y);
        const opts = { button: ['left', 'right', 'middle'].includes(m.button) ? m.button : 'left' };
        if (m.action === 'down') await page.mouse.down(opts);
        else await page.mouse.up(opts);
      }
      else if (m.action === 'scroll') await page.mouse.wheel(Math.max(-1500, Math.min(1500, Number(m.dx) || 0)), Math.max(-1500, Math.min(1500, Number(m.dy) || 0)));
      break;
    }
    case 'key':
      if (typeof m.key === 'string' && m.key.length < 50) {
        await page.keyboard.press(m.key);
      }
      break;
    case 'insert':
      if (typeof m.text === 'string' && m.text.length <= 8000) await page.keyboard.insertText(m.text);
      break;
    case 'navigate':
      // No arbitrary URL navigation API: only the real ChatGPT origin.
      await page.goto(CHATGPT, { waitUntil: 'domcontentloaded', timeout: 30000 });
      broadcast(status());
      break;
    case 'run':
      if (busy) return error(ws, 'A prompt is already running.');
      if (!validPrompt(m.prompt)) return error(ws, 'Prompt must be 1–8000 characters.');
      busy = true;
      controller = new AbortController();
      const runId = String(m.runId || '').slice(0, 80) || randomUUID();
      lastRun = { runId, state: 'running', text: '' };
      broadcast(status());
      try {
        const output = await runPrompt(page, m.prompt, text => {
          lastRun = { runId, state: 'running', text };
          broadcast({ type: 'response', ...lastRun });
        }, controller.signal);
        lastRun = { runId, state: 'complete', text: output };
        broadcast({ type: 'response', ...lastRun });
      } catch (reason) {
        lastRun = { runId, state: controller.signal.aborted ? 'cancelled' : 'error',
          text: lastRun.text, error: reason.message || 'Automation failed' };
        broadcast({ type: 'response', ...lastRun });
      } finally {
        busy = false;
        controller = null;
        broadcast(status());
      }
      break;
    case 'cancel':
      if (controller) controller.abort();
      break;
    default: error(ws, 'Unknown action.');
  }
}
wss.on('connection', ws => {
  clients.add(ws);
  send(ws, status());
  if (page && !page.isClosed()) {
    void page.screenshot({ type: 'jpeg', quality: 60 })
      .then(bytes => send(ws, { type: 'frame', image: bytes.toString('base64') }))
      .catch(() => {});
  }
  ws.on('message', raw => {
    const m = safeMessage(raw.toString());
    if (!m) return error(ws, 'Invalid message.');
    void interact(ws, m).catch(reason => error(ws, reason.message || 'Browser action failed.'));
  });
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

process.on('SIGTERM', async () => {
  controller?.abort();
  for (const ws of clients) ws.close(1001, 'Server shutting down');
  await context?.close().catch(() => {});
  server.close();
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Astra remote browser listening on ${PORT}`);
  void openBrowser().catch(reason => console.error('Browser launch failed:', reason.message));
});
