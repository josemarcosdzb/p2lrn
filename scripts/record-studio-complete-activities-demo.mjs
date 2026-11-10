// Real Chromium/Studio/Player browser walkthrough, compressed to MP4.
import {createServer} from 'node:http';
import {createReadStream,existsSync} from 'node:fs';
import {readFile,writeFile,mkdir,rm,cp,mkdtemp,stat,readdir} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {join,resolve,dirname,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {STUDIO_RUNTIME_SHARED_FILES} from '../deploy/netlify/studio-runtime-assets.mjs';
const root=resolve('.'),site=join(root,'.netlify-cdn'),out=resolve(process.env.P2LRN_DEMO_OUTPUT_DIR||join(root,'.visual-evidence','studio-curso-integral'));
const solvedMode=process.env.P2LRN_RECORD_SOLVE==='1';
const course=join(out,'laboratorio-cuestionarios-y-juegos.p2lrn'),video=join(out,solvedMode?'studio-partida-resuelta.mp4':'studio-creacion-y-vista-alumno.mp4'),framesFolder=join(out,solvedMode?'partida-resuelta-frames':'video-frames');
const reportPath=join(out,solvedMode?'partida-resuelta-report.json':'video-report.json');
const solvedActivities=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms)),must=(value,message)=>{if(!value)throw Error(message);},events=[];
const resume=solvedMode||process.env.P2LRN_RECORD_RESUME==='1';
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
    const ext=extname(path),types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.p2lrn':'application/vnd.p2lrn.package','.svg':'image/svg+xml','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2'};
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
// Studio owns the course outline: the embedded Player deliberately hides
// its duplicate navigation. Select each learner activity using Studio's tree.
function learner(name){return teacher(name);}

