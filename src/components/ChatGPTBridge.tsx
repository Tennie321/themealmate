import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent, type WheelEvent, type ClipboardEvent } from 'react';
import { ArrowRight, ExternalLink, LockKeyhole, MessageSquare, MonitorPlay, PlugZap, RotateCw, ShieldCheck, Square, Unplug } from 'lucide-react';
import { buildChatGPTHandoffURL, CHATGPT_HANDOFF_LIMIT } from '../lib/chatgpt-bridge';

type ConnectionState = 'disconnected' | 'connecting' | 'starting' | 'connected';
type BridgeEvent = {
  type: string; state?: ConnectionState; image?: string; url?: string; viewport?: { width: number; height: number };
  text?: string; id?: string; message?: string;
};
const MAX_PROMPT = 8000;

export function ChatGPTBridge() {
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [prompt, setPrompt] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');
  const [reply, setReply] = useState('');
  const [issue, setIssue] = useState('');
  const [busy, setBusy] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const [browserText, setBrowserText] = useState('');
  const [browserUrl, setBrowserUrl] = useState('https://chatgpt.com/');
  const socket = useRef<WebSocket | null>(null);
  const frame = useRef<HTMLImageElement | null>(null);
  const activeRequest = useRef<string | null>(null);
  const connectCounter = useRef(0);
  const latestPointer = useRef<number>(0);

  const send = (action: Record<string, unknown>) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(action));
  };

  const disconnect = () => {
    connectCounter.current++;
    socket.current?.close(1000, 'Disconnected by user');
    socket.current = null;
    setState('disconnected');
    setFrameReady(false);
    setBusy(false);
    activeRequest.current = null;
  };

  useEffect(() => () => {
    connectCounter.current++;
    socket.current?.close(1000, 'Component unmounted');
  }, []);

  const connect = async () => {
    if (state !== 'disconnected') return;
    const version = ++connectCounter.current;
    setIssue('');
    setState('connecting');
    try {
      const response = await fetch('/api/browser/token', { credentials: 'same-origin', cache: 'no-store' });
      const ticket = await response.json() as { token?: string; error?: string };
      if (!response.ok || !ticket.token) throw new Error(ticket.error || 'The remote browser is not available.');
      if (version !== connectCounter.current) return;
      const endpoint = (import.meta.env.VITE_BROWSER_BRIDGE_URL || window.location.origin).replace(/\/$/, '').replace(/^http/, 'ws');
      const ws = new WebSocket(endpoint + '/browser-api/ws', ['astra.browser.v1', 'auth.' + ticket.token]);
      socket.current = ws;
      ws.onmessage = event => {
        let data: BridgeEvent;
        try { data = JSON.parse(event.data as string) as BridgeEvent; }
        catch { return; }
        if (data.type === 'frame' && typeof data.image === 'string') {
          if (frame.current) frame.current.src = 'data:image/jpeg;base64,' + data.image;
          setFrameReady(ready => ready || true);
        } else if (data.type === 'status') {
          setState(data.state || 'starting');
          if (data.url) setBrowserUrl(data.url);
        } else if (data.type === 'error') {
          setIssue(data.message || 'The browser reported an error.');
        } else if (data.type === 'response.start') {
          activeRequest.current = data.id || null;
          setBusy(true); setReply(''); setIssue('');
        } else if (data.type === 'response.snapshot' && data.id === activeRequest.current) {
          setReply(data.text || '');
        } else if (data.type === 'response.complete' && data.id === activeRequest.current) {
          setReply(data.text || '');
          setBusy(false); activeRequest.current = null;
        } else if (data.type === 'response.error' && data.id === activeRequest.current) {
          setIssue(data.message || 'ChatGPT response failed.');
          setBusy(false); activeRequest.current = null;
        }
      };
      ws.onerror = () => { setIssue('Browser connection failed. Check that the container and WebSocket proxy are running.'); };
      ws.onclose = () => {
        if (socket.current !== ws) return;
        socket.current = null;
        activeRequest.current = null;
        setState('disconnected'); setBusy(false); setFrameReady(false);
      };
    } catch (error) {
      if (version !== connectCounter.current) return;
      setState('disconnected');
      setIssue(error instanceof Error ? error.message : 'Unable to connect to the browser.');
    }
  };

  const sendPrompt = () => {
    const text = prompt.trim();
    if (state !== 'connected' || busy || !text || text.length > MAX_PROMPT) return;
    const id = crypto.randomUUID();
    activeRequest.current = id;
    setLastPrompt(text);
    setReply(''); setIssue('');
    setBusy(true);
    send({ type: 'prompt', id, prompt: text });
    setPrompt('');
  };

  const point = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
  };
  const mouse = (event: PointerEvent<HTMLDivElement>, action: 'down' | 'up' | 'move') => {
    if (state !== 'connected') return;
    if (action === 'move') {
      const now = performance.now();
      if (now - latestPointer.current < 20) return;
      latestPointer.current = now;
    }
    send({ type: 'mouse', action, ...point(event) });
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (state !== 'connected') return;
    // Browser control is isolated to this focused viewer; do not capture global shortcuts.
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key.length === 1 || /^(Enter|Tab|Backspace|Delete|Escape|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown)$/.test(event.key)) {
      event.preventDefault();
      send({ type: 'key', key: event.key });
    }
  };
  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    if (state !== 'connected') return;
    event.preventDefault();
    send({ type: 'wheel', dx: event.deltaX, dy: event.deltaY });
  };
  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (state !== 'connected') return;
    const text = event.clipboardData.getData('text/plain');
    if (text) { event.preventDefault(); send({ type: 'text', text: text.slice(0, 2000) }); }
  };

  const handoffReady = prompt.trim().length > 0 && prompt.trim().length <= CHATGPT_HANDOFF_LIMIT;
  const handoff = handoffReady ? buildChatGPTHandoffURL(prompt) : undefined;

  return <main className="remote-bridge" aria-label="ChatGPT remote browser">
    <header className="remote-header">
      <div>
        <div className="remote-eyebrow"><MonitorPlay size={15} /> CHATGPT WORKSPACE · BETA</div>
        <h1>Browser <em>Control</em></h1>
        <p>Use your own ChatGPT account inside a remote browser, then run prompts and watch replies live.</p>
      </div>
      <div className="remote-header-actions">
        {state === 'disconnected'
          ? <button className="remote-primary" onClick={() => void connect()}><PlugZap size={17} /> Connect browser</button>
          : <button className="remote-secondary" onClick={disconnect}><Unplug size={16} /> Disconnect</button>}
      </div>
    </header>

    <div className="remote-grid">
      <section className="remote-browser-card" aria-label="Remote browser display">
        <div className="remote-browser-toolbar">
          <div className="remote-dots"><i /><i /><i /></div>
          <div className="remote-address"><LockKeyhole size={13} /><span title={browserUrl}>{browserUrl}</span></div>
          <button type="button" title="Refresh ChatGPT tab" aria-label="Refresh remote browser" disabled={state !== 'connected'} onClick={() => send({ type: 'reload' })}><RotateCw size={15} /></button>
        </div>
        <div className={'remote-screen' + (state === 'connected' ? ' active' : '')}
          tabIndex={state === 'connected' ? 0 : -1} role="application"
          aria-label="Remote ChatGPT browser. Click to focus, then use the keyboard."
          onPointerDown={event => { event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); mouse(event, 'down'); }}
          onPointerUp={event => mouse(event, 'up')}
          onPointerCancel={event => mouse(event, 'up')}
          onPointerMove={event => mouse(event, 'move')}
          onKeyDown={keyboard} onWheel={wheel} onPaste={paste}>
          <img ref={frame} alt="Live remote ChatGPT browser view" draggable={false} style={{ display: frameReady ? 'block' : 'none' }} />
          {!frameReady && <div className="remote-screen-empty">
            <span className="remote-screen-icon"><MonitorPlay size={30} /></span>
            <strong>{state === 'connected' || state === 'starting' ? 'Starting browser stream…' : state === 'connecting' ? 'Authorizing session…' : 'Your browser, live in Astra'}</strong>
            <span>{state === 'disconnected' ? 'Connect to launch a secure, persistent Chromium session.' : 'The first frame will appear here.'}</span>
          </div>}
        </div>
        <div className="remote-browser-footer">
          <span className={'remote-status-dot ' + state} />
          <span>{state === 'connected' ? 'Live · Interactive' : state === 'starting' ? 'Launching Chromium' : state === 'connecting' ? 'Connecting' : 'Not connected'}</span>
          <span className="remote-footer-hint">Click to focus · Scroll · Type · Paste</span>
        </div>
        {state === 'connected' && <div className="remote-typebar">
          <input aria-label="Text to insert into focused browser field" type="text" autoComplete="off" spellCheck={false}
            placeholder="Mobile keyboard: type into the focused browser field…" value={browserText}
            onChange={event => setBrowserText(event.target.value)} maxLength={2000}
            onKeyDown={event => { if (event.key === 'Enter' && browserText) { send({ type: 'text', text: browserText }); setBrowserText(''); } }} />
          <button type="button" disabled={!browserText} onClick={() => { send({ type: 'text', text: browserText }); setBrowserText(''); }}>Insert</button>
        </div>}
      </section>

      <section className="remote-automation-card">
        <div className="remote-panel-heading"><MessageSquare size={19} /><div><h2>Prompt automation</h2><span>Active ChatGPT tab</span></div></div>
        <label htmlFor="remote-prompt">Your prompt</label>
        <textarea id="remote-prompt" rows={6} placeholder="Ask ChatGPT anything…"
          value={prompt} maxLength={MAX_PROMPT} onChange={event => setPrompt(event.target.value)} />
        <div className="remote-prompt-count">{prompt.length.toLocaleString()} / {MAX_PROMPT.toLocaleString()}</div>
        <div className="remote-send-actions">
          <button className="remote-primary" disabled={state !== 'connected' || busy || !prompt.trim()} onClick={sendPrompt}>
            {busy ? 'Generating…' : 'Run in ChatGPT'} <ArrowRight size={17} />
          </button>
          {busy && <button className="remote-secondary" onClick={() => send({ type: 'stop' })}><Square size={14} /> Stop</button>}
        </div>
        {issue && <div className="remote-error" role="alert">{issue}</div>}
        {(busy || reply || lastPrompt) && <div className="remote-reply" aria-live="polite">
          <div className="remote-reply-label">{busy ? 'RECEIVING REPLY…' : 'LATEST REPLY'}</div>
          {lastPrompt && <div className="remote-last-prompt">{lastPrompt}</div>}
          <div className="remote-reply-text">{reply || (busy ? 'Waiting for ChatGPT to respond…' : 'No response received yet.')}</div>
        </div>}
        <div className="remote-security"><ShieldCheck size={17} /><span>
          Login and CAPTCHAs are handled manually in the browser above. Browser profile data stays on your browser-service host, not in the Astra frontend. Do not deploy this service publicly without access protection and HTTPS.
        </span></div>
        <div className="remote-fallback">
          <strong>Prefer opening ChatGPT directly?</strong>
          <p>The existing browser handoff still works without the remote service.</p>
          <div className="remote-fallback-links">
            <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Open ChatGPT <ExternalLink size={14} /></a>
            {handoffReady && <a href={handoff} target="_blank" rel="noopener noreferrer">Open prompt there <ArrowRight size={14} /></a>}
          </div>
        </div>
      </section>
    </div>
  </main>;
}
