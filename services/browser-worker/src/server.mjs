import http from 'node:http';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyTicket } from './ticket.mjs';
import { sendChatGPTPrompt } from './chatgpt.mjs';

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.ASTRA_BROWSER_SHARED_SECRET || '';
const ORIGIN = process.env.ASTRA_BROWSER_ALLOWED_ORIGIN || '';
const PROFILES = process.env.ASTRA_BROWSER_PROFILE_ROOT || '/profiles';
const WIDTH = 1280, HEIGHT = 800, IDLE = 20 * 60_000;
const sessions = new Map();
if (SECRET.length < 32 || !/^https?:\/\/[^/]+$/.test(ORIGIN)) throw new Error('Set ASTRA_BROWSER_SHARED_SECRET and ASTRA_BROWSER_ALLOWED_ORIGIN.');
await mkdir(PROFILES, { recursive: true });

function send(socket, event) { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event)); }
async function getSession(sid) {
  if (sessions.has(sid)) return sessions.get(sid);
  if (sessions.size >= 4) throw new Error('Browser capacity reached.');
  const pending = (async () => {
    const context = await chromium.launchPersistentContext(path.join(PROFILES, sid), {
      headless: true, viewport: { width: WIDTH, height: HEIGHT }, acceptDownloads: false,
    });
    try {
      const page = context.pages()[0] || await context.newPage();
      if (!page.url().startsWith('https://chatgpt.com')) await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 40_000 }).catch(() => {});
      const cdp = await context.newCDPSession(page);
      const session = { context, page, cdp, socket: null, busy: false, lastUsed: Date.now() };
      cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
        if (session.socket?.readyState === WebSocket.OPEN && session.socket.bufferedAmount < 2_000_000) {
          session.socket.send(Buffer.from(data, 'base64'), { binary: true });
        }
        void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      });
      await cdp.send('Page.enable');
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 65, maxWidth: WIDTH, maxHeight: HEIGHT });
      return session;
    } catch (error) { await context.close().catch(() => {}); throw error; }
  })();
  sessions.set(sid, pending);
  try { return await pending; } catch (error) { sessions.delete(sid); throw error; }
}
async function control(session, msg) {
  if (session.busy) throw new Error('Automation is running; manual input is paused.');
  const page = session.page;
  if (msg.type === 'mouse') {
    const x = Number(msg.x), y = Number(msg.y);
    if (![x, y].every(Number.isFinite) || x < 0 || y < 0 || x > WIDTH || y > HEIGHT) return;
    if (msg.kind === 'move') await page.mouse.move(x, y);
    if (msg.kind === 'down' || msg.kind === 'up') {
      const button = ['left', 'middle', 'right'].includes(msg.button) ? msg.button : 'left';
      await page.mouse[msg.kind]({ button });
    }
  } else if (msg.type === 'wheel') {
    const dx = Number(msg.dx), dy = Number(msg.dy);
    if (Number.isFinite(dx) && Number.isFinite(dy)) await page.mouse.wheel(Math.max(-1000, Math.min(1000, dx)), Math.max(-1000, Math.min(1000, dy)));
  } else if (msg.type === 'key') {
    if (typeof msg.key !== 'string' || msg.key.length > 40) return;
    const modifiers = Array.isArray(msg.modifiers) ? msg.modifiers.filter(m => ['Control', 'Meta', 'Alt', 'Shift'].includes(m)) : [];
    if (msg.key.length === 1 && modifiers.every(m => m === 'Shift')) await page.keyboard.insertText(msg.key);
    else if (msg.key !== 'Dead' && msg.key !== 'Unidentified') await page.keyboard.press([...modifiers, msg.key].join('+'));
  }
}
const server = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end('{"ok":true}'); }
  else { res.writeHead(404); res.end(); }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 20_000, perMessageDeflate: false });
server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws' || req.headers.origin !== ORIGIN) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});
wss.on('connection', socket => {
  let session = null, authenticated = false;
  const timer = setTimeout(() => socket.close(4401, 'Authentication required'), 10_000);
  socket.on('message', async (payload, binary) => {
    if (binary) { socket.close(4400, 'Expected JSON'); return; }
    let msg;
    try { msg = JSON.parse(payload.toString()); } catch { socket.close(4400, 'Invalid JSON'); return; }
    try {
      if (!authenticated) {
        const sid = msg?.type === 'auth' ? verifyTicket(msg.ticket, SECRET) : null;
        if (!sid) { socket.close(4401, 'Invalid ticket'); return; }
        session = await getSession(sid);
        if (socket.readyState !== WebSocket.OPEN) return;
        if (session.socket && session.socket !== socket) session.socket.close(4409, 'Session opened elsewhere');
        session.socket = socket; session.lastUsed = Date.now(); authenticated = true; clearTimeout(timer);
        send(socket, { type: 'ready', width: WIDTH, height: HEIGHT });
        const shot = await session.page.screenshot({ type: 'jpeg', quality: 65 }).catch(() => null);
        if (shot && socket.readyState === WebSocket.OPEN) socket.send(shot, { binary: true });
        return;
      }
      if (session.socket !== socket) return;
      session.lastUsed = Date.now();
      if (msg?.type === 'prompt') {
        if (session.busy) { send(socket, { type: 'error', message: 'A prompt is already running.' }); return; }
        session.busy = true;
        try { await sendChatGPTPrompt(session.page, msg.text, event => send(socket, event)); }
        finally { session.busy = false; }
      } else await control(session, msg);
    } catch (error) {
      send(socket, { type: 'error', message: error instanceof Error ? error.message : 'Browser operation failed.' });
      if (!authenticated) socket.close(4500, 'Browser unavailable');
    }
  });
  socket.on('close', () => { clearTimeout(timer); if (session?.socket === socket) { session.socket = null; session.lastUsed = Date.now(); } });
  socket.on('error', () => {});
});
setInterval(async () => {
  for (const [sid, pending] of sessions) {
    const session = await pending.catch(() => null);
    if (session && !session.socket && !session.busy && Date.now() - session.lastUsed > IDLE) {
      sessions.delete(sid); await session.context.close().catch(() => {});
    }
  }
}, 60_000).unref();
server.listen(PORT, '0.0.0.0', () => console.log('Browser worker listening on ' + PORT));
