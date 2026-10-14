import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type WheelEvent, type ClipboardEvent } from 'react';
import { ArrowUp, ExternalLink, Keyboard, Monitor, RotateCcw, Square } from 'lucide-react';

type Message =
  | { type:'ready';width:number;height:number }
  | { type:'frame';data:string;width:number;height:number }
  | { type:'status';message:string }
  | { type:'response';id:string;text:string;done:boolean }
  | { type:'error';message:string;id?:string };

export function RemoteChatGPTBrowser() {
  const socket = useRef<WebSocket | null>(null);
  const screen = useRef<HTMLDivElement | null>(null);
  const [frame,setFrame] = useState('');
  const [connected,setConnected] = useState(false);
  const [status,setStatus] = useState('Connecting to the private browser…');
  const [error,setError] = useState('');
  const [draft,setDraft] = useState('');
  const [answer,setAnswer] = useState('');
  const [busy,setBusy] = useState(false);
  const [reconnect,setReconnect] = useState(0);
  const [dimensions,setDimensions] = useState({width:1280,height:800});

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const start = async () => {
      setError('');setConnected(false);setStatus('Requesting private browser access…');
      try {
        const response=await fetch('/api/browser/ticket',{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal});
        const body=await response.json() as {ticket?:string;error?:string};
        if (!response.ok || !body.ticket) throw new Error(body.error || 'Browser ticket request failed.');
        if (disposed) return;
        const protocol=location.protocol==='https:'?'wss:':'ws:';
        const ws=new WebSocket(protocol+'//'+location.host+'/browser/ws',['astra.browser.v1','ticket.'+body.ticket]);
        socket.current=ws;
        ws.onopen=()=>{if(disposed)return;setConnected(true);setStatus('Browser connected.');};
        ws.onmessage=(evt:MessageEvent<string>)=>{
          if(disposed)return;
          let data:Message;
          try {data=JSON.parse(evt.data) as Message;} catch {return;}
          if(data.type==='frame') {setFrame('data:image/jpeg;base64,'+data.data);setDimensions({width:data.width,height:data.height});}
          else if(data.type==='status') setStatus(data.message);
          else if(data.type==='ready') {setConnected(true);setDimensions({width:data.width,height:data.height});}
          else if(data.type==='response') {setAnswer(data.text);if(data.done)setBusy(false);}
          else if(data.type==='error') {setError(data.message);if(data.id)setBusy(false);}
        };
        ws.onclose=(event)=>{if(disposed)return;setConnected(false);setBusy(false);setStatus(event.code===4001?'Another tab took control.':'Browser disconnected. Reconnect to resume.');};
        ws.onerror=()=>{if(!disposed)setError('Could not connect to the browser service. Check deployment configuration.');};
      } catch (reason) { if (!disposed && !controller.signal.aborted) {setError(reason instanceof Error?reason.message:'Browser connection failed.');setStatus('Browser unavailable.');} }
    };
    void start();
    return ()=>{disposed=true;controller.abort();socket.current?.close();socket.current=null;};
  },[reconnect]);

  const send=useCallback((payload:object)=>{
    const ws=socket.current;
    if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(payload));
  },[]);
  const submit=()=>{
    if(!connected || busy || !draft.trim() || draft.length>4000)return;
    const id=crypto.randomUUID();
    setAnswer('');setError('');setBusy(true);
    send({type:'prompt',id,prompt:draft.trim()});
  };
  const click=(event:MouseEvent<HTMLDivElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    const x=Math.floor((event.clientX-rect.left)*dimensions.width/rect.width);
    const y=Math.floor((event.clientY-rect.top)*dimensions.height/rect.height);
    send({type:'click',x,y});
    screen.current?.focus();
  };
  const wheel=(event:WheelEvent<HTMLDivElement>)=>{send({type:'scroll',deltaY:event.deltaY});};
  const key=(event:KeyboardEvent<HTMLDivElement>)=>{
    if(!connected)return;
    if(event.ctrlKey || event.metaKey) {
      if(event.key.toLowerCase()==='a') {event.preventDefault();send({type:'key',key:'ControlOrMeta+A'});}
      return;
    }
    if(event.key==='Shift' || event.key==='Control' || event.key==='Alt' || event.key==='Meta')return;
    event.preventDefault();
    if(event.key.length===1) send({type:'text',text:event.key});
    else send({type:'key',key:event.shiftKey&&event.key==='Tab'?'Shift+Tab':event.key});
  };
  const paste=(event:ClipboardEvent<HTMLDivElement>)=>{
    event.preventDefault();send({type:'text',text:event.clipboardData.getData('text/plain').slice(0,2048)});
  };
  const mobileText=()=>{
    const text=window.prompt('Text to type in the remote browser (do not paste secret keys):');
    if(text)send({type:'text',text});
  };
  return <section className="remote-browser" aria-label="Private remote ChatGPT browser">
    <div className="remote-browser-heading"><div>
      <span className="remote-browser-eyebrow"><Monitor size={14}/> PRIVATE BROWSER CONTROL</span>
      <h2>ChatGPT, inside your workspace.</h2>
      <p>Sign in and complete any verification yourself in the live browser. Then send prompts and watch replies stream here.</p>
    </div><div className="remote-browser-tools">
      <button type="button" onClick={()=>send({type:'home'})} disabled={!connected}>ChatGPT home</button>
      <button type="button" title="Reconnect" aria-label="Reconnect browser" onClick={()=>setReconnect(x=>x+1)}><RotateCcw size={16}/></button>
    </div></div>
    <div className="remote-browser-layout">
      <div className="remote-browser-view">
        <div className="remote-browser-bar"><span className={connected?'remote-browser-dot online':'remote-browser-dot'}/>
          <span>{status}</span><span className="remote-browser-res">1280 × 800</span>
        </div>
        <div ref={screen} className="remote-browser-screen" role="application" aria-label="Live remote browser. Click to focus then type using your keyboard."
          tabIndex={0} onClick={click} onWheel={wheel} onKeyDown={key} onPaste={paste}>
          {frame?<img src={frame} alt="Live ChatGPT browser screen" draggable={false}/>:<div className="remote-browser-placeholder">{connected?'Starting Chromium screen…':'Browser preview unavailable'}</div>}
        </div>
        <div className="remote-browser-keyboard"><span>Click screen to type · Scroll and keyboard supported</span><button type="button" onClick={mobileText} disabled={!connected}><Keyboard size={14}/> Type text</button></div>
      </div>
      <div className="remote-browser-compose">
        <label htmlFor="remote-prompt">Automated prompt</label>
        <textarea id="remote-prompt" value={draft} maxLength={4000} rows={5} onChange={e=>setDraft(e.target.value)} placeholder="Ask your signed-in ChatGPT session…" />
        <div className="remote-browser-sendrow"><small>{draft.length}/4000</small>
          {busy?<button type="button" onClick={()=>send({type:'stop'})}><Square size={14}/> Stop</button>:
            <button type="button" onClick={submit} disabled={!connected||!draft.trim()}><ArrowUp size={16}/> Send prompt</button>}</div>
        <div className="remote-browser-answer-heading">Live response</div>
        <div className="remote-browser-answer" aria-live="polite">{answer||'Your streamed ChatGPT reply will appear here.'}</div>
        {error && <div className="remote-browser-error" role="alert">{error}</div>}
        <p className="remote-browser-caution">Experimental browser automation; ChatGPT changes can interrupt it. Single private owner only. Login happens on the remote Chromium browser, not your local browser. <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Open ChatGPT <ExternalLink size={12}/></a></p>
      </div>
    </div>
  </section>;
}
