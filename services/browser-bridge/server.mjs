import http from 'node:http';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { WebSocket, WebSocketServer } from 'ws';
import { parseMessage, profilePath, verifyTicket, VIEWPORT } from './security.mjs';

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.ASTRA_SESSION_SECRET || '';
const ORIGIN = process.env.APP_ORIGIN || '';
const PROFILE_ROOT = process.env.PROFILE_ROOT || '/data/profiles';
if (SECRET.length < 32 || !/^https?:\/\/[^/]+$/.test(ORIGIN)) {
  throw new Error('Set ASTRA_SESSION_SECRET (32+ chars) and APP_ORIGIN (exact Astra origin).');
}
const server = http.createServer((request, response) => {
  if (request.url === '/healthz' && request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  response.writeHead(404);
  response.end();
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 12_000, perMessageDeflate: false });
const owners = new Map();

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 2_000_000) {
    ws.send(JSON.stringify(payload));
  }
}
function problem(ws, message) { send(ws, { type: 'error', message }); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function stopped(run) { if (run.cancelled) throw new Error('Automation cancelled.'); }

async function automate(session, text) {
  if (session.run) { problem(session.ws, 'An automation is already running.'); return; }
  const run = { id: randomUUID(), cancelled: false };
  session.run = run;
  const page = session.page;
  send(session.ws, { type: 'run', status: 'started', runId: run.id });
  try {
    if (!page || page.isClosed()) throw new Error('Browser page is unavailable.');
    if (!new URL(page.url()).hostname.endsWith('chatgpt.com')) {
      throw new Error('Open ChatGPT in the browser and sign in first.');
    }
    const assistantSelector = '[data-message-author-role="assistant"]';
    const replies = page.locator(assistantSelector);
    const countBefore = await replies.count();
    const stopButton = page.locator('[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label^="Stop"]');
    if (await stopButton.first().isVisible().catch(() => false)) throw new Error('ChatGPT is already generating a reply.');

    const composer = page.locator('#prompt-textarea, [data-testid="prompt-textarea"]').first();
    await composer.waitFor({ state: 'visible', timeout: 12_000 });
    stopped(run);
    await composer.fill(text);
    const sendButton = page.locator('[data-testid="send-button"], button[aria-label="Send prompt"]').first();
    if (await sendButton.isVisible().catch(() => false) && await sendButton.isEnabled()) {
      await sendButton.click();
    } else {
      await composer.press('Enter');
    }
    const started = Date.now();
    let lastText = '';
    let lastChange = started;
    let sawReply = false;
    let sawStop = false;
    while (Date.now() - started < 180_000) {
      stopped(run);
      if (session.page !== page || page.isClosed()) throw new Error('Browser tab changed during automation.');
      const count = await replies.count();
      if (count > countBefore) {
        sawReply = true;
        const current = (await replies.last().innerText().catch(() => '')).trim();
        if (current !== lastText) {
          lastText = current;
          lastChange = Date.now();
          send(session.ws, { type: 'output', runId: run.id, text: current });
        }
      }
      const generating = await stopButton.first().isVisible().catch(() => false);
      if (generating) sawStop = true;
      if (sawReply && lastText && !generating &&
          Date.now() - lastChange > (sawStop ? 1_800 : 4_000) &&
          Date.now() - started > 3_500) {
        send(session.ws, { type: 'run', runId: run.id, status: 'completed', text: lastText });
        return;
      }
      await sleep(250);
    }
    throw new Error('Timed out waiting for ChatGPT. The partial response is shown above.');
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Automation failed';
    send(session.ws, { type: 'run', runId: run.id, status: run.cancelled ? 'cancelled' : 'failed', message: reason });
  } finally {
    if (session.run === run) session.run = null;
  }
}

async function activatePage(session, page) {
  if (session.ws.readyState !== WebSocket.OPEN) return;
  if (session.cdp) {
    await session.cdp.send('Page.stopScreencast').catch(() => {});
    await session.cdp.detach().catch(() => {});
  }
  session.page = page;
  page.on('download', download => { void download.cancel().catch(() => {}); });
  page.on('close', () => { if (session.page === page) problem(session.ws, 'Browser tab closed. Reconnect to reopen it.'); });
  const cdp = await session.context.newCDPSession(page);
  session.cdp = cdp;
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    send(session.ws, { type: 'frame', data });
  });
  await cdp.send('Page.enable');
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 65, everyNthFrame: 2 });
  send(session.ws, { type: 'ready', width: VIEWPORT.width, height: VIEWPORT.height, url: page.url() });
}

