import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyBrowserToken } from './token.mjs';

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.BROWSER_BRIDGE_SECRET;
const ORIGINS = (process.env.BROWSER_ALLOWED_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean);
const PROFILE_DIR = process.env.BROWSER_PROFILE_DIR || '/home/pwuser/profiles';
const VIEWPORT = { width: 1280, height: 800 };
const MAX_SESSIONS = 3;
const IDLE_MS = 90_000;
const PROMPT_LIMIT = 8_000;
const JOB_TIMEOUT_MS = 180_000;
const sessions = new Map();

if (!SECRET || SECRET.length < 32 || !ORIGINS.length || ORIGINS.some(x => {
  try { const url = new URL(x); return !['http:', 'https:'].includes(url.protocol) || url.origin !== x; }
  catch { return true; }
})) {
  throw new Error('BROWSER_BRIDGE_SECRET (32+ chars) and BROWSER_ALLOWED_ORIGIN (one or more exact origins) are required.');
}
await fs.mkdir(PROFILE_DIR, { recursive: true, mode: 0o700 });

function send(client, data) {
  if (client?.readyState === WebSocket.OPEN) client.send(JSON.stringify(data));
}
function error(client, message) { send(client, { type: 'error', message }); }

async function closeCast(session) {
  const cast = session.cast;
  session.cast = null;
  if (!cast) return;
  try { await cast.send('Page.stopScreencast'); } catch {}
  try { await cast.detach(); } catch {}
}

async function startCast(session, client) {
  await closeCast(session);
  if (session.client !== client || client.readyState !== WebSocket.OPEN) return;
  const cast = await session.context.newCDPSession(session.page);
  session.cast = cast;
  await cast.send('Page.enable');
  cast.on('Page.screencastFrame', ({ data, sessionId }) => {
    // Acknowledge every frame, including dropped frames, to avoid blocking CDP.
    if (session.cast === cast && session.client === client && client.bufferedAmount < 2_000_000) {
      send(client, { type: 'frame', image: data });
    }
    void cast.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cast.send('Page.startScreencast', { format: 'jpeg', quality: 68,
    maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height, everyNthFrame: 1 });
  send(client, { type: 'status', state: 'connected', url: session.page.url(), viewport: VIEWPORT });
}

async function createSession(session) {
  const profile = path.join(PROFILE_DIR, session.sid);
  await fs.mkdir(profile, { recursive: true, mode: 0o700 });
  const context = await chromium.launchPersistentContext(profile, {
    headless: false, viewport: VIEWPORT, acceptDownloads: false,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage'],
  });
  session.context = context;
  const pages = context.pages();
  session.page = pages.at(-1) || await context.newPage();
  context.on('page', page => {
    // OAuth login can open a popup. Switch the remotely controlled tab.
    session.page = page;
    if (session.client?.readyState === WebSocket.OPEN) {
      void startCast(session, session.client).catch(err => error(session.client, 'Browser view: ' + err.message));
    }
  });
  if (session.page.url() === 'about:blank') {
    await session.page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 })
      .catch(() => {}); // The browser remains interactive even on network failures.
  }
  if (session.client?.readyState === WebSocket.OPEN) await startCast(session, session.client);
}

async function destroySession(session) {
  if (session.client?.readyState === WebSocket.OPEN) return;
  session.abort?.abort();
  await closeCast(session);
  try { await session.context?.close(); } catch {}
  if (sessions.get(session.sid) === session) sessions.delete(session.sid);
}

function attach(client, sid) {
  let session = sessions.get(sid);
  if (session?.client?.readyState === WebSocket.OPEN) {
    error(client, 'This Astra session is already controlled in another tab.');
    client.close(1008, 'Session already open');
    return;
  }
  if (!session) {
    if (sessions.size >= MAX_SESSIONS) {
      error(client, 'Browser capacity reached. Close an unused session and try again.');
      client.close(1013, 'Capacity reached');
      return;
    }
    session = { sid, context: null, page: null, client: null, cast: null,
      ready: null, abort: null, job: null, requests: [], closeTimer: null };
    sessions.set(sid, session);
  }
  clearTimeout(session.closeTimer);
  session.client = client;
  send(client, { type: 'status', state: 'starting' });
  if (!session.ready) session.ready = createSession(session);
  const activeSession = session;

  session.ready.then(async () => {
    if (activeSession.client !== client) return;
    if (!activeSession.cast) await startCast(activeSession, client);
  }).catch(async cause => {
    error(client, 'Unable to start the browser: ' + cause.message);
    client.close(1011, 'Browser startup failed');
    activeSession.client = null;
    await destroySession(activeSession);
  });

  client.on('message', raw => {
    if (activeSession.client !== client) return;
    let action;
    try { action = JSON.parse(raw.toString('utf8')); }
    catch { error(client, 'Invalid command.'); return; }
    if (!action || typeof action !== 'object') return;
    if (!activeSession.page || !activeSession.context) return;
    void handleAction(activeSession, client, action).catch(cause => error(client, cause.message || 'Browser interaction failed.'));
  });
  client.on('close', () => {
    if (activeSession.client !== client) return;
    activeSession.client = null;
    activeSession.abort?.abort();
    void closeCast(activeSession);
    activeSession.closeTimer = setTimeout(() => { void destroySession(activeSession); }, IDLE_MS);
    activeSession.closeTimer.unref?.();
  });
}

function clamp(number, min, max) {
  return typeof number === 'number' && Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : null;
}

