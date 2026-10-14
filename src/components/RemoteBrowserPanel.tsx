import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { ArrowUp, ExternalLink, Keyboard, MonitorPlay, RefreshCw, ShieldCheck, Square, Wifi, WifiOff } from 'lucide-react';
import '../remote-browser.css';

type RemoteEvent = {
  type: string;
  state?: string;
  message?: string;
  data?: string;
  delta?: string;
  id?: string;
};

const VIEWPORT = { width: 1280, height: 800 };
const keys = new Set([
  'Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'Space', 'ArrowUp', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Control+A',
  'Meta+A', 'Control+C', 'Meta+C', 'Control+V', 'Meta+V',
]);

/** Dedicated same-origin service; a Lovable-only deployment cannot host its WebSocket. */
export function RemoteBrowserPanel() {
  const socket = useRef<WebSocket | null>(null);
  const runningId = useRef<string | null>(null);
  const lastMove = useRef(0);
  const [state, setState] = useState<'offline' | 'connecting' | 'starting' | 'ready'>('offline');
  const [frame, setFrame] = useState('');
  const [error, setError] = useState('');
  const [browserText, setBrowserText] = useState('');
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => () => { socket.current?.close(); socket.current = null; }, []);
  const send = (value: Record<string, unknown>) => {
    if (socket.current?.readyState !== WebSocket.OPEN) {
      setError('Connect the remote browser first.');
      return false;
    }
    socket.current.send(JSON.stringify(value));
    return true;
  };
  const connect = () => {
    if (socket.current && socket.current.readyState <= WebSocket.OPEN) return;
    setError('');
    setFrame('');
    setState('connecting');
    const url = new URL('/browser/ws', window.location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws: WebSocket;
    try { ws = new WebSocket(url); }
    catch { setState('offline'); setError('WebSocket could not be opened.'); return; }
    socket.current = ws;
    ws.onmessage = event => {
      let message: RemoteEvent;
      try { message = JSON.parse(String(event.data)) as RemoteEvent; }
      catch { return; }
      if (message.type === 'status') {
        if (message.state === 'ready') setState('ready');
        else if (message.state === 'starting') setState('starting');
        else if (message.state === 'error') setError(message.message || 'Browser start failed.');
      } else if (message.type === 'frame' && message.data) {
        setFrame('data:image/jpeg;base64,' + message.data);
      } else if (message.type === 'prompt.delta' && message.id === runningId.current) {
        setResponse(previous => previous + (message.delta || ''));
      } else if ((message.type === 'prompt.done' || message.type === 'prompt.error') &&
                 message.id === runningId.current) {
        setWorking(false);
        runningId.current = null;
        if (message.type === 'prompt.error') setError(message.message || 'API request failed.');
      } else if (message.type === 'error') {
        setError(message.message || 'Remote control input failed.');
      }
    };
    ws.onerror = () => setError('Unable to reach the authenticated remote browser service. Check the same-origin reverse proxy.');
    ws.onclose = () => {
      if (socket.current === ws) socket.current = null;
      setState('offline');
      setWorking(false);
      runningId.current = null;
    };
  };
  const disconnect = () => { socket.current?.close(); socket.current = null; setState('offline'); };
  const point = (event: PointerEvent<HTMLImageElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.round((event.clientX - bounds.left) * VIEWPORT.width / bounds.width),
      y: Math.round((event.clientY - bounds.top) * VIEWPORT.height / bounds.height),
    };
  };
  const mouse = (action: 'down' | 'up' | 'move', event: PointerEvent<HTMLImageElement>) => {
    if (state !== 'ready') return;
    if (action === 'move') {
      if (Date.now() - lastMove.current < 85) return;
      lastMove.current = Date.now();
    }
    const button = event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left';
    send({ type: 'input.mouse', action, ...point(event), button });
    if (action === 'down') {
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.parentElement?.focus();
    }
    if (action === 'up' && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const remoteKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const base = event.key === ' ' ? 'Space' : event.key;
    const key = (event.metaKey ? 'Meta+' : event.ctrlKey ? 'Control+' : '') +
      ((event.metaKey || event.ctrlKey) && base.length === 1 ? base.toUpperCase() : base);
    if (keys.has(key) && state === 'ready') {
      event.preventDefault();
      send({ type: 'input.key', key });
    }
  };
  const wheel = (event: WheelEvent<HTMLImageElement>) => {
    if (state === 'ready') send({ type: 'input.wheel', deltaY: Math.max(-1000, Math.min(1000, event.deltaY)) });
  };
  const typeIntoBrowser = () => {
    if (browserText.trim() && send({ type: 'input.text', text: browserText.slice(0, 2000) })) setBrowserText('');
  };
  const submit = () => {
    if (!prompt.trim() || prompt.length > 8000 || working) return;
    const id = crypto.randomUUID();
    runningId.current = id;
    setWorking(true);
    setError('');
    setResponse('');
    if (!send({ type: 'prompt.submit', id, prompt: prompt.trim() })) {
      runningId.current = null;
      setWorking(false);
    }
  };

  return <section className="remote-browser-panel" aria-label="Remote browser control">
    <header className="remote-browser-header">
      <div className="remote-browser-heading"><span className="remote-browser-icon"><MonitorPlay size={20}/></span>
        <div><span className="remote-browser-eyebrow">LIVE BROWSER WORKSPACE</span><h2>Remote browser studio</h2></div>
      </div>
      <div className="remote-browser-connection">
        <span className={'remote-browser-state state-' + state}>{state === 'ready' ? <Wifi size={14}/> : <WifiOff size={14}/>} {state}</span>
        {state === 'offline' ? <button type="button" onClick={connect} className="remote-browser-connect">Connect browser</button>
          : <button type="button" onClick={disconnect} className="remote-browser-secondary">Disconnect</button>}
      </div>
    </header>
    <p className="remote-browser-description">Control a private Chromium session from this screen. Sign in and complete any verification manually. Browser sessions persist on your own Docker host.</p>
    <div className="remote-browser-layout">
      <div className="remote-browser-view">
        <div className="remote-browser-toolbar"><span className="remote-browser-address">chatgpt.com · interactive view</span>
          <button type="button" onClick={() => send({ type: 'browser.reload' })} disabled={state !== 'ready'} aria-label="Reload remote browser"><RefreshCw size={16}/></button>
          <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" aria-label="Open ChatGPT directly"><ExternalLink size={15}/></a>
        </div>
        <div className="remote-browser-screen" tabIndex={0} role="application" aria-label="Remote Chromium screen; click then use navigation keys" onKeyDown={remoteKey}>
          {frame && state === 'ready' ? <img src={frame} alt="Live remote browser" draggable={false}
            onContextMenu={event => event.preventDefault()}
            onPointerDown={event => mouse('down', event)}
            onPointerUp={event => mouse('up', event)}
            onPointerMove={event => mouse('move', event)}
            onWheel={wheel} /> : <div className="remote-browser-empty"><MonitorPlay size={38}/>
            <strong>{state === 'offline' ? 'Browser not connected' : 'Starting secure browser…'}</strong>
            <span>{state === 'offline' ? 'Connect to view your remote session.' : 'The first frame will appear here.'}</span></div>}
        </div>
        <div className="remote-browser-type"><Keyboard size={17}/>
          <input aria-label="Type into selected browser field" value={browserText} onChange={event => setBrowserText(event.target.value)}
            maxLength={2000} placeholder="Click a field above, then type here…" disabled={state !== 'ready'}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); typeIntoBrowser(); } }} />
          <button type="button" disabled={!browserText || state !== 'ready'} onClick={typeIntoBrowser}>Type</button>
          <button type="button" disabled={state !== 'ready'} onClick={() => send({ type: 'input.key', key: 'Enter' })}>Enter</button>
        </div>
      </div>
      <div className="remote-browser-api">
        <div className="remote-browser-api-title"><span>WORKFLOW RUNNER</span><strong>Official OpenAI API</strong></div>
        <p>Submit a prompt and receive its response live. This uses an <strong>independent API conversation</strong>, not the signed-in ChatGPT page. API billing is separate.</p>
        <label htmlFor="remote-browser-prompt">Prompt</label>
        <textarea id="remote-browser-prompt" rows={6} maxLength={8000} value={prompt} onChange={event => setPrompt(event.target.value)}
          placeholder="Ask the API to analyze, draft or plan a workflow…" />
        <div className="remote-browser-api-actions"><small>{prompt.length}/8000</small>
          {working ? <button type="button" onClick={() => send({ type: 'prompt.cancel' })}><Square size={15}/> Stop</button>
            : <button type="button" disabled={!prompt.trim() || state !== 'ready'} onClick={submit}>Run prompt <ArrowUp size={15}/></button>}
        </div>
        <div className="remote-browser-reply" aria-live="polite">
          <span>{working ? 'STREAMING RESPONSE' : 'API RESPONSE'}</span>
          <div>{response || 'Response text will appear here as it streams.'}</div>
        </div>
      </div>
    </div>
    {error && <p className="remote-browser-alert" role="alert">{error}</p>}
    <footer className="remote-browser-foot"><ShieldCheck size={16}/> Remote login stays in your persistent browser profile. No CAPTCHA bypass or automatic extraction of ChatGPT website output.</footer>
  </section>;
}
