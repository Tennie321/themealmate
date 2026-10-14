import { useEffect, useRef, useState, type MouseEvent, type WheelEvent, type TouchEvent } from 'react';
import { ArrowRight, CircleStop, ExternalLink, MonitorPlay, RefreshCw, ShieldCheck } from 'lucide-react';
import './RemoteChatGPT.css';

type ConnectState = 'disconnected' | 'connecting' | 'connected';
type Ticket = { wsUrl?: string; ticket?: string; error?: string };
type WireEvent = { type: string; jpeg?: string; url?: string; busy?: boolean; id?: string; text?: string; message?: string };
const WIDTH = 1280;
const HEIGHT = 800;

/** Streams a dedicated browser (not an iframe) after a signed, single-use access check. */
export function RemoteChatGPT() {
  const socket = useRef<WebSocket | null>(null);
  const [connection, setConnection] = useState<ConnectState>('disconnected');
  const [frame, setFrame] = useState('');
  const [host, setHost] = useState('');
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState('');
  const [typing, setTyping] = useState('');
  const [privateTyping, setPrivateTyping] = useState(false);
  const [error, setError] = useState('');
  const [runId, setRunId] = useState('');
  const touchY = useRef<number | null>(null);
  const lastMove = useRef(0);

  function send(value: object) {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(value));
  }
  function disconnect() {
    const ws = socket.current;
    socket.current = null;
    ws?.close(1000, 'Viewer disconnected');
    setConnection('disconnected');
    setFrame('');
    setHost('');
    setBusy(false);
  }
  useEffect(() => () => {
    socket.current?.close(1000, 'Viewer left');
    socket.current = null;
  }, []);

  async function connect() {
    if (connection !== 'disconnected') return;
    setError(''); setConnection('connecting');
    try {
      const response = await fetch('/api/browser/ticket', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
      const grant = await response.json() as Ticket;
      if (!response.ok || !grant.ticket || !grant.wsUrl) throw new Error(grant.error || 'Unable to authorize browser connection.');
      const ws = new WebSocket(grant.wsUrl, ['astra.browser.v1', 'ticket.' + grant.ticket]);
      socket.current = ws;
      ws.onopen = () => { if (socket.current === ws) setConnection('connected'); };
      ws.onmessage = event => {
        if (socket.current !== ws) return;
        let message: WireEvent;
        try { message = JSON.parse(event.data) as WireEvent; } catch { return; }
        if (message.type === 'frame' && message.jpeg) setFrame('data:image/jpeg;base64,' + message.jpeg);
        if (message.type === 'status') {
          setHost(message.url || '');
          setBusy(Boolean(message.busy));
        }
        if (message.type === 'run:start') { setReply(''); setBusy(true); }
        if (message.type === 'run:delta') setReply(text => text + (message.text || ''));
        if (message.type === 'run:replace') setReply(message.text || '');
        if (message.type === 'run:done') { setReply(message.text || ''); setBusy(false); }
        if (message.type === 'run:error') { setError(message.message || 'Automation failed.'); setBusy(false); }
        if (message.type === 'error') setError(message.message || 'Browser error.');
      };
      ws.onerror = () => { if (socket.current === ws) setError('Browser connection failed. Check the sidecar and TLS proxy.'); };
      ws.onclose = () => {
        if (socket.current === ws) {
          socket.current = null; setConnection('disconnected'); setBusy(false); setFrame('');
        }
      };
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to connect.');
      setConnection('disconnected');
    }
  }
  function location(event: MouseEvent<HTMLImageElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(WIDTH, (event.clientX - rect.left) / rect.width * WIDTH)),
      y: Math.max(0, Math.min(HEIGHT, (event.clientY - rect.top) / rect.height * HEIGHT)),
    };
  }
  function click(event: MouseEvent<HTMLImageElement>) {
    if (!busy) send({ type: 'mouse', action: 'click', ...location(event) });
  }
  function move(event: MouseEvent<HTMLImageElement>) {
    if (busy || Date.now() - lastMove.current < 100) return;
    lastMove.current = Date.now();
    send({ type: 'mouse', action: 'move', ...location(event) });
  }
  function wheel(event: WheelEvent<HTMLImageElement>) {
    if (busy) return;
    event.preventDefault();
    send({ type: 'scroll', deltaY: Math.max(-1600, Math.min(1600, event.deltaY)) });
  }
  function startTouch(event: TouchEvent<HTMLImageElement>) { touchY.current = event.touches[0]?.clientY ?? null; }
  function endTouch(event: TouchEvent<HTMLImageElement>) {
    if (busy || touchY.current === null) return;
    const delta = touchY.current - (event.changedTouches[0]?.clientY ?? touchY.current);
    if (Math.abs(delta) > 15) { event.preventDefault(); send({ type: 'scroll', deltaY: delta * 2 }); }
    touchY.current = null;
  }
  function submit() {
    if (!prompt.trim() || prompt.length > 8000 || busy) return;
    setError('');
    const id = crypto.randomUUID();
    setRunId(id);
    setReply(''); setBusy(true);
    send({ type: 'run', id, prompt });
  }
  function typeAtCursor() {
    if (!typing || busy) return;
    send({ type: 'type', text: typing });
    setTyping('');
  }

  return <section className="remote-chatgpt" aria-label="Remote ChatGPT browser">
    <div className="remote-heading">
      <span className="remote-icon"><MonitorPlay size={20} /></span>
      <div><span className="chatgpt-bridge-eyebrow">EXPERIMENTAL · SELF-HOSTED</span><h2>Live browser control</h2></div>
    </div>
    <p>View and operate a private Playwright browser running ChatGPT. Sign in and complete any challenges yourself; then send prompts and watch the replies stream below.</p>
    <div className="remote-toolbar">
      <span className={'remote-indicator ' + connection}>{connection === 'connected' ? 'Connected' : connection === 'connecting' ? 'Connecting…' : 'Disconnected'}</span>
      {host && <span className="remote-host">{host}</span>}
      {connection === 'disconnected' ?
        <button onClick={() => void connect()} type="button" className="remote-primary">Connect browser <ArrowRight size={15} /></button> :
        <button onClick={disconnect} type="button" className="remote-secondary">Disconnect</button>}
      <button type="button" disabled={connection !== 'connected' || busy} className="remote-secondary" onClick={() => send({ type: 'home' })}><RefreshCw size={14} /> ChatGPT home</button>
      <a href="https://chatgpt.com/" target="_blank" rel="noreferrer noopener" className="remote-fallback">Open normally <ExternalLink size={13} /></a>
    </div>
    <div className="remote-screen">
      {frame ?
        <img src={frame} alt="Live screenshot of remote ChatGPT browser. Click to interact." draggable={false}
          onClick={click} onMouseMove={move} onWheel={wheel} onTouchStart={startTouch} onTouchEnd={endTouch} /> :
        <div className="remote-placeholder"><MonitorPlay size={32} /><span>{connection === 'connecting' ? 'Starting the secure browser…' : connection === 'connected' ? 'Preparing the browser display…' : 'Connect to view the browser'}</span></div>}
    </div>
    {connection === 'connected' && <div className="remote-controls">
      <label className="remote-field">Type at selected browser field
        <div className="remote-inline"><input type={privateTyping ? 'password' : 'text'} autoComplete="off" value={typing} maxLength={2000}
          onChange={event => setTyping(event.target.value)} placeholder="Click a browser field, then type here"
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); typeAtCursor(); } }} />
          <button type="button" disabled={!typing || busy} onClick={typeAtCursor}>Type</button></div>
      </label>
      <label className="remote-check"><input type="checkbox" checked={privateTyping} onChange={event => setPrivateTyping(event.target.checked)} /> Hide input (for sensitive fields)</label>
      <div className="remote-keyboard">{['Tab', 'Enter', 'Backspace', 'Escape', 'ArrowUp', 'ArrowDown'].map(key =>
        <button key={key} type="button" disabled={busy} onClick={() => send({ type: 'key', key })}>{key}</button>)}</div>
    </div>}
    <div className="remote-automation">
      <label htmlFor="remote-chatgpt-prompt">Automate a message in the active ChatGPT session</label>
      <textarea id="remote-chatgpt-prompt" rows={4} maxLength={8000} value={prompt}
        onChange={event => setPrompt(event.target.value)} placeholder="What should ChatGPT do?" />
      <div className="remote-toolbar">
        <button type="button" className="remote-primary" disabled={connection !== 'connected' || busy || !prompt.trim()}
          onClick={submit}>Send prompt <ArrowRight size={15} /></button>
        <button type="button" className="remote-secondary" disabled={!busy || connection !== 'connected'}
          onClick={() => send({ type: 'stop' })}><CircleStop size={15} /> Stop</button>
        <span className="remote-count">{prompt.length}/8000</span>
      </div>
      <label htmlFor="remote-chatgpt-response">Live assistant response {busy ? '· streaming' : runId ? '· last run' : ''}</label>
      <div id="remote-chatgpt-response" className="remote-response" role="log" aria-live="polite">{reply || 'The ChatGPT reply will appear here when a run starts.'}</div>
    </div>
    {error && <p className="remote-error" role="alert">{error}</p>}
    <p className="remote-warning"><ShieldCheck size={15} /> The browser profile stores your ChatGPT login locally on the sidecar volume. Use only on a private deployment with HTTPS/WSS and a strong Astra access code. This uses ChatGPT's website, not an official API.</p>
  </section>;
}