async function handleAction(session, client, command) {
  const page = session.page;
  if (command.type === 'mouse') {
    const x = clamp(command.x, 0, 1), y = clamp(command.y, 0, 1);
    if (x === null || y === null) return;
    await page.mouse.move(Math.round(x * VIEWPORT.width), Math.round(y * VIEWPORT.height));
    if (command.action === 'down') await page.mouse.down();
    else if (command.action === 'up') await page.mouse.up();
  } else if (command.type === 'wheel') {
    const dx = clamp(command.dx, -1500, 1500), dy = clamp(command.dy, -1500, 1500);
    if (dx !== null && dy !== null) await page.mouse.wheel(dx, dy);
  } else if (command.type === 'key') {
    if (typeof command.key !== 'string') return;
    const key = command.key;
    if (key.length === 1) await page.keyboard.insertText(key);
    else if (/^(Enter|Tab|Backspace|Delete|Escape|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown)$/.test(key)) {
      await page.keyboard.press(key);
    }
  } else if (command.type === 'text') {
    if (typeof command.text === 'string' && command.text.length > 0 && command.text.length <= 2_000) {
      await page.keyboard.insertText(command.text);
    }
  } else if (command.type === 'reload') {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  } else if (command.type === 'stop') {
    session.abort?.abort();
    const stop = page.locator('button[data-testid="stop-button"], button[aria-label="Stop generating"]').first();
    if (await stop.isVisible().catch(() => false)) await stop.click({ timeout: 3000 }).catch(() => {});
  } else if (command.type === 'prompt') {
    if (typeof command.prompt !== 'string' || !command.prompt.trim() || command.prompt.length > PROMPT_LIMIT) {
      error(client, 'Prompt must contain 1–8000 characters.'); return;
    }
    if (session.job) { error(client, 'A response is already in progress.'); return; }
    const now = Date.now();
    session.requests = session.requests.filter(value => now - value < 10 * 60_000);
    if (session.requests.length >= 12) { error(client, 'Prompt limit reached (12 per ten minutes).'); return; }
    session.requests.push(now);
    const id = typeof command.id === 'string' && /^[\w-]{1,64}$/.test(command.id) ? command.id : crypto.randomUUID();
    const controller = new AbortController();
    session.abort = controller;
    session.job = id;
    send(client, { type: 'response.start', id });
    try { await executePrompt(session, id, command.prompt.trim(), controller.signal); }
    catch (cause) { send(client, { type: 'response.error', id,
      message: controller.signal.aborted ? 'Generation stopped.' : (cause.message || 'ChatGPT interaction failed.') }); }
    finally {
      if (session.job === id) { session.job = null; session.abort = null; }
    }
  }
}

async function executePrompt(session, id, prompt, signal) {
  const page = session.page;
  const host = new URL(page.url()).hostname;
  if (host !== 'chatgpt.com' && host !== 'chat.openai.com') {
    throw new Error('Sign in and navigate back to chatgpt.com before submitting a prompt.');
  }
  const composer = page.locator('#prompt-textarea, [data-testid="composer-input"], [contenteditable="true"][role="textbox"]').first();
  await composer.waitFor({ state: 'visible', timeout: 12_000 });
  if (signal.aborted) throw new Error('Stopped');
  const assistant = page.locator('[data-message-author-role="assistant"]');
  const before = await assistant.count();
  await composer.fill(prompt);
  const sendButton = page.locator('button[data-testid="send-button"], button[aria-label="Send prompt"]').first();
  if (await sendButton.isVisible().catch(() => false)) {
    await sendButton.click({ timeout: 5_000 });
  } else {
    await composer.press('Enter');
  }
  let text = '', changedAt = Date.now(), seenGenerating = false, seenAnswer = false;
  const stopButton = page.locator('button[data-testid="stop-button"], button[aria-label="Stop generating"]').first();
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error('Stopped');
    const generating = await stopButton.isVisible().catch(() => false);
    if (generating) seenGenerating = true;
    const count = await assistant.count();
    if (count > before) {
      seenAnswer = true;
      const current = await assistant.last().innerText().catch(() => text);
      if (current !== text) {
        text = current;
        changedAt = Date.now();
        send(session.client, { type: 'response.snapshot', id, text });
      }
      const stableFor = Date.now() - changedAt;
      if (text.trim() && !generating && stableFor > (seenGenerating ? 1400 : 3500)) {
        send(session.client, { type: 'response.complete', id, text });
        return;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  if (!seenAnswer) throw new Error('No new ChatGPT reply was detected. Check the browser view.');
  throw new Error('Timed out waiting for ChatGPT to finish. The partial reply remains visible.');
}

const httpServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/browser-api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ready: true }));
  } else {
    res.writeHead(404); res.end();
  }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 12_000,
  handleProtocols(protocols) { return protocols.has('astra.browser.v1') ? 'astra.browser.v1' : false; },
});
httpServer.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin;
  const protocols = String(req.headers['sec-websocket-protocol'] || '').split(',').map(x => x.trim());
  const signed = protocols.find(x => x.startsWith('auth.'))?.slice(5);
  const verified = signed && verifyBrowserToken(signed, SECRET);
  if (req.url !== '/browser-api/ws' || !origin || !ORIGINS.includes(origin) ||
      !protocols.includes('astra.browser.v1') || !verified) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, client => wss.emit('connection', client, verified.sid));
});
wss.on('connection', (client, sid) => attach(client, sid));

const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    if (client.isAlive === false) { client.terminate(); continue; }
    client.isAlive = false;
    client.ping();
  }
}, 30_000);
wss.on('connection', client => {
  client.isAlive = true;
  client.on('pong', () => { client.isAlive = true; });
});
httpServer.listen(PORT, '0.0.0.0', () => console.log('Astra remote browser listening on ' + PORT));

async function shutdown() {
  clearInterval(heartbeat);
  wss.close();
  for (const session of sessions.values()) {
    session.client?.terminate();
    session.client = null;
    clearTimeout(session.closeTimer);
    await destroySession(session);
  }
  httpServer.close();
}
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });
