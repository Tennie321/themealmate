import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { authenticate } from './auth.mjs';
import { parseCommand, VIEWPORT } from './protocol.mjs';
import { RemoteBrowser } from './browser.mjs';
import { streamPrompt } from './api-stream.mjs';

const origin = process.env.PUBLIC_ORIGIN;
const secret = process.env.ASTRA_SESSION_SECRET;
if (!origin || !/^https?:\/\/[^/]+$/.test(origin) || !secret || secret.length < 32) {
  throw new Error('Set PUBLIC_ORIGIN and ASTRA_SESSION_SECRET (at least 32 characters).');
}
const port = Number(process.env.PORT || 3100);
let active = null;

const server = createServer((request, response) => {
  if (request.url === '/browser/health') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end('{"status":"online"}');
  } else {
    response.writeHead(404);
    response.end();
  }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 10_000, perMessageDeflate: false });
server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/browser/ws') { socket.destroy(); return; }
  const auth = authenticate(request.headers, { origin, secret });
  const status = !auth.ok ? auth.status : active ? 409 : 101;
  if (status !== 101) {
    socket.end('HTTP/1.1 ' + status + ' Rejected\r\nConnection: close\r\n\r\n');
    return;
  }
  active = { socket: null };
  wss.handleUpgrade(request, socket, head, ws => {
    active.socket = ws;
    wss.emit('connection', ws, auth);
  });
});
wss.on('connection', (ws, auth) => {
  const send = (value, frame = false) => {
    if (ws.readyState !== WebSocket.OPEN || (frame && ws.bufferedAmount > 2_000_000)) return;
    ws.send(JSON.stringify(value));
  };
  const browser = new RemoteBrowser(auth.profileId, send);
  let commandQueue = Promise.resolve();
  let promptController = null;
  let lastRequests = [];
  send({ type: 'status', state: 'starting', viewport: VIEWPORT });

  void browser.start().then(() => {
    if (ws.readyState === WebSocket.OPEN) send({ type: 'status', state: 'ready', viewport: VIEWPORT });
  }).catch(error => {
    console.error('Chromium launch failed:', error?.message || 'unknown error');
    send({ type: 'status', state: 'error', message: 'Could not start the browser container.' });
    ws.close(1011, 'Browser launch failed');
  });

  ws.on('message', bytes => {
    let command;
    try { command = parseCommand(bytes.toString('utf8')); }
    catch (error) { send({ type: 'error', message: error.message }); return; }

    if (command.type === 'prompt.cancel') { promptController?.abort(); return; }
    if (command.type === 'prompt.submit') {
      if (promptController) { send({ type: 'prompt.error', id: command.id, message: 'Another prompt is running.' }); return; }
      const now = Date.now();
      lastRequests = lastRequests.filter(at => now - at < 10 * 60_000);
      if (lastRequests.length >= 8) { send({ type: 'prompt.error', id: command.id, message: 'API request limit reached; try again later.' }); return; }
      lastRequests.push(now);
      const controller = new AbortController();
      promptController = controller;
      send({ type: 'prompt.started', id: command.id });
      void streamPrompt({
        prompt: command.prompt, signal: controller.signal,
        onDelta: delta => send({ type: 'prompt.delta', id: command.id, delta }),
      }).then(() => send({ type: 'prompt.done', id: command.id }))
        .catch(error => send({ type: 'prompt.error', id: command.id,
          message: controller.signal.aborted ? 'Prompt cancelled.' : error.message }))
        .finally(() => { if (promptController === controller) promptController = null; });
      return;
    }
    commandQueue = commandQueue.then(() => browser.input(command))
      .catch(() => send({ type: 'error', message: 'Browser input could not be applied.' }));
  });
  ws.on('close', () => {
    promptController?.abort();
    void browser.close().finally(() => { if (active?.socket === ws) active = null; });
  });
  ws.on('error', () => {});
});
server.listen(port, '0.0.0.0', () => console.info('Remote browser service listening on ' + port));
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => { wss.clients.forEach(ws => ws.close(1001, 'Server shutdown')); server.close(); });
}
