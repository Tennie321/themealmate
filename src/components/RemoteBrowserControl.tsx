import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type WheelEvent } from 'react';
import { ArrowLeft, RefreshCw, Play, Square, Monitor, LockKeyhole } from 'lucide-react';
import './remote-browser.css';

type RemoteEvent = {
  type: string;
  data?: string;
  text?: string;
  message?: string;
  cancelled?: boolean;
  url?: string;
};
function wsEndpoint(): string {
  const configured = import.meta.env.VITE_REMOTE_BROWSER_WS_URL as string | undefined;
  if (configured) return configured;
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return scheme + '//' + window.location.host + '/remote-browser/ws';
}
function keyCommand(event: KeyboardEvent<HTMLDivElement>) {
  const name = event.key === ' ' ? 'Space' : event.key;
  const allowed = ['Enter', 'Escape', 'Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
    return { type: 'type', text: event.key };
  }
  if (!allowed.includes(name) && !(event.metaKey || event.ctrlKey)) return null;
  const modifiers = [event.ctrlKey ? 'Control' : '', event.metaKey ? 'Meta' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : ''].filter(Boolean);
  const finalKey = event.key.length === 1 ? event.key.toUpperCase() : name;
  return { type: 'key', key: [...modifiers, finalKey].join('+') };
}

