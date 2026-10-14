import '../remote-browser.css';
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { ArrowRight, CircleStop, ExternalLink, KeyRound, LoaderCircle, MonitorPlay, RotateCcw, ShieldCheck, Wifi, WifiOff } from 'lucide-react';

type RunState = { runId: string; state: 'running' | 'complete' | 'cancelled' | 'error'; text: string; error?: string };
type BrowserStatus = { authenticated?: boolean; type?: string; ready?: boolean; busy?: boolean; url?: string | null; run?: RunState | null };
type RemoteMessage = BrowserStatus & { type: string; image?: string; message?: string; text?: string; state?: RunState['state']; runId?: string; error?: string };

export function RemoteBrowser() {
  const [availability, setAvailability] = useState<'checking' | 'online' | 'offline'>('checking');
  const [authenticated, setAuthenticated] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [connected, setConnected] = useState(false);
  const [browserReady, setBrowserReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [frame, setFrame] = useState('');
  const [prompt, setPrompt] = useState('');
  const [run, setRun] = useState<RunState | null>(null);
  const [message, setMessage] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);

  const check = useCallback(async () => {
    try {
      const response = await fetch('/browser/status', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Browser service unavailable');
      const status = await response.json() as BrowserStatus;
      setAvailability('online');
      setAuthenticated(Boolean(status.authenticated));
      setBrowserReady(Boolean(status.ready));
      if (status.run) setRun(status.run);
    } catch {
      setAvailability('offline');
      setAuthenticated(false);
    }
  }, []);

  useEffect(() => { void check(); }, [check]);
  useEffect(() => {
    if (!authenticated) return;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    const connect = () => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}/browser/ws`);
      wsRef.current = ws;
      ws.onopen = () => { delay = 1000; setConnected(true); setMessage(''); };
      ws.onmessage = event => {
        let data: RemoteMessage;
        try { data = JSON.parse(event.data) as RemoteMessage; } catch { return; }
        if (data.type === 'frame' && data.image) setFrame(data.image);
        if (data.type === 'status') {
          setBrowserReady(Boolean(data.ready));
          setBusy(Boolean(data.busy));
          if (data.run) setRun(data.run);
        }
        if (data.type === 'response' && data.runId && data.state) {
          setRun({ runId: data.runId, state: data.state, text: data.text || '', error: data.error });
        }
        if (data.type === 'error') setMessage(data.message || 'Remote action failed.');
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        setConnected(false);
        if (!stopped) {
          retry = setTimeout(connect, delay);
          delay = Math.min(10000, delay * 2);
        }
      };
      ws.onerror = () => setMessage('Remote connection interrupted. Reconnecting...');
    };
    connect();
    return () => { stopped = true; if (retry) clearTimeout(retry); wsRef.current?.close(); wsRef.current = null; setConnected(false); };
  }, [authenticated]);

  const send = (data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(data));
  };
  async function signIn(event: FormEvent) {
    event.preventDefault();
    setMessage(''); setSigningIn(true);
    try {
      const response = await fetch('/browser/auth', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: accessCode }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to unlock browser');
      setAccessCode('');
      setAuthenticated(true);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to sign in'); }
    finally { setSigningIn(false); }
  }
  async function signOut() {
    await fetch('/browser/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    setAuthenticated(false); setConnected(false); setFrame(''); setRun(null);
  }
  function pointer(event: PointerEvent<HTMLDivElement>, action: 'down' | 'up' | 'move') {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (action === 'down') {
      screenRef.current?.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (action === 'up' && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    send({ type: 'pointer', action,
      x: Math.max(0, Math.min(1280, (event.clientX - rect.left) / rect.width * 1280)),
      y: Math.max(0, Math.min(800, (event.clientY - rect.top) / rect.height * 800)),
      button: event.button === 2 ? 'right' : 'left' });
  }
  function wheel(event: WheelEvent<HTMLDivElement>) {
    send({ type: 'pointer', action: 'scroll', x: 0, y: 0, dx: event.deltaX, dy: event.deltaY });
  }
  function key(event: KeyboardEvent<HTMLDivElement>) {
    if (!connected || ['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
    event.preventDefault();
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') return;
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      send({ type: 'insert', text: event.key });
      return;
    }
    const mods = [event.ctrlKey && 'Control', event.metaKey && 'Meta', event.altKey && 'Alt', event.shiftKey && 'Shift'].filter(Boolean);
    const keyName = event.key === ' ' ? 'Space' : event.key;
    send({ type: 'key', key: [...mods, keyName].join('+') });
  }
  const ready = authenticated && connected && browserReady;
  return <section className="remote-browser" aria-label="Remote ChatGPT browser">
    <div className="remote-head">
      <div><span className="remote-eyebrow"><MonitorPlay size={15} /> LIVE BROWSER SESSION</span>
        <h2>ChatGPT, inside Astra.</h2>
        <p>Control a persistent browser, sign in directly, and stream replies from your own session.</p>
      </div>
      <span className="remote-state">{connected ? <Wifi size={15}/> : <WifiOff size={15}/>}
        {connected ? 'Connected' : availability === 'checking' ? 'Checking' : 'Disconnected'}</span>
    </div>
    {availability === 'offline' ? <div className="remote-empty" role="alert">
      <strong>Remote browser service not deployed.</strong>
      <p>Start the self-hosted browser stack with Docker Compose. The Lovable-hosted app does not run the separate Chromium service automatically.</p>
      <button type="button" onClick={() => void check()}><RotateCcw size={15}/> Retry connection</button>
    </div> : !authenticated ? <form className="remote-unlock" onSubmit={e => void signIn(e)}>
      <KeyRound size={24} /><strong>Unlock private browser control</strong>
      <p>Use the remote-browser access code configured on your server. This is separate from your ChatGPT login.</p>
      <label htmlFor="remote-access-code">Browser access code</label>
      <input id="remote-access-code" type="password" autoComplete="current-password" required minLength={16}
        value={accessCode} onChange={e => setAccessCode(e.target.value)} />
      <button type="submit" disabled={signingIn || accessCode.length < 16}>
        {signingIn ? <LoaderCircle size={16} className="remote-spin"/> : <ArrowRight size={16}/>} Unlock browser
      </button>
    </form> : <>
      <div className="remote-toolbar">
        <span><span className="remote-dot"/> {browserReady ? 'Chromium session active' : 'Starting Chromium...'}</span>
        <div><button type="button" onClick={() => send({ type: 'navigate' })} disabled={!ready} title="Return to ChatGPT"><RotateCcw size={14}/> Open ChatGPT</button>
          <button type="button" onClick={() => void signOut()}>Lock</button></div>
      </div>
      <div ref={screenRef} tabIndex={0} role="application" aria-label="Interactive remote browser. Click to focus, then use the keyboard."
        className="remote-screen" onPointerDown={e => pointer(e, "down")} onPointerMove={e => pointer(e, "move")} onPointerUp={e => pointer(e, "up")} onContextMenu={e => e.preventDefault()}
        onWheel={wheel} onKeyDown={key}
        onPaste={e => { e.preventDefault(); send({ type: 'insert', text: e.clipboardData.getData('text/plain').slice(0, 8000) }); }}>
        {frame ? <img src={`data:image/jpeg;base64,${frame}`} alt="Live Chromium browser session" draggable={false}/>
          : <div className="remote-screen-wait"><LoaderCircle size={25} className="remote-spin"/> Waiting for browser frames...</div>}
      </div>
      <p className="remote-help"><ShieldCheck size={14}/> Login and verification stay in the browser view. Never share this service publicly without HTTPS and authentication.</p>
      <form className="remote-prompt" onSubmit={e => { e.preventDefault(); if (ready && !busy && prompt.trim()) { setMessage(''); send({ type: 'run', prompt, runId: crypto.randomUUID() }); } }}>
        <label htmlFor="remote-prompt">Automate a ChatGPT prompt</label>
        <textarea id="remote-prompt" rows={3} maxLength={8000} placeholder="Ask ChatGPT something in the active session..."
          value={prompt} onChange={e => setPrompt(e.target.value)} />
        <div className="remote-prompt-actions"><span>{prompt.length} / 8000</span>
          {busy ? <button type="button" onClick={() => send({ type: 'cancel' })}><CircleStop size={16}/> Stop</button>
            : <button type="submit" disabled={!ready || !prompt.trim()}><ArrowRight size={16}/> Run prompt</button>}
        </div>
      </form>
      {run && <div className="remote-output" aria-live="polite">
        <div><strong>Assistant response</strong><span>{run.state}</span></div>
        <pre>{run.text || (run.state === 'running' ? 'Waiting for ChatGPT...' : 'No response text.')}</pre>
        {run.error && <p role="alert">{run.error}</p>}
      </div>}
    </>}
    {message && <p className="remote-error" role="alert">{message}</p>}
    <p className="remote-foot">Browser automation depends on ChatGPT's current interface and can break when it changes. <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Open ChatGPT separately <ExternalLink size={12}/></a></p>
  </section>;
}
