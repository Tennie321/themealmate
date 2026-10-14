/** Private single-owner Chromium bridge; only expose it through a same-origin TLS reverse proxy. */
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { WebSocketServer, WebSocket } from 'ws';
import { validSecret, verifyTicket } from './token.mjs';

const secret = process.env.ASTRA_BROWSER_SECRET;
const allowedOrigin = process.env.PUBLIC_ORIGIN;
if (!validSecret(secret) || !allowedOrigin || !/^https?:\/\/[^/]+$/.test(allowedOrigin)) {
  throw new Error('Configure ASTRA_BROWSER_SECRET (32+ chars) and PUBLIC_ORIGIN (exact app origin).');
}
const width=1280, height=800, port=Number(process.env.PORT || 8787);
let context, page, cdp, controller, job, lastFrame, lastSent=0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const send = (ws,event) => {
  if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 1500000) ws.send(JSON.stringify(event));
};
const status = (ws,message) => send(ws,{type:'status',message});
const fail = (ws,message,id) => send(ws,{type:'error',message,...(typeof id==='string'?{id}:{})});

async function startBrowser() {
  if (page && !page.isClosed()) return;
  const dir = process.env.BROWSER_PROFILE_DIR || '/profiles/owner';
  await mkdir(dir,{recursive:true,mode:0o700});
  context = await chromium.launchPersistentContext(dir,{
    headless:true,viewport:{width,height},acceptDownloads:false,args:['--disable-dev-shm-usage']
  });
  page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('framenavigated', frame => {
    if (frame!==page.mainFrame()) return;
    try { const u=new URL(frame.url()); status(controller,'Browser: '+u.origin+u.pathname); } catch {}
  });
  if (page.url()==='about:blank') {
    await page.goto('https://chatgpt.com/',{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
  }
  cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  cdp.on('Page.screencastFrame', ({data,sessionId}) => {
    void cdp.send('Page.screencastFrameAck',{sessionId}).catch(()=>{});
    if (Date.now()-lastSent < 160) return;
    lastSent=Date.now(); lastFrame=data;
    send(controller,{type:'frame',data,width,height});
  });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:65,everyNthFrame:1});
}

async function runPrompt(ws,id,prompt) {
  if (job) return fail(ws,'A prompt is already running.',id);
  if (typeof prompt!=='string' || !prompt.trim() || prompt.length>4000) return fail(ws,'Prompt must be 1–4000 characters.',id);
  const task={cancelled:false}; job=task;
  try {
    if (new URL(page.url()).hostname!=='chatgpt.com') throw Error('Open ChatGPT and sign in first.');
    const messages=page.locator('[data-message-author-role="assistant"]'), countBefore=await messages.count();
    const composer=page.locator('#prompt-textarea, [data-testid="composer-text-input"], div[contenteditable="true"][role="textbox"]').first();
    await composer.waitFor({state:'visible',timeout:12000});
    await composer.fill(prompt.trim());
    const button=page.locator('button[data-testid="send-button"]').first();
    if (await button.isVisible().catch(()=>false) && await button.isEnabled().catch(()=>false)) await button.click();
    else await composer.press('Enter');
    status(ws,'Prompt submitted. Waiting for ChatGPT...');
    let last='', changed=Date.now(), appeared=false;
    const start=Date.now();
    while (Date.now()-start < 180000) {
      if (task.cancelled || controller!==ws) throw Error('Prompt stopped.');
      if (await messages.count()>countBefore) {
        appeared=true;
        const text=await messages.last().innerText({timeout:5000}).catch(()=>last);
        if (text!==last) { last=text; changed=Date.now(); send(ws,{type:'response',id,text,done:false}); }
        const stop=page.locator('button[data-testid="stop-button"],button[aria-label="Stop streaming"]').first();
        if (last && !(await stop.isVisible().catch(()=>false)) && Date.now()-changed>1700) {
          send(ws,{type:'response',id,text:last,done:true});
          status(ws,'Response complete.');
          return;
        }
      }
      await sleep(350);
    }
    throw Error(appeared?'ChatGPT response timed out.':'No assistant reply appeared; check sign-in and the composer.');
  } catch (e) { fail(ws,e instanceof Error?e.message:'Automation failed.',id); }
  finally { if (job===task) job=null; }
}

