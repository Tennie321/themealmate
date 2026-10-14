import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { WebSocket, WebSocketServer } from 'ws';
import { executePrompt } from './automation.mjs';
import { VIEWPORT, allowedOrigin, equalSecret, isAllowedNavigation, isPrivateHost, parseCommand } from './protocol.mjs';

const token = process.env.BROWSER_CONTROL_TOKEN || '';
const origins = (process.env.BROWSER_ALLOWED_ORIGINS || '').split(',').map((part) => part.trim()).filter(Boolean);
const port = Number(process.env.BROWSER_PORT || 8787);
const host = process.env.BROWSER_HOST || '127.0.0.1';
if (token.length < 32 || !origins.length) {
  console.error('BROWSER_CONTROL_TOKEN (32+ characters) and BROWSER_ALLOWED_ORIGINS are required.');
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid BROWSER_PORT');

let context, page, cdp, startup, activeSocket, activeRun;
const profile = (process.env.BROWSER_PROFILE_ID || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
if (!profile) throw new Error('Invalid BROWSER_PROFILE_ID');
const profilePath = resolve(process.env.BROWSER_DATA_DIR || '/data/profiles', profile);
const server = createServer(onHttp);
const wss = new WebSocketServer({ noServer: true, maxPayload: 16384 });

function send(socket, data) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
}
function status() {
  return { type: 'status', state: activeRun ? 'running' : page ? 'ready' : 'starting', url: page?.url() || 'https://chatgpt.com/' };
}
async function ensureBrowser() {
  if (page && !page.isClosed()) return page;
  if (startup) return startup;
  startup = (async () => {
    await mkdir(profilePath, { recursive: true, mode: 0o700 });
    context = await chromium.launchPersistentContext(profilePath, {
      headless: true,
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      acceptDownloads: false,
      chromiumSandbox: false,
      args: ['--disable-dev-shm-usage'],
    });
    const newPage = context.pages()[0] || await context.newPage();
    // The interactive browser can visit ChatGPT and well-known identity providers only.
    // Never allow a top-level navigation to an arbitrary host or requests to local networks.
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = request.url();
      if (isPrivateHost(url) || (request.isNavigationRequest() &&
          request.frame() === newPage.mainFrame() && !isAllowedNavigation(url))) {
        await route.abort('blockedbyclient');
      } else await route.continue();
    });
    page = newPage;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) send(activeSocket, status());
    });
    if (!isAllowedNavigation(page.url())) await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
      // Always ack frames to prevent the CDP producer stalling on slow consumers.
      send(activeSocket, { type: 'frame', data, mime: 'image/jpeg', width: VIEWPORT.width, height: VIEWPORT.height });
      await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    return page;
  })();
  try { return await startup; }
  catch (error) {
    await context?.close().catch(() => {});
    context = undefined; page = undefined; cdp = undefined;
    throw error;
  } finally { startup = undefined; }
}
async function activate(socket) {
  await ensureBrowser();
  if (socket.readyState !== WebSocket.OPEN) return;
  if (activeSocket && activeSocket !== socket) activeSocket.close(4000, 'Replaced by new controller');
  activeSocket = socket;
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 65, everyNthFrame: 2 });
  send(socket, status());
}
async function run(text, onUpdate, onDone) {
  if (activeRun) throw new Error('Another prompt is already running.');
  const controller = new AbortController();
  activeRun = controller;
  try {
    await ensureBrowser();
    const answer = await executePrompt(page, text, onUpdate, controller.signal);
    onDone({ type: 'done', text: answer });
  } catch (error) {
    onDone({ type: 'error', error: error instanceof Error ? error.message : 'Automation failed' });
  } finally {
    if (activeRun === controller) activeRun = undefined;
    send(activeSocket, status());
  }
}
async function dispatch(socket, message) {
  if (message.type === 'status') return send(socket, status());
  if (!page || page.isClosed()) return send(socket, { type: 'error', error: 'Browser is not ready' });
  if (message.type === 'cancel') {
    if (activeRun) activeRun.abort();
    return;
  }
  if (message.type === 'prompt') {
    if (activeRun) return send(socket, { type: 'error', error: 'A prompt is already running.' });
    void run(message.text, (text) => send(socket, { type: 'response', text }),
      (event) => send(socket, event));
    return;
  }
  if (activeRun) return send(socket, { type: 'error', error: 'Wait for the active prompt or cancel it.' });
  if (message.type === 'pointer') {
    await page.mouse.move(message.x, message.y);
    if (message.action === 'down') await page.mouse.down();
    else if (message.action === 'up') await page.mouse.up();
    else if (message.action === 'click') await page.mouse.click(message.x, message.y);
  } else if (message.type === 'wheel') {
    await page.mouse.wheel(message.dx, message.dy);
  } else if (message.type === 'key') {
    await page.keyboard.press(message.key);
  } else if (message.type === 'type') {
    await page.keyboard.insertText(message.text);
  }
}
wss.on('connection', (socket) => {
  let authed = false;
  const timeout = setTimeout(() => { if (!authed) socket.close(1008, 'Authentication required'); }, 8000);
  socket.on('message', async (raw, binary) => {
    try {
      if (binary) throw new Error('Binary commands unsupported');
      const command = parseCommand(raw);
      if (!authed) {
        if (command.type !== 'auth' || !equalSecret(command.token, token)) {
          socket.close(1008, 'Unauthorized');
          return;
        }
        authed = true;
        clearTimeout(timeout);
        send(socket, { type: 'authenticated' });
        await activate(socket);
        return;
      }
      if (activeSocket !== socket) throw new Error('Controller is not active');
      await dispatch(socket, command);
    } catch (error) {
      send(socket, { type: 'error', error: error instanceof Error ? error.message : 'Invalid command' });
    }
  });
  socket.on('close', () => {
    clearTimeout(timeout);
    if (activeSocket === socket) {
      activeSocket = undefined;
      activeRun?.abort();
      void cdp?.send('Page.stopScreencast').catch(() => {});
    }
  });
  socket.on('error', () => {});
});
server.on('upgrade', (request, socket, head) => {
  let path;
  try { path = new URL(request.url || '', 'http://localhost').pathname; }
  catch { socket.destroy(); return; }
  if (path !== '/ws' || !allowedOrigin(request.headers.origin, origins)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (client) => wss.emit('connection', client, request));
});
async function onHttp(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, headers); res.end(JSON.stringify({ ok: true, browser: page && !page.isClosed() ? 'ready' : 'idle' })); return;
  }
  if (url.pathname !== '/api/browser/prompt' || req.method !== 'POST') {
    res.writeHead(404, headers); res.end(JSON.stringify({ error: 'Not found' })); return;
  }
  if ((req.headers.origin && !allowedOrigin(req.headers.origin, origins)) ||
      !equalSecret((req.headers.authorization || '').replace(/^Bearer /, ''), token)) {
    res.writeHead(403, headers); res.end(JSON.stringify({ error: 'Forbidden' })); return;
  }
  if (activeRun) {
    res.writeHead(409, headers); res.end(JSON.stringify({ error: 'Prompt already running' })); return;
  }
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk.toString();
      if (body.length > 10000) throw new Error('Request too large');
    }
    const parsed = JSON.parse(body);
    const command = parseCommand(Buffer.from(JSON.stringify({ type: 'prompt', text: parsed.prompt })));
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
    res.write(': connected\n\n');
    res.on('close', () => activeRun?.abort());
    void run(command.text,
      (text) => res.write('data: ' + JSON.stringify({ type: 'response', text }) + '\n\n'),
      (event) => { res.write('data: ' + JSON.stringify(event) + '\n\n'); res.end(); });
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(400, headers);
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid request' }));
    }
  }
}
server.listen(port, host, () => console.log('Browser control service listening on ' + host + ':' + port));
async function shutdown() {
  activeRun?.abort();
  activeSocket?.close(1001, 'Server stopping');
  server.close();
  await context?.close().catch(() => {});
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