export function RemoteBrowserControl() {
  const ws = useRef<WebSocket | null>(null);
  const moveAt = useRef(0);
  const [token, setToken] = useState('');
  const [profile, setProfile] = useState('default');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState('Disconnected');
  const [error, setError] = useState('');
  const [frame, setFrame] = useState('');
  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  useEffect(() => () => { ws.current?.close(); }, []);

  function send(action: Record<string, unknown>) {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(action));
  }
  function disconnect() {
    ws.current?.close();
    ws.current = null;
    setConnected(false);
    setConnecting(false);
    setBusy(false);
    setFrame('');
    setStatus('Disconnected');
  }
  function connect() {
    if (!token || !/^[A-Za-z0-9_-]{1,48}$/.test(profile) || connecting) return;
    setConnecting(true); setError(''); setStatus('Connecting…'); setFrame(''); setReply('');
    const socket = new WebSocket(wsEndpoint());
    ws.current?.close();
    ws.current = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', token }));
    socket.onmessage = (message) => {
      let event: RemoteEvent;
      try { event = JSON.parse(String(message.data)) as RemoteEvent; } catch { return; }
      if (ws.current !== socket) return;
      switch (event.type) {
        case 'authenticated':
          socket.send(JSON.stringify({ type: 'open', profileId: profile }));
          setStatus('Starting remote Chromium…');
          break;
        case 'opened':
          setConnected(true); setConnecting(false); setStatus('Browser ready — ' + (event.url || 'ChatGPT'));
          break;
        case 'frame':
          if (typeof event.data === 'string') setFrame(event.data);
          break;
        case 'status':
          setStatus(event.text || 'Connected');
          break;
        case 'prompt_submitted':
          setStatus('Waiting for ChatGPT…');
          break;
        case 'response_delta':
          setReply(prev => prev + (event.text || ''));
          break;
        case 'response_replace':
          setReply(event.text || '');
          break;
        case 'response_done':
          setBusy(false);
          setStatus(event.cancelled ? 'Generation stopped' : 'Reply complete');
          break;
        case 'error':
          setError(event.message || 'Browser service error');
          setBusy(false);
          break;
      }
    };
    socket.onerror = () => { if (ws.current === socket) setError('Cannot reach the remote browser. Check the service address and HTTPS proxy.'); };
    socket.onclose = () => {
      if (ws.current !== socket) return;
      setConnecting(false); setConnected(false); setBusy(false); setFrame('');
      setStatus('Disconnected');
      ws.current = null;
    };
  }
  function coordinates(event: MouseEvent<HTMLImageElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    };
  }
  function click(event: MouseEvent<HTMLImageElement>) {
    send({ type: 'click', ...coordinates(event), button: 'left' });
    event.currentTarget.focus();
  }
  function move(event: MouseEvent<HTMLImageElement>) {
    if (Date.now() - moveAt.current < 60) return;
    moveAt.current = Date.now();
    send({ type: 'move', ...coordinates(event) });
  }
  function wheel(event: WheelEvent<HTMLDivElement>) {
    send({ type: 'wheel', deltaX: Math.max(-1000, Math.min(1000, event.deltaX)), deltaY: Math.max(-1000, Math.min(1000, event.deltaY)) });
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const action = keyCommand(event);
    if (action) { event.preventDefault(); send(action); }
  }
  function execute() {
    if (!connected || busy || !prompt.trim() || prompt.length > 8000) return;
    setReply(''); setError(''); setBusy(true);
    send({ type: 'prompt', text: prompt.trim() });
  }
  return <section className="remote-browser" aria-label="Remote ChatGPT browser">
    <div className="remote-browser-heading">
      <div className="remote-browser-icon"><Monitor size={20} /></div>
      <div><h2>Remote browser control</h2>
        <p>Sign in yourself, handle any challenge manually, then run ChatGPT prompts and see live replies here.</p>
      </div>
    </div>
    <div className="remote-browser-connect">
      <label>Browser access token
        <input type="password" value={token} autoComplete="off" placeholder="Service access token (not your ChatGPT password)"
          onChange={event => setToken(event.target.value)} disabled={connected || connecting} />
      </label>
      <label>Profile ID
        <input value={profile} maxLength={48} placeholder="default" onChange={event => setProfile(event.target.value)}
          disabled={connected || connecting} />
      </label>
      {connected || connecting
        ? <button type="button" onClick={disconnect}>Disconnect</button>
        : <button type="button" onClick={connect} disabled={!token || !/^[A-Za-z0-9_-]{1,48}$/.test(profile)}>Connect</button>}
    </div>
    <p className="remote-browser-status" role="status">{status}</p>
    {error && <p className="remote-browser-error" role="alert">{error}</p>}
    {connected && <div className="remote-browser-controls">
      <button type="button" disabled={busy} onClick={() => send({ type: 'back' })}><ArrowLeft size={16} /> Back</button>
      <button type="button" disabled={busy} onClick={() => send({ type: 'reload' })}><RefreshCw size={16} /> Reload</button>
      <button type="button" disabled={busy} onClick={() => send({ type: 'navigate', url: 'https://chatgpt.com/' })}>Open ChatGPT</button>
    </div>}
    <div className="remote-browser-stage" onWheel={wheel} onKeyDown={keyDown} tabIndex={connected ? 0 : -1}
      aria-label="Interactive remote browser viewport" role="application">
      {frame && connected
        ? <img src={'data:image/jpeg;base64,' + frame} alt="Live remote Chromium screen" draggable={false}
            onClick={click} onMouseMove={move} onContextMenu={event => { event.preventDefault(); send({ type: 'click', ...coordinates(event), button: 'right' }); }} />
        : <div className="remote-browser-placeholder"><LockKeyhole size={26}/><span>Connect to show the remote browser</span></div>}
    </div>
    {connected && <div className="remote-browser-type">
      <label htmlFor="remote-browser-typing">Type into the focused browser field (mobile keyboard)</label>
      <div><input id="remote-browser-typing" type="text" value={typed} autoComplete="off" onChange={event => setTyped(event.target.value)}
        placeholder="Text to enter in the remote browser" disabled={busy} />
        <button type="button" disabled={!typed || busy} onClick={() => { send({ type: 'type', text: typed }); setTyped(''); }}>Type</button>
        <button type="button" disabled={busy} onClick={() => send({ type: 'key', key: 'Enter' })}>Enter</button>
        <button type="button" disabled={busy} onClick={() => send({ type: 'key', key: 'Backspace' })}>⌫</button>
      </div>
    </div>}
    <label className="remote-browser-prompt-label" htmlFor="remote-browser-prompt">Automated prompt</label>
    <textarea id="remote-browser-prompt" value={prompt} maxLength={8000} rows={4}
      onChange={event => setPrompt(event.target.value)} placeholder="Ask ChatGPT something in this browser session…" />
    <div className="remote-browser-prompt-actions">
      <span>{prompt.length} / 8000</span>
      <button type="button" disabled={!connected || busy || !prompt.trim()} onClick={execute}><Play size={15} /> Run prompt</button>
      {busy && <button type="button" onClick={() => send({ type: 'cancel' })}><Square size={14} /> Stop</button>}
    </div>
    <div className="remote-browser-reply" aria-live="polite">
      <strong>Live response</strong>
      <pre>{reply || (busy ? 'Waiting for ChatGPT…' : 'The response will appear here after you run a prompt.')}</pre>
    </div>
    <p className="remote-browser-disclaimer">The token is held only in this page’s memory. ChatGPT cookies remain in the private server profile volume. This is an optional single-operator service; never expose it publicly without TLS, origin restrictions and a strong access token. Login challenges are completed manually and are never bypassed.</p>
  </section>;
}