const SOLVE_GAME_BROWSER_SCRIPT="(async()=>{\nconst name=__NAME__,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));\nconst root=()=>document.querySelector('[data-player]')?.shadowRoot;\nconst stage=()=>root()?.querySelector('.p2lrn-stage');\nconst list=sel=>[...(stage()?.querySelectorAll(sel)||[])];\nconst fail=message=>{throw Error(message);};\nconst find=(sel,text)=>list(sel).find(x=>x.textContent.trim()===text);\nconst click=node=>{if(!node)fail('Falta control real en '+name);node.scrollIntoView({block:'center'});node.click();};\nconst text=(node,value)=>{if(!node)fail('Falta campo de texto en '+name);node.focus();node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));};\nconst choose=(node,value)=>{if(!node)fail('Falta selector de '+name);node.value=value;node.dispatchEvent(new Event('change',{bubbles:true}));};\nconst finish=()=>click(find('.p2lrn-game-actions button','Finalizar actividad'));\nconst matches=[['España','Madrid'],['Portugal','Lisboa'],['Francia','París'],['Italia','Roma']];\nconst categories={'Luna':'astro','Cometa':'astro','Granito':'geo','Volcán':'geo','Océano':'agua','Río':'agua'};\nconst categoryTitles={'astro':'Astros','geo':'Geología','agua':'Hidrosfera'};\nconst ordered=['Evaporación','Condensación','Precipitación','Acumulación'];\nconst rosco=[['A','Atmósfera'],['B','Biosfera'],['C','Corteza'],['D','Densidad'],['E','Eclipse'],['F','Fósil'],['G','Gravedad'],['H','Hidrosfera'],['I','Isótopo'],['J','Júpiter'],['M','Magma'],['N','Núcleo'],['Ñ','Montaña'],['Q','Equinoccio'],['R','Terremoto'],['Z','Ozono']];\nconst crossword=[['Astro que ilumina la Tierra.','Sol'],['Satélite natural terrestre.','Luna'],['Gran masa de agua salada.','Mar'],['Conjunto de gases que respiramos.','Aire'],['Movimiento periódico de la superficie del mar.','Marea'],['Nuestro planeta.','Tierra'],['Energía que permite ver.','Luz'],['Arena y agua junto al mar.','Playa']];\nlet actions=0;\nconst move=async()=>{actions++;await pause(310);};\nconst setCardOption=(card,label)=>{\n const el=[...card.querySelectorAll('.p2lrn-q-option')].find(x=>x.textContent.trim()===label);\n if(!el)fail('No existe respuesta: '+label);\n click(el.querySelector('input')||el);\n};\nconst field=(card,label)=>{\n const row=[...card.querySelectorAll('.p2lrn-q-field')].find(x=>x.querySelector('span')?.textContent.trim()===label);\n return row?.querySelector('select');\n};\ntry{\n if(!stage())fail('El Player no ha renderizado la actividad');\n if(name==='Cuestionario completo'){\n   for(let i=0;i<10;i++){\n     const card=stage().querySelector('.p2lrn-q-card');if(!card)fail('No aparece la pregunta '+(i+1));\n     card.scrollIntoView({block:'center'});\n     if(i===0)setCardOption(card,'Tierra');\n     if(i===1){setCardOption(card,'Marte');setCardOption(card,'Saturno');}\n     if(i===2)setCardOption(card,'Verdadero');\n     if(i===3){\n       const rows=[...card.querySelectorAll('.p2lrn-tf-statement')];\n       if(rows.length!==3)fail('No se ven las tres afirmaciones');\n       for(const [j,correct] of [true,false,true].entries()){\n         const option=[...rows[j].querySelectorAll('label')].find(x=>x.textContent.trim()===(correct?'Verdadero':'Falso'));\n         click(option?.querySelector('input')||option);\n       }\n     }\n     if(i===4)text(card.querySelector('textarea.p2lrn-q-text'),'Marte');\n     if(i===5){\n       const inputs=card.querySelectorAll('.p2lrn-fill-input');\n       if(inputs.length!==2)fail('Faltan dos huecos');\n       text(inputs[0],'Tierra');text(inputs[1],'Sol');\n     }\n     if(i===6){\n       for(const [j,answer] of ['océano','estrella'].entries()){\n         const chip=[...card.querySelectorAll('.p2lrn-fill-chip')].find(x=>x.textContent.trim().toLocaleLowerCase('es')===answer);\n         click(chip);click(card.querySelectorAll('.p2lrn-fill-slot')[j]);await pause(200);\n       }\n     }\n     if(i===7){\n       for(let at=0;at<ordered.length;at++){\n         let guard=0;\n         while(guard++<15){\n           const rows=[...card.querySelectorAll('.p2lrn-q-order-item')];\n           const pos=rows.findIndex(x=>x.firstElementChild?.textContent.trim()===ordered[at]);\n           if(pos<0)fail('Falta ordenación '+ordered[at]);\n           if(pos<=at)break;\n           click(rows[pos].querySelector('button[aria-label=\"Mover arriba\"]'));await pause(100);\n         }\n       }\n     }\n     if(i===8)for(const [j,pair] of matches.entries())choose(field(card,pair[0]),'right'+j);\n     if(i===9)for(const [key,value] of Object.entries(categories))choose(field(card,key),value);\n     await move();\n     click(find('.p2lrn-q-actions button.primary',i===9?'Finalizar':'Siguiente'));\n     await pause(i===9?850:250);\n   }\n }else if(name==='Memoria'){\n   const cards=list('.p2lrn-memory-grid .p2lrn-game-card');\n   if(cards.length!==8)fail('No hay ocho cartas de memoria');\n   const visible=cards.map(x=>x.textContent.trim());\n   await pause(3100);\n   const pairs=[['Mercurio','Planeta más cercano al Sol'],['Venus','Planeta con atmósfera densa'],['Tierra','Planeta con océanos líquidos'],['Marte','Planeta conocido como rojo']];\n   for(const [a,b] of pairs){\n     const left=visible.indexOf(a),right=visible.indexOf(b);\n     if(left<0||right<0)fail('No se identificó una pareja: '+a);\n     click(cards[left]);await pause(260);click(cards[right]);await pause(530);actions+=2;\n   }\n   await pause(550);\n }else if(name==='Emparejar'){\n   const col=list('.p2lrn-match-column');\n   if(col.length!==2)fail('Faltan columnas del emparejamiento');\n   for(const [left,right] of matches){\n     click([...col[0].querySelectorAll('button')].find(x=>x.textContent.trim()===left));\n     await pause(300);\n     click([...col[1].querySelectorAll('button')].find(x=>x.textContent.trim()===right));await move();\n   }\n   finish();await pause(750);\n }else if(name==='Ordenar'){\n   for(let at=0;at<ordered.length;at++){\n     let limit=0;\n     while(limit++<15){\n       const rows=list('.p2lrn-order-row');\n       const pos=rows.findIndex(row=>row.querySelector('.p2lrn-game-card')?.textContent.trim()===ordered[at]);\n       if(pos<0)fail('No hay ficha '+ordered[at]);\n       if(pos<=at)break;\n       click(rows[pos].querySelector('button[aria-label^=\"Subir\"]'));await pause(120);\n     }\n     await move();\n   }\n   finish();await pause(750);\n }else if(name==='Clasificar'){\n   for(const [item,cat] of Object.entries(categories)){\n     click(find('.p2lrn-classification-item',item));\n     await pause(240);\n     const box=list('.p2lrn-classification-box').find(x=>x.querySelector('strong')?.textContent.trim()===categoryTitles[cat]);\n     click(box);await move();\n   }\n   finish();await pause(760);\n }else if(name==='Verdadero y falso'){\n   for(const truth of [true,false,true]){\n     click(find('.p2lrn-vf-card .p2lrn-game-choice',truth?'Verdadero':'Falso'));\n     await pause(650);actions++;\n   }\n }else if(name==='Completar huecos'){\n   const card=stage().querySelector('.p2lrn-q-card');\n   if(!card)fail('No se ve el hueco');\n   for(const [j,answer] of ['Sol','Tierra'].entries()){\n     const chip=[...card.querySelectorAll('.p2lrn-fill-chip')].find(x=>x.textContent.trim()===answer);\n     click(chip);click(card.querySelectorAll('.p2lrn-fill-slot')[j]);await move();\n   }\n   click(find('.p2lrn-q-actions button.primary','Finalizar'));await pause(770);\n }else if(name==='Sopa de letras'){\n   const words={'Cuerpo celeste que orbita una estrella.':'Planeta','Objeto helado con cola al acercarse al Sol.':'Cometa','Astro que produce luz por fusión.':'Estrella','Conjunto enorme de estrellas.':'Galaxia','Trayectoria de un cuerpo alrededor de otro.':'Órbita','Objeto que gira alrededor de un planeta.':'Satélite','Gran extensión de agua salada.':'Océano','Abertura geológica que expulsa lava.':'Volcán'};\n   const inputs=list('.p2lrn-word-answer');\n   if(inputs.length!==8)fail('El tablero no tiene ocho palabras');\n   for(const input of inputs){\n     const clue=input.closest('label')?.querySelector('span')?.textContent?.trim();\n     if(!words[clue])fail('Pista no reconocida: '+clue);\n     text(input,words[clue]);await move();\n   }\n   await pause(650);\n }else if(name==='Crucigrama'){\n   for(const [clue,answer] of crossword){\n     click(find('.p2lrn-crossword-clue',clue));\n     const cells=list('.p2lrn-crossword-cell.is-active-word input');\n     const word=answer.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toUpperCase();\n     if(cells.length!==word.length)fail('Casillas incorrectas para '+answer+': '+cells.length);\n     for(let j=0;j<word.length;j++){text(cells[j],word[j]);await pause(60);}\n     await move();\n   }\n   finish();await pause(760);\n }else if(name==='Rosco'){\n   for(const [letter,answer] of rosco){\n     const button=list('.p2lrn-rosco-letter').find(x=>x.textContent.trim()===letter);\n     click(button);\n     await pause(180);\n     const clue=find('.p2lrn-rosco-prompt',letter);\n     const label=stage().querySelector('.p2lrn-rosco-prompt')?.textContent??'';\n     const expected=(['Ñ','Q','R','Z'].includes(letter)?'Contiene':'Empieza');\n     if(!label.includes(expected))fail('La pista '+letter+' no muestra '+expected+': '+label);\n     text(stage().querySelector('.p2lrn-rosco-challenge input'),answer);\n     click(find('.p2lrn-rosco-challenge button','Comprobar'));\n     await pause(1200);actions++;\n   }\n }else if(name.startsWith('3D')){\n   const panel=stage().querySelector('.p2lrn-3d-alternative');\n   if(!panel)fail('No aparece el panel accesible 3D');\n   if(name.includes('ordenar')){\n     for(const [j,key] of ordered.entries()){\n       const row=[...panel.querySelectorAll('.p2lrn-q-field')].find(x=>x.querySelector('span')?.textContent.trim()===key);\n       choose(row?.querySelector('select'),String(j));await move();\n     }\n   }else if(name.includes('relacionar')){\n     const cols=panel.querySelectorAll('.p2lrn-match-column');\n     if(cols.length!==2)fail('No se ven las parejas 3D');\n     for(const [left,right] of matches){\n       click([...cols[0].querySelectorAll('button')].find(x=>x.textContent.trim()===left));await pause(260);\n       click([...cols[1].querySelectorAll('button')].find(x=>x.textContent.trim()===right));await move();\n     }\n   }else if(name.includes('clasificar')){\n     for(const [item,cat] of Object.entries(categories)){\n       const row=[...panel.querySelectorAll('.p2lrn-q-field')].find(x=>x.querySelector('span')?.textContent.trim()===item);\n       choose(row?.querySelector('select'),cat);await move();\n     }\n   }else{\n     const pair=panel.querySelectorAll('select');\n     if(pair.length<2)fail('No se ven los selectores de ensamblaje');\n     for(let j=1;j<=2;j++){\n       choose(pair[0],'piece-'+j);choose(pair[1],'target-'+j);\n       click(find('.p2lrn-3d-alternative button','Colocar pieza'));await move();\n       const progress=panel.querySelector('[role=status]')?.textContent??'';\n       if(!progress.includes(j+'/2'))fail('No se colocó la pieza '+j+': '+progress);\n     }\n   }\n   finish();await pause(900);\n }else fail('Actividad no programada: '+name);\n const score=[...list('.p2lrn-game-status,.p2lrn-q-score,.p2lrn-vf-card h3,.p2lrn-rosco-stats')].map(n=>n.textContent.trim()).filter(Boolean).join(' | ').slice(-650);\n const all=[...score.matchAll(/(\\d+)\\s*\\/\\s*(\\d+)/g)];\n const perfect=all.some(match=>Number(match[2])>0&&match[1]===match[2])||\n    /Rosco completado:\\s*16 aciertos de 16/u.test(score);\n const target=stage().querySelector('.p2lrn-3d-layout,.p2lrn-rosco-layout,.p2lrn-game-shell,.p2lrn-q-shell')||stage();\n target.scrollIntoView({block:'center',inline:'center'});\n await pause(350);\n const rect=target.getBoundingClientRect();\n const onScreen=Math.max(0,Math.min(rect.bottom,innerHeight)-Math.max(rect.top,0))/Math.max(1,rect.height);\n return {ok:Boolean(perfect),actions,score,framing:{visibleHeightFraction:Math.round(onScreen*100)/100,width:Math.round(rect.width),height:Math.round(rect.height),viewport:[innerWidth,innerHeight]},canvasPresent:Boolean(stage().querySelector('canvas.p2lrn-3d-canvas'))};\n}catch(error){\n return {ok:false,actions,error:String(error?.stack||error).slice(0,1000),status:stage()?.textContent?.slice(-380)};\n}\n})()";
async function solveVisibleGame(name){
  const script=SOLVE_GAME_BROWSER_SCRIPT.replace('__NAME__',JSON.stringify(name));
  return evaluate(script);
}
async function solveDropFrame(){
  const frameTree=await send('Page.getFrameTree');
  const ids=[];
  const walk=node=>{if(!node)return;for(const child of node.childFrames??[]){ids.push(child.frame.id);walk(child);}};
  walk(frameTree.frameTree);
  if(!ids.length)throw Error('No sandboxed HTML iframe for the drag-and-drop activity');
  for(const id of ids){
    let context;
    try{context=await send('Page.createIsolatedWorld',{frameId:id,worldName:'p2lrn-solutions-browser'});}catch{continue;}
    if(!context?.executionContextId)continue;
    const expr="(async()=>{\n      const activity=document.querySelector('[data-p2lrn-dnd=\"1\"]');\n      if(!activity)return null;\n      const items=[...activity.querySelectorAll('[data-p2lrn-dnd-item]')];\n      const zones=[...activity.querySelectorAll('[data-p2lrn-dnd-zone]')];\n      if(items.length!==3||zones.length!==3)return {ok:false,error:'Expected three pieces and zones',items:items.length,zones:zones.length};\n      for(const zone of zones){\n        const item=items.find(x=>x.dataset.p2lrnDndItem===zone.dataset.p2lrnDndAccept);\n        if(!item)return {ok:false,error:'Missing matching piece for '+zone.dataset.p2lrnDndAccept};\n        item.click();\n        await new Promise(done=>setTimeout(done,450));\n        zone.click();\n        await new Promise(done=>setTimeout(done,450));\n      }\n      return {ok:activity.dataset.p2lrnDndCompleted==='true',actions:6,score:activity.querySelector('[data-p2lrn-dnd-status]')?.textContent,framing:{iframe:true}};\n    })()";
    const r=await send('Runtime.evaluate',{contextId:context.executionContextId,expression:expr,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
    if(r.result?.value)return r.result.value;
  }
  throw Error('No HTML drag-and-drop engine with trusted bootstrap in the actual Player iframe');
}

async function frameLoop(){
  while(active){
    try{const img=await send('Page.captureScreenshot',{format:'jpeg',quality:64,captureBeyondViewport:false});if(img?.data)await writeFile(join(framesFolder,String(count++).padStart(6,'0')+'.jpg'),Buffer.from(img.data,'base64'));}catch{}
    await delay(250);
  }
}
try{
  await mkdir(out,{recursive:true});
  if(!solvedMode&&!resume)await rm(framesFolder,{recursive:true,force:true});
  if(solvedMode)await rm(framesFolder,{recursive:true,force:true});
  await mkdir(framesFolder,{recursive:true});
  if(resume){const previous=(await readdir(framesFolder)).filter(name=>/^\d{6}\.jpg$/u.test(name));count=previous.length;console.log('P2LRN_VIDEO_RESUME_FRAMES='+count);}
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
  const names=['Memoria','Emparejar','Ordenar','Clasificar','Verdadero y falso','Completar huecos','Arrastrar y soltar','Sopa de letras','Crucigrama','Rosco','3D · ordenar','3D · relacionar','3D · clasificar','3D · ensamblar'];
  if(!resume){
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
  for(const name of names){
    await show('Profesor · '+name,teacher(name),1100);
    if(name==='Rosco'&&!solvedMode){
      await wait('document.querySelectorAll(".q-card").length>=16','rosco de 16');
      for(const i of [0,1,3,5,8,12,13,14,15])await show('Rosco · pregunta '+(i+1),'(()=>{const x=document.querySelectorAll(".q-card")['+i+'];x?.scrollIntoView({block:"center"});return Boolean(x);})()',700);
    }
  }
  }else{
    await show('Retomar grabación del mismo curso validado',
      '(()=>{document.querySelector("[data-url]").value='+JSON.stringify(host+pkgUrl)+';document.querySelector("[data-open-url]").click();return true;})()',1800);
    await wait('[...document.querySelectorAll("[data-tree] button")].some(b=>b.textContent.includes("Rosco"))','curso recuperado');
  }
  await show('Curso completo','(()=>{const b=document.querySelector("[data-tree] button");b?.click();return Boolean(b);})()',solvedMode?350:700);
  await show('Vista alumno dentro de Studio','(()=>{document.querySelector("[data-mode-preview]").click();return true;})()',1600);
  await delay(2500);
  const previewDiagnostic=await evaluate('(()=>{const player=document.querySelector("[data-player]");const r=player?.shadowRoot;return {status:document.querySelector("[data-studio-status]")?.textContent,playerElement:player?.tagName,playerSrc:player?.getAttribute("src")?.slice(0,75),playerNode:player?.getAttribute("node"),shadow:!!r,shadowContent:r?.textContent?.slice(0,900),navButtons:r?.querySelectorAll(".p2lrn-nav button").length,previewVisible:!document.querySelector("[data-preview-stage]")?.hidden,stage:document.querySelector("[data-preview-stage]")?.textContent?.slice(0,300)};})()');
  console.log('PLAYER_PREVIEW_DIAGNOSTIC='+JSON.stringify(previewDiagnostic));
  await wait('Boolean(document.querySelector("[data-player]")?.shadowRoot?.querySelector(".p2lrn-stage"))','Player integrado');

  for(const name of ['Cuestionario completo',...names]){
    await show('Alumno · '+name,learner(name),solvedMode?450:1800);
    await evaluate('(()=>{const r=document.querySelector("[data-player]")?.shadowRoot;const x=r?.querySelector(".p2lrn-rosco-layout,.p2lrn-3d-layout,.p2lrn-game-shell");x?.scrollIntoView({block:"center"});return true;})()');
    if(name==='Rosco'&&!solvedMode){
      await wait('document.querySelector("[data-player]")?.shadowRoot?.querySelectorAll(".p2lrn-rosco-letter").length>=16','rosco del alumno');
      const label=await show('Rosco alumno · Contiene la Ñ','(()=>{const r=document.querySelector("[data-player]").shadowRoot,b=[...r.querySelectorAll(".p2lrn-rosco-letter")].find(x=>x.textContent==="Ñ");b?.click();return r.querySelector(".p2lrn-rosco-prompt")?.textContent??false;})()',2600);
      must(String(label).includes('Contiene'),'Vista alumno no presenta Contiene la Ñ');
    }
    if(solvedMode){
      let outcome;
      try{
        outcome=name==='Arrastrar y soltar'?await solveDropFrame():await solveVisibleGame(name);
      }catch(error){outcome={ok:false,error:String(error?.stack||error).slice(0,1200)};}
      solvedActivities.push({name,...outcome});
      console.log('P2LRN_SOLVED_ACTIVITY='+JSON.stringify({name,...outcome}));
      await delay(1100);
    }
    if(name.startsWith('3D'))await delay(solvedMode?300:650);
  }
  await delay(1250);active=false;await job;
  must(count>90,'La grabación es demasiado corta: '+count);
  const ff=spawnSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-framerate','4','-i',join(framesFolder,'%06d.jpg'),'-vf','scale=1280:720:flags=lanczos,format=yuv420p','-c:v','libx264','-preset','veryfast','-crf','24','-movflags','+faststart',video],{windowsHide:true,encoding:'utf8',timeout:180000});
  if(ff.status!==0||!existsSync(video)){
    const details={ok:false,needsEncoding:true,reason:'ffmpeg no disponible o codificación fallida',frames:count,frameRate:4,
      frameDirectory:solvedMode?'partida-resuelta-frames':'video-frames',activities:names.length+1,events,
      solvedMode,solvedActivities,
      encoderError:String(ff.error?.message||ff.stderr||'sin salida').slice(0,1000)};
    await writeFile(reportPath,JSON.stringify(details,null,2)+'\n');
    console.log('DEMO_VIDEO_FRAMES_READY='+JSON.stringify(details));
  }else{
  const size=(await stat(video)).size;
  await writeFile(reportPath,JSON.stringify({ok:!solvedMode||solvedActivities.every(a=>a.ok),video:solvedMode?'studio-partida-resuelta.mp4':'studio-creacion-y-vista-alumno.mp4',seconds:count/4,frames:count,render:'1280x720',realStudio:true,realPlayer:true,activities:names.length+1,events,solvedMode,solvedActivities},null,2)+'\n');
  console.log('DEMO_VIDEO='+JSON.stringify({file:video,size,seconds:count/4,frames:count}));
  }
}finally{
  active=false;if(job)await job.catch(()=>{});
  try{socket?.close();}catch{}try{chrome?.kill();}catch{}
  await new Promise(done=>server.close(done));
  if(profile)await rm(profile,{recursive:true,force:true}).catch(()=>{});
  // Preserve real browser frames if ffmpeg was unavailable, so an
  // externally generated video can still be encoded without replaying.
  if(existsSync(video))await rm(framesFolder,{recursive:true,force:true}).catch(()=>{});
}
