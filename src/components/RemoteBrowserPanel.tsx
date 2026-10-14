import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { Monitor, Play, RotateCcw, Square, Wifi, WifiOff } from 'lucide-react';

type Status = 'disconnected' | 'connecting' | 'ready' | 'running';
type BrowserEvent = {
  type: string;
  jpeg?: string;
  text?: string;
  done?: boolean;
  message?: string;
  state?: string;
  url?: string;
  width?: number;
  height?: number;
};

/** Live browser pixels and input are exchanged only with the owner's authenticated worker. */
export function RemoteBrowserPanel() {
  const [status, setStatus] = useState<Status>('disconnected');
  const [notice, setNotice] = useState('');
  const [pageURL, setPageURL] = useState('');
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [inputText, setInputText] = useState('');
  const [runState, setRunState] = useState('');
  const [hasFrame, setHasFrame] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const activePointer = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1280, height: 800 });
  const isConnected = status === 'ready' || status === 'running';

  useEffect(() => () => { wsRef.current?.close(); wsRef.current = null; }, []);

  const send = (payload: object) => {
    const socket = wsRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  };
  const disconnect = () => {
    wsRef.current?.close(1000, 'User disconnected');
    wsRef.current = null;
    setStatus('disconnected');
    setHasFrame(false);
    setRunState('');
  };
  const connect = async () => {
    if (status !== 'disconnected') return;
    setStatus('connecting'); setNotice(''); setHasFrame(false);
    try {
      const response = await fetch('/api/browser/ticket', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json() as { url?: string; ticket?: string; error?: string };
      if (!response.ok || !data.url || !data.ticket) throw new Error(data.error || 'Could not authorize remote browser.');
      const ws = new WebSocket(data.url);
      wsRef.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ ticket: data.ticket }));
      ws.onmessage = (event: MessageEvent<string>) => {
        let incoming: BrowserEvent;
        try { incoming = JSON.parse(event.data) as BrowserEvent; } catch { return; }
        if (wsRef.current !== ws) return;
        switch (incoming.type) {
          case 'frame':
            if (typeof incoming.jpeg === 'string' && imageRef.current) {
              imageRef.current.src = 'data:image/jpeg;base64,' + incoming.jpeg;
              setHasFrame(true);
            }
            if (incoming.width && incoming.height) setDimensions(d =>
              d.width === incoming.width && d.height === incoming.height ? d
                : { width: incoming.width!, height: incoming.height! });
            break;
          case 'ready':
            setStatus('ready'); setNotice('');
            setPageURL(incoming.url || '');
            break;
          case 'location': setPageURL(incoming.url || ''); break;
          case 'reply': setAnswer(incoming.text || ''); break;
          case 'run_status':
            setRunState(incoming.state || '');
            setStatus(incoming.state === 'starting' || incoming.state === 'running' ? 'running' : 'ready');
            break;
          case 'error': setNotice(incoming.message || 'Remote browser error'); break;
        }
      };
      ws.onclose = (event) => {
        if (wsRef.current !== ws) return;
        wsRef.current = null; setStatus('disconnected'); setHasFrame(false);
        setRunState('');
        if (event.code !== 1000) setNotice(event.reason || 'Browser disconnected. Check worker deployment and authorization.');
      };
      ws.onerror = () => { if (wsRef.current === ws) setNotice('Could not reach the remote browser. Check its secure WebSocket URL.'); };
    } catch (cause) {
      setStatus('disconnected');
      setNotice(cause instanceof Error ? cause.message : 'Could not connect.');
    }
  };
  const coords = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(dimensions.width, (event.clientX - rect.left) / rect.width * dimensions.width)),
      y: Math.max(0, Math.min(dimensions.height, (event.clientY - rect.top) / rect.height * dimensions.height)),
    };
  };
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!isConnected || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointer.current = event.pointerId;
    send({ type: 'mouse', action: 'down', ...coords(event) });
  };
  const pointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) return;
    send({ type: 'mouse', action: 'up', ...coords(event) });
    activePointer.current = null;
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointer.current === event.pointerId) send({ type: 'mouse', action: 'move', ...coords(event) });
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isConnected) return;
    const specials = ['Enter', 'Tab', 'Backspace', 'Delete', 'Escape', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (specials.includes(event.key) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a')) {
      event.preventDefault();
      send({ type: 'key', key: event.key === ' ' ? 'Space' : event.key, control: event.ctrlKey, meta: event.metaKey, alt: event.altKey, shift: event.shiftKey });
    } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault(); send({ type: 'text', text: event.key });
    }
  };
  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!isConnected) return;
    send({ type: 'scroll', dy: Math.max(-1500, Math.min(1500, event.deltaY)) });
  };
  const run = () => {
    const value = prompt.trim();
    if (!value || value.length > 8000 || status !== 'ready') return;
    setAnswer(''); setNotice(''); setRunState('starting');
    setStatus('running');
    send({ type: 'prompt', prompt: value });
  };

  return <section className="remote-browser-panel" aria-label="Remote ChatGPT browser">
    <div className="remote-browser-header">
      <div><div className="chatgpt-bridge-eyebrow">INTERACTIVE REMOTE BROWSER</div>
        <h2>Control a real ChatGPT session</h2>
        <p>Log in directly in the browser view, then send a prompt and watch the answer stream.</p>
      </div>
      <button type="button" className="remote-browser-connect" onClick={isConnected || status === 'running' ? disconnect : () => void connect()} disabled={status === 'connecting'}>
        {isConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
        {status === 'connecting' ? 'Connecting…' : isConnected ? 'Disconnect' : 'Connect'}
      </button>
    </div>
    {notice && <p role="alert" className="remote-browser-alert">{notice}</p>}
    <div className="remote-browser-stage">
      <div className="remote-browser-toolbar">
        <span className={isConnected ? 'remote-browser-dot online' : 'remote-browser-dot'} />
        <span className="remote-browser-address" title={pageURL}>{isConnected ? (pageURL || 'Connected') : 'Browser offline'}</span>
        <button type="button" title="Open ChatGPT home" aria-label="Open ChatGPT home" onClick={() => send({ type: 'navigate' })} disabled={!isConnected}><RotateCcw size={15} /></button>
      </div>
      <div
        ref={screenRef} role="application" aria-label="Interactive remote browser screen" tabIndex={isConnected ? 0 : -1}
        className="remote-browser-screen" style={{ aspectRatio: dimensions.width + '/' + dimensions.height }}
        onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={pointerUp}
        onPointerMove={pointerMove} onKeyDown={onKey} onWheel={wheel}
      >
        <img ref={imageRef} alt="Live ChatGPT browser canvas" draggable={false} style={{ display: hasFrame ? 'block' : 'none' }} />
        {!hasFrame && <div className="remote-browser-placeholder"><Monitor size={34} />
          <span>{status === 'connecting' ? 'Starting browser…' : 'Connect to display your private browser session'}</span>
        </div>}
      </div>
      {isConnected && <div className="remote-browser-keyboard">
        <label htmlFor="remote-browser-type">Remote keyboard</label>
        <input id="remote-browser-type" value={inputText} autoComplete="off"
          onChange={e => setInputText(e.target.value)} placeholder="Text to type into the focused page field"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send({ type: 'text', text: inputText }); setInputText(''); } }} />
        <button type="button" onClick={() => { if (inputText) send({ type: 'text', text: inputText.slice(0, 1000) }); setInputText(''); }} disabled={!inputText}>Type</button>
        <button type="button" onClick={() => send({ type: 'key', key: 'Tab' })}>Tab</button>
        <button type="button" onClick={() => send({ type: 'key', key: 'Enter' })}>Enter</button>
        <button type="button" onClick={() => send({ type: 'key', key: 'Backspace' })}>⌫</button>
      </div>}
    </div>
    <label className="chatgpt-bridge-label" htmlFor="remote-browser-prompt">Automated prompt</label>
    <textarea id="remote-browser-prompt" className="chatgpt-bridge-input" rows={3} maxLength={8000}
      value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Ask your logged-in ChatGPT session…" />
    <div className="remote-browser-actions">
      <button type="button" className="chatgpt-bridge-send" onClick={run} disabled={status !== 'ready' || !prompt.trim()}>
        <Play size={16} /> Run in ChatGPT
      </button>
      {status === 'running' && <button type="button" className="remote-browser-stop" onClick={() => send({ type: 'cancel' })}><Square size={15} /> Stop</button>}
      <span role="status">{runState === 'running' ? 'Response streaming…' : runState || 'Send only after login'}</span>
    </div>
    <div className="remote-browser-reply" aria-live="polite">
      <strong>Live assistant response</strong>
      <pre>{answer || 'The response appears here as ChatGPT generates it.'}</pre>
    </div>
    <p className="chatgpt-bridge-disclaimer">
      This runs a persistent browser profile on your separately deployed worker. Login, cookies and viewed pages stay in that worker's volume.
      Do not deploy it publicly without TLS, network isolation and private-beta access. CAPTCHAs require your own interaction.
      The ChatGPT page is an unofficial automation surface; selectors may change.
    </p>
  </section>;
}