async function openBrowser(session) {
  const directory = profilePath(PROFILE_ROOT, session.subject);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  session.context = await chromium.launchPersistentContext(directory, {
    headless: true, viewport: VIEWPORT, acceptDownloads: false,
    permissions: [], args: ['--disable-dev-shm-usage'],
  });
  if (session.ws.readyState !== WebSocket.OPEN) { await session.context.close(); return; }
  const pages = session.context.pages();
  const page = pages.find(item => !item.isClosed() && item.url().includes('chatgpt.com')) ||
    pages.find(item => !item.isClosed()) || await session.context.newPage();
  session.context.on('page', newlyOpened => { void activatePage(session, newlyOpened).catch(error => problem(session.ws, error.message)); });
  if (!page.url().startsWith('https://chatgpt.com/')) {
    try { await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 }); }
    catch { problem(session.ws, 'ChatGPT did not finish loading; you can still use the remote view.'); }
  }
  await activatePage(session, page);
}

async function input(session, message) {
  const page = session.page;
  if (!page || page.isClosed()) throw new Error('Browser is not ready');
  if (session.run) throw new Error('Cancel automation before manual control.');
  if (message.type === 'pointer') {
    if (message.action === 'move') await page.mouse.move(message.x, message.y);
    if (message.action === 'click') await page.mouse.click(message.x, message.y);
    if (message.action === 'down') { await page.mouse.move(message.x, message.y); await page.mouse.down(); }
    if (message.action === 'up') { await page.mouse.move(message.x, message.y); await page.mouse.up(); }
  } else if (message.type === 'wheel') {
    await page.mouse.wheel(message.dx, message.dy);
  } else if (message.type === 'type') {
    await page.keyboard.insertText(message.text);
  } else if (message.type === 'key') {
    if (message.action === 'down') await page.keyboard.down(message.key);
    else await page.keyboard.up(message.key);
  }
}

wss.on('connection', ws => {
  const session = { ws, subject: null, page: null, cdp: null, context: null, run: null, ready: false };
  const loginTimer = setTimeout(() => ws.close(1008, 'Authentication timeout'), 8000);
  const lifetime = setTimeout(() => ws.close(1000, 'Reconnect to renew access'), 30 * 60_000);
  ws.on('message', data => {
    void (async () => {
      if (session.subject === null) {
        let auth;
        try { auth = JSON.parse(data.toString()); } catch { throw new Error('Invalid authentication'); }
        if (!auth || auth.type !== 'auth') throw new Error('Authentication required');
        const subject = verifyTicket(auth.ticket, { secret: SECRET, origin: ORIGIN });
        if (owners.has(subject)) throw new Error('This browser is already open in another window.');
        session.subject = subject;
        owners.set(subject, session);
        clearTimeout(loginTimer);
        send(ws, { type: 'status', message: 'Starting private browser…' });
        await openBrowser(session);
        session.ready = true;
        return;
      }
      if (!session.ready) return;
      const message = parseMessage(data.toString());
      if (message.type === 'cancel') {
        if (session.run) {
          session.run.cancelled = true;
          const stop = session.page?.locator('[data-testid="stop-button"], button[aria-label="Stop generating"]').first();
          if (stop) await stop.click({ timeout: 1500 }).catch(() => {});
        }
      } else if (message.type === 'prompt') {
        void automate(session, message.text);
      } else {
        await input(session, message);
      }
    })().catch(error => {
      problem(ws, error instanceof Error ? error.message : 'Operation failed');
      if (session.subject === null) ws.close(1008, 'Unauthorized');
    });
  });
  ws.on('close', () => {
    clearTimeout(loginTimer);
    clearTimeout(lifetime);
    if (session.run) session.run.cancelled = true;
    if (session.subject && owners.get(session.subject) === session) owners.delete(session.subject);
    void session.context?.close().catch(() => {});
  });
});

server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/v1/control' || request.headers.origin !== ORIGIN) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request));
});
server.listen(PORT, '0.0.0.0', () => console.log('Browser worker listening on port ' + PORT));
process.on('SIGTERM', () => { server.close(); for (const owner of owners.values()) owner.ws.close(1001); });
