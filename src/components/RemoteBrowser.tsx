import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { ArrowRight, RefreshCw, Square, MonitorPlay, ShieldCheck } from 'lucide-react';

type BridgeMessage = {
  type: string; data?: string; text?: string; final?: boolean; requestId?: string;
  message?: string; url?: string;
};

export function RemoteBrowser() {
  const socket = useRef<WebSocket | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const pointerId = useRef<number | null>(null);
  const lastMove = useRef(0);
  const activeRequest = useRef<string | null>(null);
  const [status, setStatus] = useState('Connecting to the remote browser…');
  const [connected, setConnected] = useState(false);
  const [frame, setFrame] = useState('');
  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const connect = useCallback(async () => {
    const previous = socket.current;
    socket.current = null;
    previous?.close();
    setConnected(false);
    setFrame('');
    setRunning(false);
    activeRequest.current = null;
    setStatus('Connecting to the remote browser…');
    setError('');
    try {
      const response = await fetch('/api/browser/session', { credentials: 'same-origin', cache: 'no-store' });
      const data: { url?: string; error?: string } = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || 'Browser service is unavailable.');
      const ws = new WebSocket(data.url);
      socket.current = ws;
      ws.onopen = () => { if (socket.current === ws) { setConnected(true); setStatus('Connected — use the browser to sign in.'); } };
      ws.onmessage = event => {
        if (socket.current !== ws) return;
        let msg: BridgeMessage;
        try { msg = JSON.parse(String(event.data)) as BridgeMessage; } catch { return; }
        if (msg.type === 'frame' && typeof msg.data === 'string') setFrame('data:image/jpeg;base64,' + msg.data);
        else if (msg.type === 'ready') setStatus('Browser ready — sign in if needed.');
        else if (msg.type === 'prompt_sent') setStatus('Prompt submitted — receiving the reply…');
        else if (msg.type === 'response' && msg.requestId === activeRequest.current) {
          setReply(msg.text || '');
          if (msg.final) {
            setRunning(false);
            activeRequest.current = null;
            setStatus('Response complete.');
          }
        } else if (msg.type === 'prompt_error' && msg.requestId === activeRequest.current) {
          setRunning(false);
          activeRequest.current = null;
          setError(msg.message || 'The prompt could not be completed.');
        } else if (msg.type === 'error') setError(msg.message || 'Remote browser error.');
      };
      ws.onerror = () => { if (socket.current === ws) setError('Connection failed. Check the browser service and secure WebSocket URL.'); };
      ws.onclose = () => {
        if (socket.current !== ws) return;
        socket.current = null;
        activeRequest.current = null;
        setRunning(false);
        setConnected(false);
        setStatus('Disconnected.');
      };
    } catch (e) { setStatus('Browser unavailable.'); setError(e instanceof Error ? e.message : 'Could not connect.'); }
  }, []);

  useEffect(() => {
    void connect();
    return () => { socket.current?.close(); socket.current = null; };
  }, [connect]);

  const send = (message: Record<string, unknown>) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(message));
  };
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1280, (event.clientX - rect.left) * 1280 / rect.width)),
      y: Math.max(0, Math.min(800, (event.clientY - rect.top) * 800 / rect.height)),
    };
  };
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!connected || running || event.button !== 0 || !frame) return;
    stage.current?.focus();
    pointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    send({ type: 'down', ...point(event) });
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!connected || running || !frame || Date.now() - lastMove.current < 40) return;
    lastMove.current = Date.now();
    send({ type: 'move', ...point(event) });
  };
  const pointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== event.pointerId) return;
    send({ type: 'up', ...point(event) });
    pointerId.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!connected || running) return;
    send({ type: 'scroll', deltaX: Math.max(-1500, Math.min(1500, event.deltaX)), deltaY: Math.max(-1500, Math.min(1500, event.deltaY)) });
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!connected || running) return;
    if ((event.metaKey || event.ctrlKey) && /^[acv]$/i.test(event.key)) {
      event.preventDefault();
      send({ type: 'key', key: 'ControlOrMeta+' + event.key.toUpperCase() });
      return;
    }
    const special = new Set(['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
    if (special.has(event.key)) { event.preventDefault(); send({ type: 'key', key: event.key }); }
    else if (event.key === ' ') { event.preventDefault(); send({ type: 'key', key: 'Space' }); }
    else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      send({ type: 'type', text: event.key });
    }
  };
  const run = () => {
    if (!connected || running || !prompt.trim() || prompt.length > 10_000) return;
    const requestId = crypto.randomUUID();
    activeRequest.current = requestId;
    setReply('');
    setError('');
    setRunning(true);
    send({ type: 'run_prompt', requestId, prompt: prompt.trim() });
    setStatus('Locating the ChatGPT composer…');
  };
  const cancel = () => { send({ type: 'cancel' }); setStatus('Cancelling reply monitoring…'); };

  return <div className="remote-browser" aria-label="Interactive ChatGPT browser">
    <div className="remote-browser-heading">
      <div>
        <div className="chatgpt-bridge-eyebrow">INTERACTIVE SESSION</div>
        <h1>ChatGPT, right<br /><em>inside Astra.</em></h1>
        <p className="chatgpt-bridge-intro">Sign in directly in the remote browser. Then send a prompt and view its response here as it arrives.</p>
      </div>
      <button type="button" onClick={() => void connect()} className="remote-browser-reconnect"><RefreshCw size={16} /> Reconnect</button>
    </div>
    <div className="remote-browser-status" role="status"><MonitorPlay size={16} /> {status}</div>
    {error && <div className="remote-browser-error" role="alert">{error}</div>}
    <div ref={stage} className="remote-browser-stage" tabIndex={0}
      role="application" aria-label="Remote ChatGPT browser. Click to focus; use mouse, keyboard, and paste to interact."
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
      onWheel={wheel} onKeyDown={keyDown}
      onPaste={event => { if (connected && !running) { event.preventDefault(); const value = event.clipboardData.getData('text'); if (value) send({ type: 'type', text: value.slice(0, 2000) }); } }}>
      {frame ? <img src={frame} draggable={false} alt="Live remote browser screen" /> : <div className="remote-browser-placeholder"><MonitorPlay size={36} /><span>Browser screen will appear here when connected.</span></div>}
    </div>
    <p className="remote-browser-hint">Click the screen to focus, then type normally. Mouse clicks, drag interactions, scrolling, keyboard and paste are forwarded to the container. Complete any verification yourself.</p>
    <div className="remote-browser-console">
      <label className="chatgpt-bridge-label" htmlFor="remote-browser-prompt">Automated prompt</label>
      <textarea id="remote-browser-prompt" className="chatgpt-bridge-input" rows={4} maxLength={10_000} value={prompt}
        onChange={e => setPrompt(e.target.value)} placeholder="Ask ChatGPT something…" />
      <div className="remote-browser-actions">
        <span>{prompt.length} / 10,000</span>
        {running ? <button type="button" className="remote-browser-reconnect" onClick={cancel}><Square size={14} /> Cancel monitoring</button> :
          <button type="button" className="chatgpt-bridge-send" disabled={!connected || !prompt.trim()} onClick={run}>Run prompt <ArrowRight size={17} /></button>}
      </div>
      <div className="remote-browser-answer" aria-live="polite" aria-label="Live ChatGPT response">
        <div className="remote-browser-answer-title">Live response</div>
        <div className="remote-browser-answer-text">{reply || (running ? 'Waiting for ChatGPT…' : 'The next response will stream here.')}</div>
      </div>
      <div className="chatgpt-bridge-note"><ShieldCheck size={17} /><span>Your credentials stay in the isolated browser profile. Astra uses one-time connections and does not save remote frames or replies in local chat history. Anyone with access to this private browser service can control the signed-in session.</span></div>
    </div>
  </div>;
}
