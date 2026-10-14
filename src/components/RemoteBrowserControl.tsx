import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { MonitorPlay, Power, Send, Square, ShieldCheck } from 'lucide-react';
import './remote-browser.css';

type BridgeEvent = {
  type: string;
  message?: string;
  data?: string;
  text?: string;
  status?: string;
  width?: number;
  height?: number;
};
type TicketResponse = { url?: string; ticket?: string; error?: string };
const specialKeys = new Set([
  'Enter', 'Tab', 'Backspace', 'Delete', 'Escape', 'ArrowUp', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown',
]);

export function RemoteBrowserControl() {
  const socket = useRef<WebSocket | null>(null);
  const keyboard = useRef<HTMLInputElement | null>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const lastMove = useRef(0);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('Disconnected');
  const [frame, setFrame] = useState('');
  const [dimensions, setDimensions] = useState({ width: 1280, height: 800 });
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [runStatus, setRunStatus] = useState('');

  useEffect(() => () => {
    socket.current?.close();
    socket.current = null;
  }, []);

  function send(payload: Record<string, unknown>) {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify(payload));
    }
  }
  async function connect() {
    if (connecting || connected) return;
    setConnecting(true); setFrame(''); setStatus('Requesting access ticket…');
    try {
      const response = await fetch('/api/browser/ticket', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      });
      const ticket = await response.json() as TicketResponse;
      if (!response.ok || !ticket.url || !ticket.ticket) {
        throw new Error(ticket.error || 'Unable to connect to browser service.');
      }
      const ws = new WebSocket(ticket.url);
      socket.current = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', ticket: ticket.ticket }));
        setStatus('Starting secure browser…');
      };
      ws.onmessage = event => {
        let message: BridgeEvent;
        try { message = JSON.parse(String(event.data)) as BridgeEvent; }
        catch { return; }
        if (message.type === 'frame' && message.data) {
          setFrame('data:image/jpeg;base64,' + message.data);
        } else if (message.type === 'ready') {
          setConnected(true); setConnecting(false);
          setDimensions({ width: message.width || 1280, height: message.height || 800 });
          setStatus('Connected — you control the browser');
        } else if (message.type === 'status' && message.message) {
          setStatus(message.message);
        } else if (message.type === 'error' && message.message) {
          setStatus(message.message);
          setRunStatus(message.message); setRunning(false);
        } else if (message.type === 'output') {
          setOutput(message.text || '');
        } else if (message.type === 'run') {
          if (message.status === 'started') {
            setRunning(true); setRunStatus('ChatGPT is responding…'); setOutput('');
          } else {
            setRunning(false);
            setRunStatus(message.status === 'completed' ? 'Response complete' :
              message.message || 'Automation ' + message.status);
            if (message.text) setOutput(message.text);
          }
        }
      };
      ws.onerror = () => setStatus('WebSocket connection error. Check the worker and TLS proxy.');
      ws.onclose = () => {
        if (socket.current === ws) socket.current = null;
        setConnected(false); setConnecting(false); setRunning(false);
        setStatus(previous => previous.includes('error') ? previous : 'Disconnected — reconnect to continue');
      };
    } catch (error) {
      setConnecting(false);
      setStatus(error instanceof Error ? error.message : 'Connection failed');
    }
  }
  function disconnect() {
    socket.current?.close(1000, 'User disconnected');
    socket.current = null; setConnected(false); setRunning(false); setFrame('');
    setStatus('Disconnected');
  }
  function point(event: PointerEvent<HTMLImageElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(dimensions.width - 1, Math.max(0, Math.floor((event.clientX - bounds.left) / bounds.width * dimensions.width))),
      y: Math.min(dimensions.height - 1, Math.max(0, Math.floor((event.clientY - bounds.top) / bounds.height * dimensions.height))),
    };
  }
  function handlePointer(event: PointerEvent<HTMLImageElement>, action: 'down' | 'up' | 'move') {
    if (!connected || running) return;
    if (action === 'move' && Date.now() - lastMove.current < 32) return;
    if (action === 'move') lastMove.current = Date.now();
    if (action === 'down') event.currentTarget.setPointerCapture(event.pointerId);
    send({ type: 'pointer', action, ...point(event) });
    if (action === 'up') keyboard.current?.focus();
  }
  function wheel(event: WheelEvent<HTMLImageElement>) {
    if (!connected || running) return;
    send({ type: 'wheel', dx: Math.max(-1200, Math.min(1200, event.deltaX)), dy: Math.max(-1200, Math.min(1200, event.deltaY)) });
  }
  function keydown(event: KeyboardEvent<HTMLInputElement>) {
    if (!connected || running) return;
    if (specialKeys.has(event.key)) {
      event.preventDefault();
      send({ type: 'key', action: 'down', key: event.key });
      send({ type: 'key', action: 'up', key: event.key });
    }
  }
  function typeText(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    event.target.value = '';
    if (value && connected && !running) send({ type: 'type', text: value });
  }
  function runPrompt() {
    if (!connected || running || !prompt.trim() || prompt.length > 5000) return;
    send({ type: 'prompt', text: prompt.trim() });
    setRunStatus('Submitting prompt…');
  }

  return <section className="remote-bridge" aria-label="Remote ChatGPT browser">
    <div className="remote-bridge-header">
      <div><div className="chatgpt-bridge-eyebrow">LIVE REMOTE SESSION</div>
        <h2><MonitorPlay size={22} /> Browser Control</h2>
        <p>Use a persistent browser session. Sign in and complete any verification yourself, then run prompts here and watch their responses.</p>
      </div>
      <button type="button" className="remote-connect" disabled={connecting} onClick={connected ? disconnect : () => { void connect(); }}>
        <Power size={16} /> {connected ? 'Disconnect' : connecting ? 'Connecting…' : 'Connect browser'}
      </button>
    </div>
    <div className="remote-status" role="status"><span className={connected ? 'remote-dot is-connected' : 'remote-dot'} />{status}</div>
    <div className="remote-screen">
      {frame ? <img ref={image} src={frame} alt="Live remote Chromium screen"
        draggable={false} style={{ aspectRatio: dimensions.width + '/' + dimensions.height }}
        onPointerDown={e => handlePointer(e, 'down')}
        onPointerMove={e => handlePointer(e, 'move')}
        onPointerUp={e => handlePointer(e, 'up')}
        onPointerCancel={e => handlePointer(e, 'up')}
        onWheel={wheel} /> :
        <div className="remote-screen-empty"><MonitorPlay size={34} />
          <span>{connecting ? 'Launching Chrome…' : 'Connect to view your private browser'}</span>
        </div>}
    </div>
    <div className="remote-keyboard">
      <label htmlFor="remote-keyboard-input">Type into the selected browser field</label>
      <input ref={keyboard} id="remote-keyboard-input" type="password" autoComplete="off"
        spellCheck={false} placeholder="Type here after clicking a field in the screen"
        disabled={!connected || running} onKeyDown={keydown} onChange={typeText} />
      <small>Input is forwarded to the browser immediately and is not saved by Astra. Use this field for login or mobile typing.</small>
    </div>
    <div className="remote-prompt">
      <label htmlFor="remote-prompt">Automated prompt</label>
      <textarea id="remote-prompt" value={prompt} maxLength={5000} rows={3}
        onChange={event => setPrompt(event.target.value)} placeholder="Ask ChatGPT in this browser session…" />
      <div className="remote-prompt-actions">
        <small>{prompt.length} / 5000</small>
        {running ? <button type="button" onClick={() => send({ type: 'cancel' })}><Square size={15} /> Stop</button> :
          <button type="button" disabled={!connected || !prompt.trim()} onClick={runPrompt}><Send size={15} /> Run prompt</button>}
      </div>
      {runStatus && <p className="remote-run-status" role="status">{runStatus}</p>}
      <div className="remote-output" aria-label="Live response" aria-live="polite">{output || 'The assistant response will appear here as it is generated.'}</div>
    </div>
    <p className="remote-privacy"><ShieldCheck size={15} />
      The dedicated server stores browser login state in its private volume, not in Astra local storage.
      Only connect on a server you trust. Browser automation is experimental and depends on ChatGPT's changing interface.
    </p>
  </section>;
}
