import http from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { WebSocket, WebSocketServer } from 'ws';
import { VIEWPORT, originAllowed, parseMessage, safeTokenEqual } from './protocol.mjs';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.BIND_HOST || '127.0.0.1';
const TOKEN = process.env.REMOTE_BROWSER_TOKEN || '';
const ORIGINS = process.env.REMOTE_BROWSER_ALLOWED_ORIGINS || '';
const PROFILE_DIR = resolve(process.env.REMOTE_BROWSER_PROFILE_DIR || './profiles');
const MAX_PROFILES = 2;

if (TOKEN.length < 32 || !ORIGINS.trim()) {
  throw new Error('REMOTE_BROWSER_TOKEN must be 32+ characters and REMOTE_BROWSER_ALLOWED_ORIGINS must be configured.');
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('Invalid PORT.');

const sessions = new Map();
const opening = new Map();
const wss = new WebSocketServer({ noServer: true, maxPayload: 24 * 1024, perMessageDeflate: false });
const httpServer = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/healthz') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end('{"ok":true}');
  } else { response.writeHead(404); response.end(); }
});

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}
function broadcast(session, message) {
  for (const ws of session.viewers) {
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 2_000_000) send(ws, message);
  }
}
function publicError(error) {
  if (error instanceof Error && /Target closed|Browser closed|browser has been closed/i.test(error.message)) {
    return 'The remote browser closed. Reconnect and reopen the profile.';
  }
  if (error instanceof Error && /Timeout/i.test(error.message)) {
    return 'ChatGPT did not respond in time. Check the browser screen.';
  }
  return 'Browser action failed. Check the browser screen and try again.';
}

async function openProfile(id) {
  if (sessions.has(id)) return sessions.get(id);
  if (opening.has(id)) return opening.get(id);
  if (sessions.size + opening.size >= MAX_PROFILES) throw new Error('Too many open profiles.');
  const start = (async () => {
    const path = resolve(PROFILE_DIR, id);
    await mkdir(path, { recursive: true, mode: 0o700 });
    const context = await chromium.launchPersistentContext(path, {
      headless: true,
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      acceptDownloads: false,
      args: ['--disable-dev-shm-usage'],
    });
    try {
      const page = context.pages()[0] || await context.newPage();
      if (page.url() === 'about:blank') {
        await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      }
      const cdp = await context.newCDPSession(page);
      const session = { context, page, cdp, viewers: new Set(), activeRun: null, frameAt: 0 };
      await cdp.send('Page.enable');
      cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
        if (Date.now() - session.frameAt >= 100 && session.viewers.size) {
          broadcast(session, { type: 'frame', data });
          session.frameAt = Date.now();
        }
        void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      });
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 65, everyNthFrame: 1 });
      page.on('close', () => {
        sessions.delete(id);
        broadcast(session, { type: 'status', text: 'Browser closed; reconnect to restart it.' });
        void context.close().catch(() => {});
      });
      sessions.set(id, session);
      return session;
    } catch (error) {
      await context.close().catch(() => {});
      throw error;
    }
  })();
  opening.set(id, start);
  try { return await start; } finally { opening.delete(id); }
}

async function executePrompt(session, prompt) {
  if (session.activeRun) {
    broadcast(session, { type: 'error', message: 'A prompt is already running in this browser.' });
    return;
  }
  if (!/^https:\/\/(www\.)?chatgpt\.com(\/|$)/.test(session.page.url())) {
    broadcast(session, { type: 'error', message: 'Open ChatGPT and finish signing in before executing a prompt.' });
    return;
  }
  const run = { cancelled: false };
  session.activeRun = run;
  broadcast(session, { type: 'status', text: 'Submitting prompt to ChatGPT…' });
  try {
    const page = session.page;
    const replies = page.locator('[data-message-author-role="assistant"]');
    const baseline = await replies.count();
    const composer = page.locator('#prompt-textarea').first();
    await composer.waitFor({ state: 'visible', timeout: 15000 });
    await composer.fill(prompt);
    const sendButton = page.getByTestId('send-button');
    if (await sendButton.count() && await sendButton.first().isEnabled()) await sendButton.first().click();
    else await composer.press('Enter');
    broadcast(session, { type: 'prompt_submitted' });
    let lastText = '';
    let lastChange = Date.now();
    let appeared = false;
    const start = Date.now();
    while (Date.now() - start < 180000) {
      if (run.cancelled) {
        const stopButton = page.getByTestId('stop-button');
        if (await stopButton.count()) await stopButton.first().click({ timeout: 2000 }).catch(() => {});
        broadcast(session, { type: 'response_done', cancelled: true });
        return;
      }
      const count = await replies.count();
      if (count > baseline) {
        appeared = true;
        const text = (await replies.last().innerText().catch(() => '')).trim();
        if (text !== lastText) {
          if (text.startsWith(lastText)) broadcast(session, { type: 'response_delta', text: text.slice(lastText.length) });
          else broadcast(session, { type: 'response_replace', text });
          lastText = text;
          lastChange = Date.now();
        }
        const generating = await page.getByTestId('stop-button').isVisible().catch(() => false);
        if (lastText && !generating && Date.now() - lastChange >= 1500 && Date.now() - start >= 2500) {
          broadcast(session, { type: 'response_done', cancelled: false });
          return;
        }
      }
      await new Promise(done => setTimeout(done, 300));
    }
    broadcast(session, { type: 'error', message: appeared ? 'Response did not finish within three minutes.' : 'No assistant reply appeared. Check ChatGPT for a manual challenge or error.' });
  } catch (error) {
    console.error('Prompt automation failed:', error instanceof Error ? error.name : 'unknown error');
    broadcast(session, { type: 'error', message: publicError(error) });
  } finally {
    session.activeRun = null;
  }
}

