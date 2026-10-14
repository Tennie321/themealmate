import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type WheelEvent } from 'react';
import { ArrowUp, RefreshCcw } from 'lucide-react';

type BrowserEvent =
  | { type: 'frame'; jpeg: string }
  | { type: 'status'; state: string; message: string }
  | { type: 'progress'; message: string }
  | { type: 'reply'; state: 'streaming' | 'done'; text: string }
  | { type: 'error'; message: string };

type Command =
  | { type: 'send_prompt'; prompt: string }
  | { type: 'click' | 'move'; x: number; y: number }
  | { type: 'scroll'; deltaX: number; deltaY: number }
  | { type: 'key'; key: string }
  | { type: 'text'; text: string }
  | { type: 'refresh' };

function position(event: MouseEvent<HTMLImageElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
}

export function RemoteChatGPT() {
  const socketRef = useRef<WebSocket | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('Connecting to remote browser…');
  const [frame, setFrame] = useState('');
  const [manualText, setManualText] = useState('');
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const send = useCallback((command: Command) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(command));
    return true;
  }, []);

  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(protocol + '//' + window.location.host + '/browser/ws');
      socketRef.current = socket;
      socket.onopen = () => {
        attempts = 0;
        setConnected(true);
        setError('');
        setStatus('Connected');
      };
      socket.onmessage = event => {
        try {
          const message = JSON.parse(event.data as string) as BrowserEvent;
          switch (message.type) {
            case 'frame': setFrame('data:image/jpeg;base64,' + message.jpeg); break;
            case 'status': setStatus(message.message); break;
            case 'progress': setStatus(message.message); break;
            case 'reply':
              setResponse(message.text);
              if (message.state === 'done') { setRunning(false); setStatus('ChatGPT reply complete'); }
              break;
            case 'error': setError(message.message); setRunning(false); break;
          }
        } catch { setError('Received an invalid browser event.'); }
      };
      socket.onerror = () => {
        setError('Remote browser unavailable. Deploy the Docker browser service and same-origin proxy.');
      };
      socket.onclose = () => {
        if (disposed) return;
        setConnected(false); setRunning(false);
        setStatus('Disconnected');
        attempts++;
        retry = setTimeout(connect, Math.min(15000, attempts * 3000));
      };
    };
    connect();
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const onKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!connected || running || event.nativeEvent.isComposing) return;
    if (event.key === 'Tab') return; // Retain accessible keyboard navigation in Astra.
    const modifier = event.metaKey ? 'Meta+' : event.ctrlKey ? 'Control+' : event.altKey ? 'Alt+' : '';
    if (!modifier && event.key.length === 1) {
      event.preventDefault();
      send({ type: 'text', text: event.key });
    } else if (/^[\w+ -]{1,40}$/.test(event.key)) {
      event.preventDefault();
      send({ type: 'key', key: modifier + event.key });
    }
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (connected && !running) {
      send({ type: 'scroll',
        deltaX: Math.max(-1600, Math.min(1600, event.deltaX)),
        deltaY: Math.max(-1600, Math.min(1600, event.deltaY)) });
    }
  };

  const run = () => {
    if (!prompt.trim() || prompt.length > 8000 || running || !connected) return;
    setError(''); setResponse(''); setRunning(true);
    setStatus('Sending prompt…');
    if (!send({ type: 'send_prompt', prompt: prompt.trim() })) setRunning(false);
  };

  return <section className="remote-browser-panel" aria-label="Remote ChatGPT browser">
    <header className="remote-browser-header">
      <h2>Live ChatGPT browser</h2>
      <span className="remote-browser-state" role="status">{connected ? '● Connected' : '○ Offline'}</span>
    </header>
    <p className="remote-browser-help">
      This is a remote Chromium session, not an API. Click the screen to control it and sign in directly on ChatGPT.
      Complete any verification yourself. Your signed-in browser profile persists on the server.
    </p>
    <div ref={screenRef} className="remote-browser-screen" tabIndex={0} role="group" aria-label="Remote browser screenshot; click to focus, then type" onKeyDown={onKeyboard} onWheel={onWheel}>
      {frame ? <img src={frame} alt="Live remote ChatGPT browser" draggable={false} onClick={event => {
        if (!running && send({ type: 'click', ...position(event) })) screenRef.current?.focus();
      }} /> : <div className="remote-browser-empty">{status}</div>}
    </div>
    <div className="remote-browser-controls">
      <button type="button" disabled={!connected || running} onClick={() => send({ type: 'refresh' })}><RefreshCcw size={13} /> Refresh browser</button>
      <button type="button" disabled={!connected || running} onClick={() => send({ type: 'key', key: 'Enter' })}>Enter ↵</button>
      <button type="button" disabled={!connected || running} onClick={() => send({ type: 'key', key: 'Backspace' })}>Backspace</button>
    </div>
    <div className="remote-browser-typing">
      <input aria-label="Text to type into selected remote field" placeholder="Optional: type or paste into the selected browser field"
        autoComplete="off" value={manualText} maxLength={2000} onChange={event => setManualText(event.target.value)} />
      <button type="button" disabled={!connected || running || !manualText} onClick={() => {
        if (send({ type: 'text', text: manualText })) setManualText('');
      }}>Type in browser</button>
    </div>
    <label className="remote-browser-prompt" htmlFor="remote-chatgpt-prompt">Automated prompt</label>
    <textarea id="remote-chatgpt-prompt" placeholder="Send a prompt to the open ChatGPT conversation after logging in."
      value={prompt} maxLength={8000} onChange={event => setPrompt(event.target.value)} />
    <button className="remote-browser-run" type="button" disabled={!connected || running || !prompt.trim()} onClick={run}>
      <ArrowUp size={15} /> {running ? 'Running…' : 'Run prompt in ChatGPT'}
    </button>
    <p className="remote-browser-help" role="status">{status}</p>
    {error && <p className="remote-browser-error" role="alert">{error}</p>}
    {(response || running) && <div className="remote-browser-result" aria-live="polite"><strong>ChatGPT response {running ? '· streaming' : ''}</strong>
      <pre>{response || 'Waiting for assistant output…'}</pre>
    </div>}
    <p className="remote-browser-help">
      Remote control requires a dedicated Docker deployment. Do not use the browser for sensitive accounts on shared infrastructure.
      Browser automation depends on ChatGPT's current page structure and may need updates.
    </p>
  </section>;
}
