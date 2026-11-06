#!/usr/bin/env node
// P2LRN public-page regression, run against the local static source in isolated Chrome.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve,relative,isAbsolute,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const site=resolve(fileURLToPath(new URL('../deploy/netlify/site/',import.meta.url)));
const contentTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml',
 '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp',
 '.woff2':'font/woff2','.mp4':'video/mp4'};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const server=createServer(async(req,res)=>{try{
 const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 const target=resolve(site,pathname.replace(/^\/+/, '')+(pathname.endsWith('/')?'index.html':''));
 const rel=relative(site,target);
 if(isAbsolute(rel)||rel.startsWith('..')){res.writeHead(403);res.end();return;}
 const content=await readFile(target);
 res.writeHead(200,{'Content-Type':contentTypes[extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(content);
}catch{res.writeHead(404);res.end('not found');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browserPath=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
if(!browserPath){server.close();throw Error('Chrome or Edge not found on the runner');}
const profile=await mkdtemp(join(tmpdir(),'p2lrn-white-screen-'));
let browser,ws;
try{
 browser=spawn(browserPath,['--headless=new','--disable-extensions','--no-first-run','--remote-debugging-port=0',
   '--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let debuggerPort=0;
 for(let i=0;i<90;i++){const file=join(profile,'DevToolsActivePort');
   if(existsSync(file)){debuggerPort=Number((await readFile(file,'utf8')).split('\n')[0]);break;}
   await pause(130);}
 if(!debuggerPort)throw Error('Browser debugging endpoint did not start');
 const targets=await(await fetch('http://127.0.0.1:'+debuggerPort+'/json')).json();
 ws=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
 let seq=0;const pending=new Map();let exceptions=[];
 ws.onmessage=e=>{const data=JSON.parse(e.data),task=pending.get(data.id);
   if(task){pending.delete(data.id);return data.error?task.reject(Error(data.error.message)):task.resolve(data.result);}
   if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params.exceptionDetails.exception?.description||data.params.exceptionDetails.text);
 };
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});
   ws.send(JSON.stringify({id,method,params}));});
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 const results=[];
 for(const [locale,path] of [['es','/'],['en','/en/']]){
   exceptions=[];await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+path});
   await pause(2500);
   const evalResult=await send('Runtime.evaluate',{expression:"(async()=>{\n const before={title:document.title,visibleText:document.body?.innerText.length||0};\n if(before.visibleText<300)throw Error('Landing page did not render');\n const pause=ms=>new Promise(r=>setTimeout(r,ms));\n const standalone=document.createElement('span');standalone.textContent='Powered by Netlify';document.body.append(standalone);\n await pause(45);\n const rootSurvived=!!document.documentElement&&!!document.body?.isConnected,standaloneRemoved=!standalone.isConnected;\n const nested=document.createElement('div');nested.innerHTML='<div><span>Powered by Netlify</span></div>';document.body?.append(nested);await pause(45);\n const nestedSafe=!!document.documentElement&&!!document.body?.isConnected;\n const toolbar=document.createElement('netlify-toolbar');document.body?.append(toolbar);await pause(45);\n const toolbarRemoved=!toolbar.isConnected;\n const fixed=document.createElement('div');Object.assign(fixed.style,{position:'fixed',width:'160px',height:'30px',right:'0',bottom:'0'});\n fixed.innerHTML='<span>Powered by Netlify</span>';document.body?.append(fixed);await pause(45);\n const fixedRemoved=!fixed.isConnected;\n const ordinary=document.createElement('div');ordinary.textContent='Ordinary valid course content';document.body?.append(ordinary);\n const ordinaryPreserved=ordinary.isConnected;ordinary.remove();nested.remove();\n const original=document.querySelectorAll;let globalScans=0,brandingQueries=0,textQueries=0;\n document.querySelectorAll=function(s){globalScans++;if(String(s).includes('netlify'))brandingQueries++;\n if(String(s).includes('a,button,div,span'))textQueries++;return original.call(this,s)};\n const start=performance.now();\n try{for(let i=0;i<110;i++){const item=document.createElement('span');item.textContent='qa-'+i;document.body.append(item);\n await pause(0);item.remove()}}finally{delete document.querySelectorAll}\n return {before,after:{htmlPresent:!!document.documentElement,bodyPresent:!!document.body,\n   visibleText:document.body?.innerText.length||0},rootSurvived,standaloneRemoved,nestedSafe,\n   toolbarRemoved,fixedRemoved,ordinaryPreserved,globalScans,brandingQueries,textQueries,elapsedMs:Math.round(performance.now()-start)};\n})()",returnByValue:true,awaitPromise:true});
   if(evalResult.exceptionDetails)throw Error(locale+' browser error: '+(evalResult.exceptionDetails.exception?.description||evalResult.exceptionDetails.text));
   const result=evalResult.result?.value;
   const good=result?.rootSurvived&&result?.standaloneRemoved&&result?.nestedSafe&&result?.toolbarRemoved&&
     result?.fixedRemoved&&result?.ordinaryPreserved&&result?.after.htmlPresent&&result?.after.bodyPresent;
   if(!good)throw Error(locale+' document deletion regression: '+JSON.stringify(result));
   if(result.brandingQueries>2||result.textQueries>2)throw Error(locale+' global DOM scanning regression: '+JSON.stringify(result));
   if(exceptions.length)throw Error(locale+' JavaScript exceptions: '+exceptions.join('; ').slice(0,500));
   results.push({locale,...result});
 }
 console.log(JSON.stringify({ok:true,results},null,2));
}finally{try{ws?.close()}catch{}try{browser?.kill()}catch{}
 await new Promise(resolve=>server.close(resolve));
 await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});
}