httpServer.on('upgrade', (request, socket, head) => {
  if (request.url !== '/ws' || !originAllowed(request.headers.origin, ORIGINS)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws));
});

wss.on('connection', socket => {
  let authenticated = false;
  let current = null;
  const authTimeout = setTimeout(() => socket.close(1008, 'Authentication required'), 10000);
  socket.on('message', async bytes => {
    let action;
    try { action = parseMessage(bytes); }
    catch (error) { send(socket, { type: 'error', message: error instanceof Error ? error.message : 'Invalid action.' }); return; }
    if (!authenticated) {
      if (action.type !== 'auth' || !safeTokenEqual(action.token, TOKEN)) return socket.close(1008, 'Unauthorized');
      authenticated = true;
      clearTimeout(authTimeout);
      send(socket, { type: 'authenticated' });
      return;
    }
    if (action.type === 'auth') return;
    if (action.type === 'open') {
      try {
        const next = await openProfile(action.profileId);
        if (current) current.viewers.delete(socket);
        current = next;
        next.viewers.add(socket);
        send(socket, { type: 'opened', profileId: action.profileId, url: next.page.url() });
        const image = await next.page.screenshot({ type: 'jpeg', quality: 65 });
        send(socket, { type: 'frame', data: image.toString('base64') });
      } catch (error) {
        console.error('Remote browser launch failed:', error instanceof Error ? error.name : 'unknown error');
        send(socket, { type: 'error', message: publicError(error) });
      }
      return;
    }
    if (!current) { send(socket, { type: 'error', message: 'Open a profile first.' }); return; }
    try {
      const page = current.page;
      if (action.type === 'prompt') { void executePrompt(current, action.text); return; }
      if (action.type === 'cancel') { if (current.activeRun) current.activeRun.cancelled = true; return; }
      if (current.activeRun) { send(socket, { type: 'error', message: 'Wait for the response or click Stop.' }); return; }
      if (action.type === 'navigate') await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (action.type === 'back') await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
      if (action.type === 'reload') await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      if (action.type === 'click') await page.mouse.click(action.x * VIEWPORT.width, action.y * VIEWPORT.height, { button: action.button });
      if (action.type === 'move') await page.mouse.move(action.x * VIEWPORT.width, action.y * VIEWPORT.height);
      if (action.type === 'wheel') await page.mouse.wheel(action.deltaX, action.deltaY);
      if (action.type === 'key') await page.keyboard.press(action.key);
      if (action.type === 'type') await page.keyboard.type(action.text);
      if (['navigate','back','reload'].includes(action.type)) send(socket, { type: 'status', text: page.url() });
    } catch (error) {
      console.error('Remote browser action failed:', error instanceof Error ? error.name : 'unknown error');
      send(socket, { type: 'error', message: publicError(error) });
    }
  });
  socket.on('close', () => {
    clearTimeout(authTimeout);
    if (current) current.viewers.delete(socket);
  });
  socket.on('error', () => {});
});

httpServer.listen(PORT, HOST, () => console.log('Remote browser listening on ' + HOST + ':' + PORT));
async function shutdown() {
  wss.close();
  for (const session of sessions.values()) await session.context.close().catch(() => {});
  httpServer.close();
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