async function action(ws,raw) {
  let cmd;
  try { cmd=JSON.parse(raw.toString('utf8')); } catch { return fail(ws,'Invalid JSON command.'); }
  if (!cmd || typeof cmd!=='object') return;
  if (cmd.type==='prompt') return void runPrompt(ws,cmd.id,cmd.prompt);
  if (cmd.type==='stop') { if (job) job.cancelled=true; return; }
  if (cmd.type==='home') {
    if (job) return fail(ws,'Stop the prompt first.');
    await page.goto('https://chatgpt.com/',{waitUntil:'domcontentloaded',timeout:45000});
  } else if (cmd.type==='click') {
    if (Number.isInteger(cmd.x) && Number.isInteger(cmd.y) && cmd.x>=0 && cmd.y>=0 && cmd.x<width && cmd.y<height) await page.mouse.click(cmd.x,cmd.y);
  } else if (cmd.type==='scroll') {
    if (Number.isFinite(cmd.deltaY)) await page.mouse.wheel(0,Math.max(-1000,Math.min(1000,cmd.deltaY)));
  } else if (cmd.type==='text') {
    if (typeof cmd.text==='string' && cmd.text.length<=2048) await page.keyboard.insertText(cmd.text);
  } else if (cmd.type==='key') {
    const allowed=['Enter','Tab','Backspace','Delete','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','Space','Shift+Tab','ControlOrMeta+A'];
    if (allowed.includes(cmd.key)) await page.keyboard.press(cmd.key);
  } else fail(ws,'Unknown browser command.');
}

const http=createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if (req.url==='/health') { res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ready:Boolean(page&&!page.isClosed())})); }
  else {res.writeHead(404);res.end();}
});
const wss=new WebSocketServer({noServer:true,maxPayload:16384,handleProtocols:p=>p.has('astra.browser.v1')?'astra.browser.v1':false});
http.on('upgrade',(req,socket,head)=>{
  const path=req.url?.split('?')[0];
  const protocols=(req.headers['sec-websocket-protocol']||'').split(',').map(x=>x.trim());
  const token=protocols.find(x=>x.startsWith('ticket.'))?.slice(7);
  if (!['/browser/ws','/ws'].includes(path) || req.headers.origin!==allowedOrigin
    || !protocols.includes('astra.browser.v1') || !verifyTicket(secret,token)) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
  }
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
});
wss.on('connection',ws=>{
  if (controller && controller!==ws) controller.close(4001,'Another tab took control');
  if (job) job.cancelled=true;
  controller=ws;
  ws.on('message',raw=>{if(ws===controller) void action(ws,raw).catch(()=>fail(ws,'Browser action failed.'));});
  ws.on('close',()=>{ if(controller===ws){controller=null;if(job)job.cancelled=true;} });
  ws.on('error',()=>{});
  const lifetime=setTimeout(()=>ws.close(4002,'Reconnect to renew authorization'),30*60000);
  ws.on('close',()=>clearTimeout(lifetime));
  void startBrowser().then(()=>{
    if(ws!==controller)return;
    send(ws,{type:'ready',width,height});status(ws,'Browser ready. Sign in directly on the browser screen.');
    if(lastFrame)send(ws,{type:'frame',data:lastFrame,width,height});
    else void page.screenshot({type:'jpeg',quality:65}).then(b=>send(ws,{type:'frame',data:b.toString('base64'),width,height})).catch(()=>{});
  }).catch(()=>fail(ws,'Chromium failed to start; inspect service logs.'));
});
http.listen(port,'0.0.0.0',()=>console.info('Astra browser service on '+port));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{if(job)job.cancelled=true;void context?.close().finally(()=>http.close());});
