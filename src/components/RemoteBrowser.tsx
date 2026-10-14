import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { Globe2, LoaderCircle, Play, Square, ShieldCheck } from 'lucide-react';
import './remote-browser.css';

type WorkerEvent = {
  type: 'ready' | 'response' | 'error' | 'prompt-sent';
  width?: number; height?: number; text?: string; complete?: boolean; message?: string;
};
type SessionInfo = { wsUrl?: string; ticket?: string; error?: string };

export function RemoteBrowser() {
  const socket = useRef<WebSocket | null>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const imageUrl = useRef<string | null>(null);
  const screen = useRef<HTMLDivElement | null>(null);
  const lastMove = useRef(0);
  const dimensions = useRef({ width: 1280, height: 800 });
  const [frame, setFrame] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'connecting' | 'ready' | 'disconnected'>('idle');
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => () => {
    socket.current?.close();
    if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
  }, []);

  function send(payload: Record<string, unknown>) {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(payload));
  }
  async function connect() {
    socket.current?.close();
    setState('connecting'); setError(''); setBusy(false);
    try {
      const response = await fetch('/api/browser/session', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json() as SessionInfo;
      if (!response.ok || !data.ticket || !data.wsUrl) throw new Error(data.error || 'Could not start remote browser.');
      const ws = new WebSocket(data.wsUrl);
      ws.binaryType = 'blob';
      socket.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', ticket: data.ticket }));
      ws.onmessage = (event: MessageEvent) => {
        if (event.data instanceof Blob) {
          const url = URL.createObjectURL(event.data);
          const old = imageUrl.current;
          imageUrl.current = url; setFrame(url);
          if (old) window.setTimeout(() => URL.revokeObjectURL(old), 1000);
          return;
        }
        let message: WorkerEvent;
        try { message = JSON.parse(String(event.data)) as WorkerEvent; }
        catch { return; }
        if (message.type === 'ready') {
          dimensions.current = { width: message.width || 1280, height: message.height || 800 };
          setState('ready');
        } else if (message.type === 'prompt-sent') {
          setBusy(true);
        } else if (message.type === 'response') {
          setReply(message.text || '');
          if (message.complete) setBusy(false);
        } else if (message.type === 'error') {
          setError(message.message || 'Remote browser error.'); setBusy(false);
        }
      };
      ws.onerror = () => { setError('Remote browser connection failed. Check the worker deployment and TLS.'); setBusy(false); };
      ws.onclose = () => { if (socket.current === ws) { setState('disconnected'); setBusy(false); } };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to connect.');
      setState('disconnected');
    }
  }
  function close() {
    socket.current?.close(); socket.current = null; setBusy(false); setState('idle');
  }
  function mapped(event: PointerEvent<HTMLDivElement>) {
    const img = image.current;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const x = (event.clientX - r.left) / r.width * dimensions.current.width;
    const y = (event.clientY - r.top) / r.height * dimensions.current.height;
    if (x < 0 || y < 0 || x > dimensions.current.width || y > dimensions.current.height) return null;
    return { x: Math.round(x), y: Math.round(y) };
  }
  function pointer(event: PointerEvent<HTMLDivElement>, kind: 'move' | 'down' | 'up') {
    if (state !== 'ready' || busy) return;
    if (kind === 'move' && Date.now() - lastMove.current < 35) return;
    lastMove.current = Date.now();
    const point = mapped(event);
    if (!point) return;
    const button = event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left';
    if (kind === 'down') {
      screen.current?.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    send({ type: 'mouse', kind: 'move', ...point });
    if (kind !== 'move') send({ type: 'mouse', kind, button, ...point });
  }
  function key(event: KeyboardEvent<HTMLDivElement>) {
    if (state !== 'ready' || busy) return;
    event.preventDefault();
    const modifiers = [
      event.ctrlKey && 'Control', event.metaKey && 'Meta',
      event.altKey && 'Alt', event.shiftKey && 'Shift',
    ].filter(Boolean);
    send({ type: 'key', key: event.key, modifiers });
  }
  function wheel(event: WheelEvent<HTMLDivElement>) {
    if (state === 'ready' && !busy) send({ type: 'wheel', dx: event.deltaX, dy: event.deltaY });
  }
  function submit() {
    if (state !== 'ready' || busy || !prompt.trim()) return;
    setReply(''); setError(''); setBusy(true);
    send({ type: 'prompt', text: prompt.trim() });
  }

  return <section className="astra-remote" aria-label="Interactive ChatGPT browser">
    <div className="astra-remote-heading">
      <div><span className="astra-remote-eyebrow"><Globe2 size={14} /> Remote browser</span>
        <h2>ChatGPT, inside Astra</h2>
        <p>Use the streamed browser to sign in yourself, then run prompts and follow replies live.</p>
      </div>
      <div className="astra-remote-buttons">
        {state === 'ready' ? <button type="button" onClick={close}><Square size={15} /> Disconnect</button> :
          <button type="button" onClick={() => void connect()} disabled={state === 'connecting'}>
            {state === 'connecting' ? <LoaderCircle size={15} className="astra-remote-spin" /> : <Play size={15} />}
            {state === 'connecting' ? 'Connecting' : 'Connect browser'}
          </button>}
      </div>
    </div>
    {error && <p className="astra-remote-error" role="alert">{error}</p>}
    {state !== 'idle' && <div
      ref={screen} tabIndex={0} role="application" aria-label="Click to focus and control remote ChatGPT browser"
      className="astra-remote-viewport" onPointerMove={e => pointer(e, 'move')}
      onPointerDown={e => pointer(e, 'down')} onPointerUp={e => pointer(e, 'up')}
      onContextMenu={e => e.preventDefault()} onKeyDown={key} onWheel={wheel}>
      {frame ? <img ref={image} src={frame} alt="Live remote ChatGPT browser view" draggable={false} /> :
        <span>{state === 'connecting' ? 'Starting browser…' : 'Waiting for browser frames…'}</span>}
    </div>}
    {state === 'ready' && <div className="astra-remote-composer">
      <label htmlFor="astra-remote-prompt">Automated prompt</label>
      <textarea id="astra-remote-prompt" value={prompt} maxLength={8000} rows={3}
        placeholder="Ask a question in your signed-in ChatGPT session"
        onChange={e => setPrompt(e.target.value)} />
      <button type="button" onClick={submit} disabled={busy || !prompt.trim()}>
        {busy ? <LoaderCircle size={15} className="astra-remote-spin" /> : <Play size={15} />}
        {busy ? 'Generating…' : 'Run in ChatGPT'}
      </button>
    </div>}
    {(busy || reply) && <div className="astra-remote-reply" aria-live="polite">
      <strong>Live ChatGPT reply {busy ? '• streaming' : ''}</strong>
      <pre>{reply || 'Waiting for a response…'}</pre>
    </div>}
    <p className="astra-remote-security"><ShieldCheck size={14} /> Your ChatGPT sign-in stays in the worker’s persistent browser profile. Astra never asks you to paste a password. CAPTCHA challenges are solved manually in the live view.</p>
  </section>;
}
