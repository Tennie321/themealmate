import http from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { WebSocket, WebSocketServer } from 'ws';
import { isAllowedOrigin, parseAction, verifyTicket } from './protocol.mjs';
import { executePrompt } from './prompt.mjs';

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.ASTRA_BROWSER_SHARED_SECRET || '';
const ORIGIN = process.env.ASTRA_ALLOWED_ORIGIN || '';
const PROFILE_DIR = resolve(process.env.BROWSER_PROFILE_DIR || '/data/profile');
const VIEWPORT = { width: 1280, height: 800 };
if (SECRET.length < 32 || !/^https?:\/\/[^/]+$/.test(ORIGIN) || !Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error('Set ASTRA_BROWSER_SHARED_SECRET (32+ chars), ASTRA_ALLOWED_ORIGIN (exact origin), and a valid PORT.');
  process.exit(1);
}

const tickets = new Map();
const server = http.createServer((req, res) => {
  if (req.url === '/healthz' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end('{"ok":true}');
  } else { res.writeHead(404); res.end(); }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 16_384, perMessageDeflate: false });
server.on('upgrade', (req, socket, head) => {
  const reject = status => socket.end('HTTP/1.1 ' + status + '\r\nConnection: close\r\n\r\n');
  if (!isAllowedOrigin(req.headers.origin, ORIGIN)) return reject('403 Forbidden');
  let uri;
  try { uri = new URL(req.url || '/', 'http://localhost'); }
  catch { return reject('400 Bad Request'); }
  if (uri.pathname !== '/control') return reject('404 Not Found');
  const token = verifyTicket(uri.searchParams.get('ticket'), SECRET);
  if (!token || tickets.has(token.nonce)) return reject('401 Unauthorized');
  for (const [nonce, expiry] of tickets) if (expiry < Date.now()) tickets.delete(nonce);
  tickets.set(token.nonce, token.expires);
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});

await mkdir(PROFILE_DIR, { recursive: true });
const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: true, viewport: VIEWPORT, acceptDownloads: false,
  chromiumSandbox: false, args: ['--disable-dev-shm-usage'],
});
let page = context.pages().find(p => p.url().startsWith('https://chatgpt.com')) || context.pages()[0] || await context.newPage();
if (page.url() === 'about:blank') await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});

let owner = null;
let cdp = null;
let busy = false;
let currentAbort = null;
function send(ws, payload) {
  if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 2_000_000) ws.send(JSON.stringify(payload));
}
async function stopScreen() {
  if (!cdp) return;
  const previous = cdp;
  cdp = null;
  await previous.send('Page.stopScreencast').catch(() => {});
  await previous.detach().catch(() => {});
}
async function startScreen(ws) {
  await stopScreen();
  if (ws !== owner || ws.readyState !== WebSocket.OPEN || page.isClosed()) return;
  const connection = await context.newCDPSession(page);
  cdp = connection;
  connection.on('Page.screencastFrame', ({ data, sessionId }) => {
    void connection.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    if (ws === owner && connection === cdp) send(ws, { type: 'frame', data, width: VIEWPORT.width, height: VIEWPORT.height });
  });
  await connection.send('Page.enable');
  await connection.send('Page.startScreencast', { format: 'jpeg', quality: 65, maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height, everyNthFrame: 2 });
  send(ws, { type: 'ready', url: page.url(), width: VIEWPORT.width, height: VIEWPORT.height });
}
context.on('page', next => {
  page = next;
  if (owner) void startScreen(owner).catch(() => send(owner, { type: 'error', message: 'Could not display the active tab.' }));
});
context.on('close', () => send(owner, { type: 'error', message: 'Browser exited. Restart the service.' }));

async function handle(ws, raw) {
  let action;
  try { action = parseAction(raw); }
  catch (e) { return send(ws, { type: 'error', message: e.message }); }
  if (owner !== ws) return;
  if (action.type === 'cancel') { currentAbort?.abort(); return; }
  if (busy) return send(ws, { type: 'error', message: 'A prompt is running. Cancel monitoring before taking control.' });
  try {
    if (action.type === 'click') await page.mouse.click(action.x, action.y);
    else if (action.type === 'down') { await page.mouse.move(action.x, action.y); await page.mouse.down(); }
    else if (action.type === 'up') { await page.mouse.move(action.x, action.y); await page.mouse.up(); }
    else if (action.type === 'move') await page.mouse.move(action.x, action.y);
    else if (action.type === 'scroll') await page.mouse.wheel(action.deltaX, action.deltaY);
    else if (action.type === 'type') await page.keyboard.insertText(action.text);
    else if (action.type === 'key') await page.keyboard.press(action.key);
    else if (action.type === 'run_prompt') {
      busy = true;
      const controller = new AbortController();
      currentAbort = controller;
      try {
        await executePrompt(page, action.prompt, evt => send(ws, { ...evt, requestId: action.requestId }), controller.signal);
      } catch (e) {
        send(ws, { type: 'prompt_error', requestId: action.requestId, message: e.message });
      } finally { busy = false; currentAbort = null; }
    }
  } catch (e) {
    send(ws, { type: 'error', message: 'Browser interaction failed. Reconnect and try again.' });
  }
}

wss.on('connection', ws => {
  if (owner && owner.readyState === WebSocket.OPEN) owner.close(4001, 'Controller replaced');
  currentAbort?.abort();
  owner = ws;
  void startScreen(ws).catch(() => send(ws, { type: 'error', message: 'Browser screen unavailable.' }));
  ws.on('message', (data, binary) => {
    if (binary) { ws.close(1003, 'Text messages only'); return; }
    void handle(ws, data.toString());
  });
  ws.on('close', () => {
    if (ws !== owner) return;
    owner = null;
    currentAbort?.abort();
    void stopScreen();
  });
});
server.listen(PORT, '0.0.0.0', () => console.log('Remote browser listening on port ' + PORT));
async function shutdown() {
  currentAbort?.abort();
  wss.close();
  await context.close().catch(() => {});
  server.close();
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
