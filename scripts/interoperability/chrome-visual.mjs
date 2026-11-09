import {existsSync} from 'node:fs';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const browsers=()=>{
  const names=[
    process.env.P2LRN_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/chromium','/usr/bin/google-chrome',
  ];
  return names.filter(Boolean).find(existsSync);
};
export async function launchInteropChrome({downloadDir,evidenceDir}){
  const exe=browsers();if(!exe)throw new Error('Real Chrome or Edge browser missing');
  await mkdir(downloadDir,{recursive:true});await mkdir(evidenceDir,{recursive:true});
  const profile=await mkdtemp(join(tmpdir(),'p2lrn-real-interop-browser-'));
  const process=spawn(exe,[
    '--headless=new','--no-first-run','--disable-extensions',
    '--disable-background-networking','--no-default-browser-check',
    '--remote-debugging-port=0','--user-data-dir='+profile,
    '--window-size=1440,1000','about:blank',
  ],{windowsHide:true,stdio:'ignore'});
  let debuggerPort=0;
  for(let i=0;i<130;i++){
    if(process.exitCode!==null)throw new Error('Chrome exited during startup');
    const active=join(profile,'DevToolsActivePort');
    if(existsSync(active)){debuggerPort=Number((await readFile(active,'utf8')).split(/\r?\n/)[0]);break;}
    await sleep(100);
  }
  if(!debuggerPort)throw new Error('Browser debugging connection unavailable');
  const pages=await (await fetch('http://127.0.0.1:'+debuggerPort+'/json')).json();
  const page=pages.find(p=>p.type==='page');
  if(!page?.webSocketDebuggerUrl)throw new Error('Browser page not inspectable');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail;});
  let sequence=0;const pending=new Map();
  ws.onmessage=event=>{
    const payload=JSON.parse(event.data);
    if(!payload.id||!pending.has(payload.id))return;
    const {ok,fail}=pending.get(payload.id);pending.delete(payload.id);
    if(payload.error)fail(Error(payload.error.message||'CDP failure'));
    else ok(payload.result||{});
  };
  const send=(method,params={},sessionId=null)=>new Promise((ok,fail)=>{
    const id=++sequence;
    pending.set(id,{ok,fail});
    ws.send(JSON.stringify(sessionId?{id,method,params,sessionId}:{id,method,params}));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  try{
    await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir,eventsEnabled:true});
  }catch{
    await send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir});
  }
  const evaluate=async expression=>{
    const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(r.exceptionDetails)throw new Error('Browser JS: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));
    return r.result?.value;
  };
  const wait=async(expression,{timeout=20000,label=expression}={})=>{
    const started=Date.now();
    let last=null;
    while(Date.now()-started<timeout){
      try{const value=await evaluate(expression);if(value)return value;last=value;}catch(error){last=error.message;}
      await sleep(125);
    }
    throw new Error('Browser UI timeout: '+label+'; last='+String(last).slice(0,220));
  };
  const navigate=async url=>{await send('Page.navigate',{url});await wait("document.readyState==='complete'",{timeout:25000,label:'navigation to '+url});};
  const screenshot=async name=>{
    const result=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
    const file=join(evidenceDir,name+'.png');
    await writeFile(file,Buffer.from(result.data,'base64'));return file;
  };
  const close=async()=>{
    try{ws.close();}catch{}
    try{process.kill();}catch{}
    await sleep(220);
    await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:140}).catch(()=>{});
  };
  return {send,evaluate,wait,navigate,screenshot,close,executable:exe};
}
