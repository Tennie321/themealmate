import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { BrowserController } from './browser.mjs';
import { authenticateUpgrade, parseCommand } from './security.mjs';

const port = Number(process.env.PORT || 8787);
const clients = new Set();
const send = (socket, message) => {
  if (socket.readyState !== WebSocket.OPEN) return;
  // Drop stale frames instead of buffering unbounded JPEGs for slow clients.
  if (message.type === 'frame' && socket.bufferedAmount > 2_000_000) return;
  socket.send(JSON.stringify(message));
};
const broadcast = message => { for (const socket of clients) send(socket, message); };
const browser = new BrowserController(process.env.BROWSER_PROFILE_DIR || '/data/profiles/owner', broadcast);
const httpServer = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
    res.end('ok');
    return;
  }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 12_000, perMessageDeflate: false });

httpServer.on('upgrade', (req, socket, head) => {
  if (!authenticateUpgrade(req)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});

wss.on('connection', socket => {
  clients.add(socket);
  socket.on('close', () => clients.delete(socket));
  socket.on('error', () => clients.delete(socket));
  void browser.start().then(() => {
    send(socket, { type: 'status', state: 'ready', message: 'Remote browser is ready. Sign in directly in the browser view.' });
    if (browser.lastFrame) send(socket, { type: 'frame', jpeg: browser.lastFrame, width: 1280, height: 800 });
  }).catch(() => send(socket, { type: 'error', message: 'Browser could not start. Inspect the browser container logs.' }));

  socket.on('message', raw => {
    void (async () => {
      const command = parseCommand(raw.toString('utf8'));
      await browser.start();
      if (command.type === 'send_prompt') {
        await browser.runPrompt(command.prompt, event => send(socket, event));
      } else {
        await browser.control(command);
      }
    })().catch(error => send(socket, { type: 'error', message: error instanceof Error ? error.message : 'Browser command failed.' }));
  });
});
httpServer.listen(port, '0.0.0.0', () => {
  console.log('Astra remote browser service listening on port ' + port);
});
const shutdown = async () => {
  for (const socket of clients) socket.close();
  httpServer.close();
  await browser.close();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
