import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { LockKeyhole, Monitor, Play, PlugZap, Square, Unplug } from 'lucide-react';
import './RemoteBrowserControl.css';

type BrowserEvent =
  | { type: 'authenticated' }
  | { type: 'frame'; data: string; width: number; height: number }
  | { type: 'status'; state: string; url: string }
  | { type: 'response' | 'done'; text: string }
  | { type: 'error'; error: string };

const serviceUrl: string = import.meta.env.VITE_BROWSER_SERVICE_URL || '';
const WIDTH = 1280;
const HEIGHT = 800;

/** An optional remote control surface. The token is held only in React state and sent in
 * the first WS message, never stored in localStorage, a cookie, or the URL. */
export function RemoteBrowserControl() {
  const socketRef = useRef<WebSocket | null>(null);
  const moveTimeRef = useRef(0);
  const [secret, setSecret] = useState('');
  const [connection, setConnection] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [state, setState] = useState('idle');
  const [frame, setFrame] = useState('');
  const [address, setAddress] = useState('https://chatgpt.com/');
  const [prompt, setPrompt] = useState('');
  const [typedText, setTypedText] = useState('');
  const [hideTypedText, setHideTypedText] = useState(true);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');

  useEffect(() => () => { socketRef.current?.close(); socketRef.current = null; }, []);

  const send = (message: object) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  const connect = () => {
    if (!serviceUrl || secret.length < 32) { setError('Configure the service URL and enter its 32+ character access token.'); return; }
    let url: URL;
    try {
      url = new URL(serviceUrl);
      if (!['ws:', 'wss:'].includes(url.protocol) || (window.location.protocol === 'https:' && url.protocol !== 'wss:')) {
        throw new Error('A secure page requires a wss:// browser service.');
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid browser service URL'); return; }
    setError('');
    setConnection('connecting');
    setState('starting');
    const socket = new WebSocket(url.toString());
    socketRef.current = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', token: secret }));
    socket.onmessage = (event: MessageEvent<string>) => {
      let update: BrowserEvent;
      try { update = JSON.parse(event.data) as BrowserEvent; } catch { return; }
      if (update.type === 'authenticated') {
        setConnection('connected');
        setSecret('');
      } else if (update.type === 'frame') {
        setFrame(update.data);
      } else if (update.type === 'status') {
        setState(update.state);
        setAddress(update.url);
      } else if (update.type === 'response') {
        setAnswer(update.text);
        setState('running');
      } else if (update.type === 'done') {
        setAnswer(update.text);
        setState('ready');
      } else if (update.type === 'error') {
        setError(update.error);
        setState('ready');
      }
    };
    socket.onerror = () => setError('Browser connection failed. Check the service URL, HTTPS proxy and allowed origin.');
    socket.onclose = (event) => {
      if (socketRef.current === socket) {
        socketRef.current = null;
        setConnection('disconnected');
        setState('idle');
        if (event.code === 1008) setError('Authentication or origin check failed.');
      }
    };
  };
  const disconnect = () => {
    socketRef.current?.close(1000, 'User disconnected');
    socketRef.current = null;
    setConnection('disconnected');
    setState('idle');
    setFrame('');
  };
  const coords = (event: PointerEvent<HTMLImageElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(WIDTH, (event.clientX - rect.left) / rect.width * WIDTH)),
      y: Math.max(0, Math.min(HEIGHT, (event.clientY - rect.top) / rect.height * HEIGHT)),
    };
  };
  const onPointerDown = (event: PointerEvent<HTMLImageElement>) => {
    if (event.button !== 0 || state === 'running') return;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    send({ type: 'pointer', action: 'down', ...coords(event) });
  };
  const onPointerMove = (event: PointerEvent<HTMLImageElement>) => {
    if (state === 'running' || Date.now() - moveTimeRef.current < 35) return;
    moveTimeRef.current = Date.now();
    send({ type: 'pointer', action: 'move', ...coords(event) });
  };
  const onPointerUp = (event: PointerEvent<HTMLImageElement>) => {
    if (state === 'running') return;
    send({ type: 'pointer', action: 'up', ...coords(event) });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLImageElement>) => {
    if (connection !== 'connected' || state === 'running') return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      send({ type: 'key', key: (event.metaKey ? 'Meta' : 'Control') + '+A' });
    } else if (['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'Home', 'End', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      send({ type: 'key', key: event.key });
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
      event.preventDefault();
      send({ type: 'type', text: event.key });
    }
  };
  const onWheel = (event: WheelEvent<HTMLImageElement>) => {
    if (state !== 'running') send({ type: 'wheel', dx: Math.max(-1200, Math.min(1200, event.deltaX)), dy: Math.max(-1200, Math.min(1200, event.deltaY)) });
  };
  const runPrompt = () => {
    if (connection !== 'connected' || state !== 'ready' || !prompt.trim() || prompt.length > 8000) return;
    setAnswer('');
    setError('');
    setState('running');
    send({ type: 'prompt', text: prompt.trim() });
  };

  return <section className="remote-browser" aria-label="Interactive ChatGPT browser">
    <header className="remote-browser-header">
      <div><span className="remote-browser-eyebrow"><Monitor size={15} /> REMOTE BROWSER</span>
        <h2>Control your ChatGPT session</h2>
        <p>Log in yourself, handle any verification challenges, then run prompts and watch replies stream here.</p>
      </div>
      <span className="remote-browser-status">{connection === 'connected' ? state : connection}</span>
    </header>
    {!serviceUrl ? <div className="remote-browser-config">
      Remote browser service is not configured. Deploy the optional service and set <code>VITE_BROWSER_SERVICE_URL</code> to its <code>wss://.../ws</code> address. The regular handoff below still works.
    </div> : <>
      {connection === 'disconnected' && <div className="remote-browser-auth">
        <label htmlFor="remote-browser-token"><LockKeyhole size={16} /> Browser service access token</label>
        <div className="remote-browser-connect">
          <input id="remote-browser-token" type="password" autoComplete="off" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="Enter your service token" />
          <button type="button" onClick={connect} disabled={secret.length < 32}><PlugZap size={16} /> Connect</button>
        </div>
        <small>The token is used only for this connection. Your ChatGPT login stays in the isolated browser profile.</small>
      </div>}
      {connection !== 'disconnected' && <div className="remote-browser-session">
        <div className="remote-browser-toolbar"><span title={address}>{address}</span><button type="button" onClick={disconnect}><Unplug size={15} /> Disconnect</button></div>
        <div className="remote-browser-screen">
          {frame ? <img src={'data:image/jpeg;base64,' + frame} alt="Interactive remote Chromium browser; click or focus and type to control it" tabIndex={0}
            draggable={false} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp} onKeyDown={onKeyDown} onWheel={onWheel} /> :
            <div className="remote-browser-loading">Starting Chromium and loading ChatGPT…</div>}
        </div>
        <p className="remote-browser-hint">Click the browser preview to focus; type normally on desktop. All CAPTCHA and sign-in steps must be completed manually.</p>
        <div className="remote-browser-typing">
          <label htmlFor="remote-browser-typing-input">Type into the selected browser field (also works on phones)</label>
          <div className="remote-browser-typing-row">
            <input id="remote-browser-typing-input" type={hideTypedText ? 'password' : 'text'} value={typedText} autoComplete="off" autoCapitalize="off" spellCheck={false}
              onChange={(event) => setTypedText(event.target.value)} maxLength={2000} placeholder="Select a field above, then type here" />
            <button type="button" disabled={!typedText || state === 'running'} onClick={() => { send({ type: 'type', text: typedText }); setTypedText(''); }}>Type</button>
            <button type="button" disabled={state === 'running'} onClick={() => send({ type: 'key', key: 'Enter' })}>Enter</button>
          </div>
          <label className="remote-browser-show-typing"><input type="checkbox" checked={!hideTypedText} onChange={(event) => setHideTypedText(!event.target.checked)} /> Show typed text</label>
        </div>
      </div>}
      {connection === 'connected' && <div className="remote-browser-prompt">
        <label htmlFor="remote-automation-prompt">Automated prompt</label>
        <textarea id="remote-automation-prompt" rows={3} maxLength={8000} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask the active ChatGPT session…" />
        <div className="remote-browser-actions">
          <span>{prompt.length}/8000</span>
          {state === 'running'
            ? <button type="button" onClick={() => send({ type: 'cancel' })}><Square size={15} /> Stop</button>
            : <button type="button" onClick={runPrompt} disabled={state !== 'ready' || !prompt.trim()}><Play size={15} /> Run prompt</button>}
        </div>
        {answer && <div className="remote-browser-reply" aria-live="polite"><strong>ChatGPT reply</strong><pre>{answer}</pre></div>}
      </div>}
      {error && <p className="remote-browser-error" role="alert">{error}</p>}
    </>}
  </section>;
}
