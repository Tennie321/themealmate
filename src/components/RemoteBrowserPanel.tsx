import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { ArrowUp, Copy, Home, Monitor, RefreshCcw, Square, Unplug, Wifi } from 'lucide-react';
import './remote-browser.css';

type BrowserEvent = {
  type: string;
  image?: string;
  text?: string;
  message?: string;
  viewport?: { width: number; height: number };
};
type Ticket = { websocketUrl: string; ticket: string; error?: string };

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

export function RemoteBrowserPanel() {
  const socketRef = useRef<WebSocket | null>(null);
  const screenRef = useRef<HTMLImageElement | null>(null);
  const controlRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef(DEFAULT_VIEWPORT);
  const lastMoveRef = useRef(0);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'ready'>('disconnected');
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const send = useCallback((message: object) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.close(1000, 'User disconnected');
    socketRef.current = null;
    setStatus('disconnected');
    setBusy(false);
    if (screenRef.current) screenRef.current.removeAttribute('src');
  }, []);

  useEffect(() => () => {
    socketRef.current?.close(1000, 'Browser view unmounted');
    socketRef.current = null;
  }, []);

  async function connect() {
    if (status !== 'disconnected') return;
    setStatus('connecting');
    setError('');
    try {
      const response = await fetch('/api/browser/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await response.json() as Ticket;
      if (!response.ok) throw new Error(data.error || 'Browser service is unavailable.');
      const ws = new WebSocket(data.websocketUrl, ['astra.browser.v1', 'auth.' + data.ticket]);
      socketRef.current = ws;
      ws.onmessage = (event) => {
        let packet: BrowserEvent;
        try { packet = JSON.parse(event.data as string) as BrowserEvent; } catch { return; }
        if (packet.type === 'frame' && packet.image) {
          if (screenRef.current) screenRef.current.src = packet.image;
        } else if (packet.type === 'ready') {
          viewportRef.current = packet.viewport || DEFAULT_VIEWPORT;
          setStatus('ready');
        } else if (packet.type === 'prompt_started') {
          setBusy(true);
          setReply('');
        } else if (packet.type === 'response_update') {
          setReply(packet.text || '');
        } else if (packet.type === 'response_done' || packet.type === 'response_cancelled') {
          setReply(packet.text || '');
          setBusy(false);
        } else if (packet.type === 'response_error') {
          setError(packet.message || 'The ChatGPT response could not be completed.');
          setBusy(false);
        } else if (packet.type === 'error') {
          setError(packet.message || 'Browser error.');
        }
      };
      ws.onerror = () => setError('Could not connect to the remote browser service.');
      ws.onclose = (event) => {
        if (socketRef.current !== ws) return;
        socketRef.current = null;
        setStatus('disconnected');
        setBusy(false);
        if (screenRef.current) screenRef.current.removeAttribute('src');
        if (event.code !== 1000 && event.code !== 1001) {
          setError('Browser disconnected. Check the service and reconnect.');
        }
      };
    } catch (cause) {
      setStatus('disconnected');
      setError(cause instanceof Error ? cause.message : 'Remote browser unavailable.');
    }
  }

  function sendPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status !== 'ready' || busy || !prompt.trim()) return;
    setError('');
    setBusy(true);
    setReply('');
    send({ type: 'prompt', prompt: prompt.trim() });
    setPrompt('');
  }

  function point(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(viewportRef.current.width - 1, (event.clientX - rect.left) / rect.width * viewportRef.current.width)),
      y: Math.max(0, Math.min(viewportRef.current.height - 1, (event.clientY - rect.top) / rect.height * viewportRef.current.height)),
    };
  }
  function pointer(event: PointerEvent<HTMLDivElement>, action: 'down' | 'up' | 'move') {
    if (status !== 'ready') return;
    if (action === 'move' && Date.now() - lastMoveRef.current < 35) return;
    if (action === 'move') lastMoveRef.current = Date.now();
    if (action === 'down') {
      controlRef.current?.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    send({
      type: 'input', event: 'pointer', action, ...point(event),
      button: event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left',
    });
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>, action: 'down' | 'up') {
    if (status !== 'ready') return;
    event.preventDefault();
    event.stopPropagation();
    send({ type: 'input', event: 'key', action, key: event.key });
  }
  function wheel(event: WheelEvent<HTMLDivElement>) {
    if (status === 'ready') send({ type: 'input', event: 'wheel', dx: event.deltaX, dy: event.deltaY });
  }

  return <section className="remote-browser-panel" aria-label="Interactive ChatGPT browser">
    <div className="remote-browser-heading">
      <div>
        <span className="remote-browser-kicker"><Monitor size={15} /> REMOTE BROWSER</span>
        <h2>Control your ChatGPT session</h2>
        <p>Sign in directly in the streamed browser. Complete any verification manually, then send prompts from Astra and see live replies.</p>
      </div>
      <span className={`remote-browser-status ${status}`}><span />{status === 'ready' ? 'Connected' : status === 'connecting' ? 'Starting...' : 'Offline'}</span>
    </div>
    <div className="remote-browser-toolbar">
      {status === 'disconnected'
        ? <button type="button" onClick={() => void connect()}><Wifi size={16} /> Connect browser</button>
        : <button type="button" onClick={disconnect}><Unplug size={16} /> Disconnect</button>}
      <button type="button" disabled={status !== 'ready'} onClick={() => send({ type: 'home' })}><Home size={16} /> ChatGPT home</button>
      <button type="button" disabled={status !== 'ready'} onClick={() => send({ type: 'reload' })}><RefreshCcw size={16} /> Reload</button>
    </div>
    <div
      ref={controlRef}
      className="remote-browser-screen"
      tabIndex={status === 'ready' ? 0 : -1}
      role="application"
      aria-label="Remote browser screen. Click and type to control ChatGPT."
      onPointerDown={(event) => pointer(event, 'down')}
      onPointerUp={(event) => pointer(event, 'up')}
      onPointerMove={(event) => pointer(event, 'move')}
      onContextMenu={(event) => event.preventDefault()}
      onWheel={wheel}
      onKeyDown={(event) => keyboard(event, 'down')}
      onKeyUp={(event) => keyboard(event, 'up')}
    >
      <img ref={screenRef} alt="Live screen of the remote ChatGPT browser" draggable={false} />
      {status !== 'ready' && <div className="remote-browser-placeholder">
        <Monitor size={38} />
        <strong>{status === 'connecting' ? 'Starting remote Chromium...' : 'Browser not connected'}</strong>
        <span>{status === 'connecting' ? 'Your profile will reopen in the browser container.' : 'Connect to view and control the logged-in ChatGPT browser.'}</span>
      </div>}
    </div>
    <div className="remote-browser-paste">
      <input
        value={pasteText}
        onChange={(event) => setPasteText(event.target.value)}
        type="text" placeholder="Paste text into the focused browser field" aria-label="Text to paste into the remote browser"
        disabled={status !== 'ready'}
      />
      <button type="button" disabled={status !== 'ready' || !pasteText} onClick={() => {
        send({ type: 'input', event: 'paste', text: pasteText });
        setPasteText('');
        controlRef.current?.focus();
      }}>Paste</button>
    </div>
    <form className="remote-browser-compose" onSubmit={sendPrompt}>
      <label htmlFor="remote-browser-prompt">Automate a ChatGPT prompt</label>
      <textarea
        id="remote-browser-prompt" rows={3} maxLength={8000}
        value={prompt} onChange={(event) => setPrompt(event.target.value)}
        placeholder="Type a prompt to send to the active ChatGPT conversation..."
      />
      <div className="remote-browser-compose-actions">
        <small>{prompt.length} / 8000 · ChatGPT web interface may change</small>
        {busy ? <button type="button" onClick={() => send({ type: 'cancel' })}><Square size={15} /> Stop</button> :
          <button type="submit" disabled={status !== 'ready' || !prompt.trim()}><ArrowUp size={16} /> Send prompt</button>}
      </div>
    </form>
    <div className="remote-browser-reply" aria-live="polite">
      <div className="remote-browser-reply-heading"><strong>{busy ? 'ChatGPT is responding...' : 'Latest reply'}</strong>
        <button type="button" disabled={!reply} onClick={() => void navigator.clipboard.writeText(reply)}><Copy size={14} /> Copy</button>
      </div>
      <pre>{reply || 'A streamed ChatGPT reply will appear here after you send a prompt.'}</pre>
    </div>
    {error && <p className="remote-browser-error" role="alert">{error}</p>}
    <p className="remote-browser-privacy">Your ChatGPT session is stored only in the browser service volume, not in Astra local history. Never expose the browser WebSocket endpoint publicly without TLS and the access controls described in the deployment guide.</p>
  </section>;
}
