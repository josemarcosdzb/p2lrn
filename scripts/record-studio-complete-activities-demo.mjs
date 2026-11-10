// Real Chromium/Studio/Player browser walkthrough, compressed to MP4.
import {createServer} from 'node:http';
import {createReadStream,existsSync} from 'node:fs';
import {readFile,writeFile,mkdir,rm,cp,mkdtemp,stat} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {join,resolve,dirname,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {STUDIO_RUNTIME_SHARED_FILES} from '../deploy/netlify/studio-runtime-assets.mjs';
const root=resolve('.'),site=join(root,'.netlify-cdn'),out=resolve(process.env.P2LRN_DEMO_OUTPUT_DIR||join(root,'.visual-evidence','studio-curso-integral'));
const course=join(out,'laboratorio-cuestionarios-y-juegos.p2lrn'),video=join(out,'studio-creacion-y-vista-alumno.mp4'),framesFolder=join(out,'.video-frames');
const delay=ms=>new Promise(r=>setTimeout(r,ms)),must=(value,message)=>{if(!value)throw Error(message);},events=[];
await stat(course);await stat(join(site,'player/current/dist/p2lrn.js'));
await cp(join(root,'packages/toolkit/web/studio'),join(site,'studio/runtime'),{recursive:true,force:true});
for(const rel of STUDIO_RUNTIME_SHARED_FILES){
  const target=join(site,'studio',...rel.split('/'));
  await mkdir(dirname(target),{recursive:true});
  await cp(join(root,'packages/toolkit/web',...rel.split('/')),target,{force:true});
}
const pkgUrl='/examples/generated/laboratorio-cuestionarios-y-juegos.p2lrn';
const pkgTarget=join(site,...pkgUrl.slice(1).split('/'));await mkdir(dirname(pkgTarget),{recursive:true});await cp(course,pkgTarget,{force:true});
const server=createServer(async(req,res)=>{
  try{
    let path=resolve(site,decodeURIComponent(new URL(req.url||'/','http://127.0.0.1').pathname).replace(/^\/+/, '')||'index.html');
    if(path!==site&&!path.startsWith(site+sep)){res.writeHead(403);res.end();return;}
    let fs=await stat(path);if(fs.isDirectory()){path=join(path,'index.html');fs=await stat(path);}
    const ext=extname(path),types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.p2lrn':'application/vnd.p2lrn.package','.svg':'image/svg+xml','.wasm':'application/wasm','.png':'image/png','.woff2':'font/woff2'};
    res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Content-Length':fs.size,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
    createReadStream(path).pipe(res);
  }catch{res.writeHead(404);res.end('Not Found');}
});await new Promise((ok,err)=>{server.once('error',err);server.listen(0,'127.0.0.1',ok);});
const host='http://127.0.0.1:'+server.address().port,exe=[process.env.P2LRN_CHROME,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','/usr/bin/chromium'].filter(Boolean).find(existsSync);
must(exe,'Se necesita Chrome o Edge para grabar Studio y Player reales.');
let chrome=null,profile=null,socket=null,active=false,job=null,count=0,seq=0;
const pending=new Map();
function send(method,params={}){const id=++seq;socket.send(JSON.stringify({id,method,params}));return new Promise((ok,err)=>pending.set(id,{ok,err}));}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;}
async function wait(expression,label){
  for(let i=0;i<170;i++){try{if(await evaluate(expression))return;}catch{}await delay(180);}
  throw Error('No aparece '+label);
}
async function show(label,expression,ms=1200){const r=await evaluate(expression);must(r!==false,'No se puede abrir '+label);events.push(label);console.log('REAL_UI_STEP '+label);await delay(ms);return r;}
function teacher(name){return '(()=>{const b=[...document.querySelectorAll("[data-tree] button")].find(x=>x.textContent.includes('+JSON.stringify(name)+'));if(!b)return false;b.click();return true;})()';}
function learner(name){return '(()=>{const r=document.querySelector("[data-player]")?.shadowRoot;const b=[...r?.querySelectorAll(".p2lrn-nav button")??[]].find(x=>x.textContent.includes('+JSON.stringify(name)+'));if(!b)return false;b.click();return true;})()';}
async function frameLoop(){
  while(active){
    try{const img=await send('Page.captureScreenshot',{format:'jpeg',quality:64,captureBeyondViewport:false});if(img?.data)await writeFile(join(framesFolder,String(count++).padStart(6,'0')+'.jpg'),Buffer.from(img.data,'base64'));}catch{}
    await delay(250);
  }
}
try{
  await mkdir(out,{recursive:true});await rm(framesFolder,{recursive:true,force:true});await mkdir(framesFolder,{recursive:true});
  profile=await mkdtemp(join(tmpdir(),'p2lrn-recording-'));
  chrome=spawn(exe,['--headless=new','--no-sandbox','--no-first-run','--enable-unsafe-swiftshader','--use-gl=swiftshader','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
  let port=0;for(let i=0;i<125;i++){const p=join(profile,'DevToolsActivePort');if(existsSync(p)){port=Number((await readFile(p,'utf8')).split('\n')[0]);break;}await delay(100);}
  must(port,'No arranca el navegador para grabar');
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json(),page=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
  must(page,'No hay pestaña que grabar');socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,err)=>{socket.onopen=ok;socket.onerror=err;});
  socket.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.err(Error(m.error.message)):p.ok(m.result);}};
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:host+'/studio/'});
  await wait("document.readyState==='complete'&&Boolean(document.querySelector('[data-create-course]'))",'Studio');
  active=true;job=frameLoop();await delay(1800);
  await show('Nuevo curso en Studio','(()=>{document.querySelector("[data-create-course]").click();return true;})()',1650);
  await wait("document.querySelector('[data-toolbar]')?.hidden===false",'barra de Studio');
  await show('Catálogo de preguntas y juegos','(()=>{document.querySelector("[data-add-content]").click();return true;})()',1500);
  await show('Crear cuestionario','(()=>{const b=document.querySelector("[data-add-kind=questionnaire]");b?.click();return Boolean(b);})()',1800);
  await wait('Boolean(document.querySelector(".q-card"))','cuestionario creado');
  await show('Editar una pregunta real','(()=>{document.querySelector(".q-card").scrollIntoView({block:"center"});return true;})()',1700);
  await show('Importar el curso completo con Studio','(()=>{document.querySelector("[data-url]").value='+JSON.stringify(host+pkgUrl)+';document.querySelector("[data-open-url]").click();return true;})()',1900);
  await wait('[...document.querySelectorAll("[data-tree] button")].some(b=>b.textContent.includes("Rosco"))','curso completo');
  await show('Cuestionario con todas las variantes',teacher('Cuestionario completo'),1400);
  await wait('document.querySelectorAll(".q-card").length>=10','diez preguntas');
  for(let i=0;i<10;i++)await show('Profesor · pregunta '+(i+1),'(()=>{const c=document.querySelectorAll(".q-card")['+i+'];c?.scrollIntoView({block:"center"});return Boolean(c);})()',650);
  const names=['Memoria','Emparejar','Ordenar','Clasificar','Verdadero y falso','Completar huecos','Sopa de letras','Crucigrama','Rosco','3D · ordenar','3D · relacionar','3D · clasificar','3D · ensamblar'];
  for(const name of names){
    await show('Profesor · '+name,teacher(name),1100);
    if(name==='Rosco'){
      await wait('document.querySelectorAll(".q-card").length>=16','rosco de 16');
      for(const i of [0,1,3,5,8,12,13,14,15])await show('Rosco · pregunta '+(i+1),'(()=>{const x=document.querySelectorAll(".q-card")['+i+'];x?.scrollIntoView({block:"center"});return Boolean(x);})()',700);
    }
  }
  await show('Curso completo','(()=>{const b=document.querySelector("[data-tree] button");b?.click();return Boolean(b);})()',700);
  await show('Vista alumno dentro de Studio','(()=>{document.querySelector("[data-mode-preview]").click();return true;})()',1600);
  await wait('Boolean(document.querySelector("[data-player]")?.shadowRoot?.querySelector(".p2lrn-nav"))','Player integrado');
  for(const name of ['Cuestionario completo',...names]){
    await show('Alumno · '+name,learner(name),1800);
    await evaluate('(()=>{const r=document.querySelector("[data-player]")?.shadowRoot;x=r?.querySelector(".p2lrn-rosco-layout,.p2lrn-3d-layout,.p2lrn-game-shell");x?.scrollIntoView({block:"center"});return true;})()'.replace('x=r?','const x=r?'));
    if(name==='Rosco'){
      await wait('document.querySelector("[data-player]")?.shadowRoot?.querySelectorAll(".p2lrn-rosco-letter").length>=16','rosco del alumno');
      const label=await show('Rosco alumno · Contiene la Ñ','(()=>{const r=document.querySelector("[data-player]").shadowRoot,b=[...r.querySelectorAll(".p2lrn-rosco-letter")].find(x=>x.textContent==="Ñ");b?.click();return r.querySelector(".p2lrn-rosco-prompt")?.textContent??false;})()',2600);
      must(String(label).includes('Contiene'),'Vista alumno no presenta Contiene la Ñ');
    }
    if(name.startsWith('3D'))await delay(650);
  }
  await delay(1250);active=false;await job;
  must(count>90,'La grabación es demasiado corta: '+count);
  const ff=spawnSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-framerate','4','-i',join(framesFolder,'%06d.jpg'),'-vf','scale=1280:720:flags=lanczos,format=yuv420p','-c:v','libx264','-preset','veryfast','-crf','24','-movflags','+faststart',video],{windowsHide:true,encoding:'utf8',timeout:180000});
  must(ff.status===0&&existsSync(video),'No se ha codificado MP4 con ffmpeg: '+(ff.error?.message||ff.stderr));
  const size=(await stat(video)).size;
  await writeFile(join(out,'video-report.json'),JSON.stringify({ok:true,video:'studio-creacion-y-vista-alumno.mp4',seconds:count/4,frames:count,render:'1280x720',realStudio:true,realPlayer:true,activities:names.length+1,events},null,2)+'\n');
  console.log('DEMO_VIDEO='+JSON.stringify({file:video,size,seconds:count/4,frames:count}));
}finally{
  active=false;if(job)await job.catch(()=>{});
  try{socket?.close();}catch{}try{chrome?.kill();}catch{}
  await new Promise(done=>server.close(done));
  if(profile)await rm(profile,{recursive:true,force:true}).catch(()=>{});
  await rm(framesFolder,{recursive:true,force:true}).catch(()=>{});
}
