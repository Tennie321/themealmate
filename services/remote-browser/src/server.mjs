import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyTicket } from './auth.mjs';
import { RemoteBrowser } from './browser.mjs';

const sharedSecret = process.env.ASTRA_BROWSER_SHARED_SECRET || '';
const origins = new Set((process.env.ASTRA_BROWSER_ALLOWED_ORIGINS || '')
  .split(',').map((value) => value.trim()).filter(Boolean));
if (sharedSecret.length < 32 || origins.size === 0) {
  throw new Error('Configure ASTRA_BROWSER_SHARED_SECRET (32+ chars) and ASTRA_BROWSER_ALLOWED_ORIGINS.');
}

const browser = new RemoteBrowser(process.env.ASTRA_BROWSER_PROFILE_DIR || '/data/profile');
const usedTickets = new Map();
const wss = new WebSocketServer({
  noServer: true,
  handleProtocols: (protocols) => protocols.has('astra.browser.v1') ? 'astra.browser.v1' : false,
});
const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  response.writeHead(404).end();
});

function rejectUpgrade(socket) {
  socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
  socket.destroy();
}

server.on('upgrade', (request, socket, head) => {
  const path = new URL(request.url || '/', 'http://localhost').pathname;
  if (path !== '/ws' || !origins.has(request.headers.origin)) return rejectUpgrade(socket);
  const protocols = String(request.headers['sec-websocket-protocol'] || '')
    .split(',').map((item) => item.trim());
  if (!protocols.includes('astra.browser.v1')) return rejectUpgrade(socket);
  const auth = protocols.find((item) => item.startsWith('auth.'));
  const ticket = verifyTicket(auth?.slice(5), sharedSecret);
  if (!ticket) return rejectUpgrade(socket);
  for (const [nonce, expires] of usedTickets) {
    if (expires < Date.now()) usedTickets.delete(nonce);
  }
  if (usedTickets.has(ticket.nonce)) return rejectUpgrade(socket);
  usedTickets.set(ticket.nonce, ticket.exp);
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
});

let activeSocket = null;
const send = (ws, packet) => {
  if (ws.readyState === WebSocket.OPEN && (packet.type !== 'frame' || ws.bufferedAmount < 2_000_000)) {
    ws.send(JSON.stringify(packet));
  }
};

wss.on('connection', (ws) => {
  if (activeSocket) activeSocket.close(4001, 'Another browser view connected');
  activeSocket = ws;
  let ready = false;
  let stopFrames = null;
  let inputQueue = Promise.resolve();

  ws.on('message', (bytes, binary) => {
    if (binary || bytes.length > 25_000) return ws.close(1009, 'Invalid input');
    let command;
    try { command = JSON.parse(bytes.toString('utf8')); } catch { return send(ws, { type: 'error', message: 'Invalid command' }); }
    if (!ready) return send(ws, { type: 'error', message: 'Browser is still starting' });
    if (!command || typeof command !== 'object') return;
    if (command.type === 'input') {
      inputQueue = inputQueue.then(() => browser.input(command))
        .catch(() => send(ws, { type: 'error', message: 'Browser input failed' }));
    } else if (command.type === 'prompt') {
      void browser.runPrompt(command.prompt, (event) => send(ws, event))
        .catch((error) => send(ws, { type: 'response_error', message: error.message }));
    } else if (command.type === 'cancel') {
      void browser.cancel().catch(() => {});
    } else if (command.type === 'home' || command.type === 'reload') {
      void (command.type === 'home' ? browser.home() : browser.reload())
        .catch((error) => send(ws, { type: 'error', message: error.message }));
    }
  });

  ws.on('close', () => {
    if (activeSocket === ws) {
      activeSocket = null;
      void browser.cancel().catch(() => {});
    }
    if (stopFrames) void stopFrames();
  });

  void (async () => {
    try {
      stopFrames = await browser.startFrames((packet) => send(ws, packet));
      if (ws.readyState !== WebSocket.OPEN) {
        await stopFrames();
        return;
      }
      ready = true;
      send(ws, { type: 'ready', viewport: { width: 1280, height: 800 } });
    } catch {
      send(ws, { type: 'error', message: 'Could not start the browser. Check container logs.' });
      ws.close(1011, 'Browser startup failed');
    }
  })();
});

const port = Number(process.env.PORT || 8787);
server.listen(port, '0.0.0.0', () => console.log('Remote browser service listening on port', port));

async function shutdown() {
  activeSocket?.close(1001, 'Service shutting down');
  server.close();
  await browser.shutdown();
}
process.once('SIGTERM', () => { void shutdown().finally(() => process.exit(0)); });
process.once('SIGINT', () => { void shutdown().finally(() => process.exit(0)); });
