import {exportP2LRNPackage, writeStoredZip} from './package-export.js';
import {capabilityRequirements} from '../capability-broker.js';

export const OFFLINE_ASSIGNMENT_SCHEMA='https://p2lrn.org/schema/offline-assignment/1';
export const OFFLINE_RESULT_SCHEMA='https://p2lrn.org/schema/offline-result/1';
export const OFFLINE_ASSIGNMENT_VERSION='1';
export const OFFLINE_TEACHER_RECEIPT_SCHEMA='https://p2lrn.org/schema/offline-teacher-receipt/1';

const encoder=new TextEncoder();
const decoder=new TextDecoder();

function clone(value){return value==null?value:structuredClone(value);}
function canonicalize(value){
  if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number'){
    if(!Number.isFinite(value))throw new Error('Non-finite JSON number.');
    if(Number.isInteger(value)&&!Number.isSafeInteger(value))throw new Error('Unsafe JSON integer.');
    return JSON.stringify(value);
  }
  if(Array.isArray(value))return '['+value.map(canonicalize).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map((key)=>JSON.stringify(key)+':'+canonicalize(value[key])).join(',')+'}';
  throw new Error('Unsupported JSON value.');
}
async function sha256Bytes(bytes){
  const view=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',view));
  return 'sha256:'+Array.from(digest,(byte)=>byte.toString(16).padStart(2,'0')).join('');
}
async function sha256Json(value){return sha256Bytes(encoder.encode(canonicalize(value)));}

// Optional teacher signing. No private key is stored, exported or included
// in the learner's file. Authenticity requires the teacher's saved receipt.
function base64(bytes){return btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join(''));}
function unbase64(value){
  if(typeof value!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)||value.length>4096)
    throw new TypeError('Firma Ed25519: Base64 inválido.');
  return Uint8Array.from(atob(value),char=>char.charCodeAt(0));
}
function unsignedAssignment(assignment){const payload=clone(assignment);delete payload.signature;return payload;}
export async function signOfflineAssignment(assignment){
  if(!assignment||assignment.schema!==OFFLINE_ASSIGNMENT_SCHEMA||assignment.version!==OFFLINE_ASSIGNMENT_VERSION)
    throw new TypeError('El encargo offline debe ser válido antes de firmarlo.');
  let pair;
  try{pair=await crypto.subtle.generateKey({name:'Ed25519'},false,['sign','verify']);}
  catch{throw new Error('Este navegador no admite Ed25519. Usa Chrome/Edge actualizado o genera una entrega normal.');}
  const publicKey=new Uint8Array(await crypto.subtle.exportKey('spki',pair.publicKey));
  const payload=unsignedAssignment(assignment);
  const value=new Uint8Array(await crypto.subtle.sign('Ed25519',pair.privateKey,encoder.encode(canonicalize(payload))));
  return {...payload,signature:{algorithm:'Ed25519',publicKey:base64(publicKey),value:base64(value),keyFingerprint:await sha256Bytes(publicKey)}};
}
export async function verifyOfflineAssignmentSignature(assignment){
  if(!assignment?.signature)return false;
  try{
    const {algorithm,publicKey,value,keyFingerprint}=assignment.signature;
    if(algorithm!=='Ed25519')return false;
    const publicBytes=unbase64(publicKey),signatureBytes=unbase64(value);
    if(keyFingerprint!==await sha256Bytes(publicBytes)||signatureBytes.length!==64)return false;
    const key=await crypto.subtle.importKey('spki',publicBytes,{name:'Ed25519'},false,['verify']);
    return await crypto.subtle.verify('Ed25519',key,signatureBytes,encoder.encode(canonicalize(unsignedAssignment(assignment))));
  }catch{return false;}
}
// The Host emits state, score and event operations in the order they happened.
// A result stores them in separate arrays for convenient review. The order map
// restores their original interleaving without copying the operations twice.
function orderedResultOperations(result){
  const groups={
    state:result.submission?.states??[],
    score:result.submission?.scores??[],
    event:result.analytics?.events??[],
  };
  if(Object.values(groups).some(records=>!Array.isArray(records)))return false;
  const total=Object.values(groups).reduce((count,records)=>count+records.length,0);
  const order=result.audit?.recordOrder;
  if(order==null){
    // Older P2LRN results did not save interleaving. Multiple nonempty
    // groups cannot be reconstructed reliably: show "not verifiable".
    if(Object.values(groups).filter(records=>records.length>0).length>1)return null;
    return [...groups.state,...groups.score,...groups.event];
  }
  if(!Array.isArray(order)||order.length!==total||order.length>100000)return false;
  const used=new Set(),records=[];
  for(const entry of order){
    if(!Array.isArray(entry)||entry.length!==2||
      !Object.hasOwn(groups,entry[0])||!Number.isSafeInteger(entry[1])||
      entry[1]<0||entry[1]>=groups[entry[0]].length)return false;
    const key=entry[0]+':'+entry[1];
    if(used.has(key))return false;
    used.add(key);
    records.push(groups[entry[0]][entry[1]]);
  }
  return records;
}
async function verifyResultEvidence(result){
  const declared=result?.audit?.evidenceRoot;
  if(declared==null)return null;
  if(!/^sha256:[0-9a-f]{64}$/.test(String(declared)))return false;
  const records=orderedResultOperations(result);
  if(records===null)return null;
  if(records===false)return false;
  const base=String(result.assignment?.assignmentId??'')+'|'+String(result.assignment?.contentRoot??'');
  let current=await sha256Bytes(encoder.encode(base));
  for(const record of records)current=await sha256Bytes(encoder.encode(current+'|'+canonicalize(record)));
  return declared===current;
}
function resultAnswers(states){
  const out=[];
  for(const record of states){
    const answers=record?.value?.answers;
    if(!answers||typeof answers!=='object'||Array.isArray(answers))continue;
    for(const [questionId,answer] of Object.entries(answers))
      out.push({entityId:record.context?.entityId??null,questionId,answer});
  }
  return out;
}
function resultActiveTime(events){
  let best=0;
  for(const record of events){
    if(record?.value?.type==='p2lrn:active-time')
      best=Math.max(best,Number(record.value?.payload?.totalActiveMs)||0);
    else if(record?.value?.payload && Number.isFinite(Number(record.value.payload.totalActiveMs)))
      best=Math.max(best,Number(record.value.payload.totalActiveMs));
  }
  return best;
}
function verifyResultSummary(result){
  const states=result.submission?.states,scores=result.submission?.scores,events=result.analytics?.events;
  if(!Array.isArray(states)||!Array.isArray(scores)||!Array.isArray(events)||
    !Array.isArray(result.submission?.answers)||!result.summary)return false;
  const answers=resultAnswers(states);
  const latest=[...scores].reverse().find(op=>op.type==='score')?.value??null;
  const activeTime=resultActiveTime(events);
  try{
    return result.summary.stateSnapshots===states.length &&
      result.summary.events===events.length &&
      result.summary.answers===answers.length &&
      canonicalize(result.submission.answers)===canonicalize(answers) &&
      canonicalize(result.summary.latestScore??null)===canonicalize(latest) &&
      result.summary.activeTimeMs===activeTime &&
      result.analytics.activeTimeMs===activeTime &&
      (result.usage==null||result.summary.openings==null||Number(result.summary.openings)===Math.max(0,Number(result.usage?.openCount)||0));
  }catch{return false;}
}
function jsonBytes(value){return encoder.encode(JSON.stringify(value,null,2)+'\n');}
function textBytes(value){return encoder.encode(String(value).replace(/\r?\n/g,'\r\n'));}
function validIso(value,label){
  if(value==null||String(value).trim()==='')return null;
  const date=new Date(String(value));
  if(Number.isNaN(date.getTime()))throw new TypeError(label+' no es una fecha válida.');
  return date.toISOString();
}
function positiveInteger(value,label,{min=1,max=100000000}={}){
  if(value==null||value==='')return null;
  const parsed=Number(value);
  if(!Number.isInteger(parsed)||parsed<min||parsed>max)throw new TypeError(label+' debe ser un entero entre '+min+' y '+max+'.');
  return parsed;
}
function cleanFilename(value,fallback='curso'){
  const base=String(value??fallback).replace(/\.[^.]+$/,'').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').trim();
  return base||fallback;
}
function safeRuntimePath(value){
  const path=String(value??'').replaceAll('\\','/');
  if(!path||path.startsWith('/')||path.includes('..')||/^[a-z][a-z0-9+.-]*:/i.test(path))throw new Error('Ruta insegura en el runtime Player: '+path);
  return path;
}
function localRepresentation(rep){return ['embedded','package-member'].includes(rep?.location?.type);}

function invalidCourseZip(message){
  const error=new Error('El paquete P2LRN embebido no es un ZIP completo: '+message);
  error.code='P2LRN_OFFLINE_INVALID_COURSE_ZIP';
  return error;
}
function assertCompleteCourseZip(value){
  const bytes=value instanceof Uint8Array?value:(value instanceof ArrayBuffer?new Uint8Array(value):null);
  if(!bytes)throw invalidCourseZip('el exportador no devolvió bytes.');
  if(bytes.byteLength<22)throw invalidCourseZip('archivo demasiado pequeño ('+bytes.byteLength+' bytes).');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(0,true)!==0x04034b50)throw invalidCourseZip('falta la cabecera local ZIP.');
  const min=Math.max(0,bytes.byteLength-22-0xffff),start=bytes.byteLength-22;
  let eocd=-1;
  for(let offset=start;offset>=min;offset--){
    if(view.getUint32(offset,true)!==0x06054b50)continue;
    const commentLength=view.getUint16(offset+20,true);
    if(offset+22+commentLength===bytes.byteLength){eocd=offset;break;}
  }
  if(eocd<0)throw invalidCourseZip('falta el end-of-central-directory.');
  const entries=view.getUint16(eocd+10,true),centralSize=view.getUint32(eocd+12,true),centralOffset=view.getUint32(eocd+16,true);
  if(entries<2)throw invalidCourseZip('el ZIP no contiene las entradas mínimas del paquete.');
  if(centralOffset+centralSize!==eocd)throw invalidCourseZip('el directorio central no coincide con el final del archivo.');
  if(centralOffset<4||centralOffset+4>bytes.byteLength||view.getUint32(centralOffset,true)!==0x02014b50)throw invalidCourseZip('el directorio central está ausente o truncado.');
  return bytes;
}

export function normalizeOfflineAssignmentPolicy(options={}){
  const availableFrom=validIso(options.availableFrom,'Disponible desde');
  const dueAt=validIso(options.dueAt,'Fecha límite');
  if(availableFrom&&dueAt&&new Date(dueAt)<=new Date(availableFrom))throw new TypeError('La fecha límite debe ser posterior a la fecha de disponibilidad.');
  return Object.freeze({
    availableFrom,
    dueAt,
    attemptDurationSeconds:positiveInteger(options.attemptDurationSeconds,'Tiempo máximo',{min:30,max:31*24*60*60}),
    maxAttempts:positiveInteger(options.maxAttempts??1,'Intentos máximos',{min:1,max:100})??1,
    expiresAfterFirstOpenDays:positiveInteger(options.expiresAfterFirstOpenDays,'Caducidad tras la primera apertura',{min:1,max:3650}),
    allowResume:options.allowResume!==false,
    collaboration:'disabled',
    network:'deny-by-default',
    activityTracking:options.activityTracking!==false,
  });
}

export function inspectOfflineAssignmentCompatibility(document){
  const issues=[];
  const entities=Array.isArray(document?.graph?.entities)?document.graph.entities:[];
  for(const entity of entities){
    let requests=[];
    try{requests=capabilityRequirements(entity);}catch(error){
      issues.push({code:'INVALID_HOST_CAPABILITY',entityId:entity?.id??null,message:String(error?.message??error)});
      continue;
    }
    for(const request of requests){
      if(String(request.id).startsWith('collaboration.')&&request.required){
        issues.push({code:'REQUIRED_COLLABORATION',entityId:entity.id,capabilityId:request.id,message:'La actividad requiere colaboración en directo y no puede ejecutarse sin host.'});
      }else if(request.required&&!request.fallback){
        issues.push({code:'REQUIRED_LIVE_CAPABILITY',entityId:entity.id,capabilityId:request.id,message:'La actividad requiere una capacidad del host sin fallback offline: '+request.id});
      }
    }
    if(entity?.type==='resource'){
      const reps=Array.isArray(entity.representations)?entity.representations:[];
      if(reps.length&&reps.every((rep)=>!localRepresentation(rep))){
        issues.push({code:'REMOTE_ONLY_RESOURCE',entityId:entity.id,message:'El recurso sólo tiene representaciones remotas y no puede incluirse en una entrega autocontenida.'});
      }
    }
  }
  return Object.freeze({ok:issues.length===0,issues:Object.freeze(issues.map((item)=>Object.freeze(item)))});
}

export function detectPlayerRuntimeBaseUrl({runtimeBaseUrl=null,documentObject=globalThis.document}={}){
  if(runtimeBaseUrl){
    const resolved=new URL(String(runtimeBaseUrl),documentObject?.baseURI??globalThis.location?.href??'http://localhost/');
    return new URL('./',resolved).href;
  }
  const moduleUrl=globalThis.__P2LRN_CDN_LOADER__?.moduleUrl;
  if(moduleUrl)return new URL('./',moduleUrl).href;
  const scripts=[...(documentObject?.scripts??[])];
  const match=scripts.map((script)=>script.src).find((src)=>/\/p2lrn(?:\.esm)?\.js(?:[?#].*)?$/i.test(String(src)));
  if(match)return new URL('./',match).href;
  throw new Error('No se ha podido localizar el runtime Player para crear la entrega offline. Configura offline-runtime-base-url en Studio.');
}

async function fetchBytes(fetchImpl,url){
  const response=await fetchImpl(url,{credentials:'same-origin'});
  if(!response?.ok)throw new Error('No se pudo incluir el runtime Player: HTTP '+(response?.status??'?')+' · '+url);
  return new Uint8Array(await response.arrayBuffer());
}

async function fetchRuntimeMember(fetchImpl,base,path){
  if(!path.endsWith('.html'))return fetchBytes(fetchImpl,new URL(path,base).href);
  // Raw mirrors are served as data, avoiding HTML rewriting by hosting/CDN
  // post-processors. The member is still packaged under its original .html
  // filename and ALWAYS checked against release.json below.
  const rawUrl=new URL(path+'.raw',base).href;
  const response=await fetchImpl(rawUrl,{credentials:'same-origin',cache:'no-store'});
  if(response?.ok)return new Uint8Array(await response.arrayBuffer());
  // Backwards compatibility for self-hosted runtimes without .raw sidecars.
  // The original HTML must still match the published release digest.
  if(response?.status===404)return fetchBytes(fetchImpl,new URL(path,base).href);
  throw new Error('No se pudo incluir el runtime Player: HTTP '+(response?.status??'?')+' · '+rawUrl);
}

async function collectRuntime(runtimeBaseUrl,fetchImpl){
  const base=new URL('./',runtimeBaseUrl).href;
  const releaseBytes=await fetchBytes(fetchImpl,new URL('release.json',base).href);
  let release;
  try{release=JSON.parse(decoder.decode(releaseBytes));}
  catch{throw new Error('release.json del Player no contiene JSON válido.');}
  if(!release||!Array.isArray(release.files)||!release.webSdkVersion)throw new Error('release.json del Player no tiene el contrato esperado.');
  const entries=[{path:'www/player/release.json',data:releaseBytes}];
  for(const descriptor of release.files){
    const path=safeRuntimePath(descriptor?.path);
    if(path==='release.json')continue;
    const bytes=await fetchRuntimeMember(fetchImpl,base,path);
    if(Number.isInteger(descriptor.bytes)&&descriptor.bytes!==bytes.byteLength)throw new Error('El runtime Player cambió durante la exportación: '+path);
    if(/^sha256:[0-9a-f]{64}$/i.test(String(descriptor.sha256??''))){
      const digest=await sha256Bytes(bytes);
      if(digest.toLowerCase()!==String(descriptor.sha256).toLowerCase())throw new Error('Digest inválido del runtime Player: '+path);
    }
    entries.push({path:'www/player/'+path,data:bytes});
  }
  return {release,releaseBytes,entries,base};
}

function launcherCmd(){
  return [
    '@echo off',
    'setlocal',
    'cd /d "%~dp0"',
    'title P2LRN - Entrega offline',
    'where powershell.exe >nul 2>&1 || (echo PowerShell no esta disponible en este equipo. & pause & exit /b 1)',
    'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File ".\\runtime\\serve.ps1"',
    'if errorlevel 1 pause',
    '',
  ].join('\r\n');
}

function launcherPowerShell(){
  return [
    "$ErrorActionPreference='Stop'",
    "$bundleRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))",
    "$webRoot=[IO.Path]::GetFullPath((Join-Path $bundleRoot 'www'))",
    "$webPrefix=$webRoot+[IO.Path]::DirectorySeparatorChar",
    "if(!(Test-Path (Join-Path $webRoot 'index.html'))){throw 'No se encuentra www\\index.html'}",
    "$listener=$null;$port=$null;$nl=[Environment]::NewLine",
    "foreach($candidate in 8769..8799){",
    "  try{$test=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$candidate);$test.Start();$listener=$test;$port=$candidate;break}catch{if($test){try{$test.Stop()}catch{}}}",
    "}",
    "if(!$listener){throw 'No hay un puerto local disponible entre 8769 y 8799.'}",
    "$mime=@{'.html'='text/html; charset=utf-8';'.js'='text/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.json'='application/json; charset=utf-8';'.wasm'='application/wasm';'.png'='image/png';'.jpg'='image/jpeg';'.jpeg'='image/jpeg';'.svg'='image/svg+xml';'.gif'='image/gif';'.webp'='image/webp';'.mp3'='audio/mpeg';'.mp4'='video/mp4';'.p2lrn'='application/vnd.p2lrn+zip';'.zip'='application/zip'}",
    "$url=('http://127.0.0.1:'+ $port +'/index.html')",
    "Write-Host 'P2LRN offline iniciado en' $url",
    "Write-Host 'Cierra esta ventana cuando termines.'",
    "Start-Process $url",
    "try{",
    "  while($true){",
    "    $client=$listener.AcceptTcpClient()",
    "    try{",
    "      $stream=$client.GetStream()",
    "      $reader=[IO.StreamReader]::new($stream,[Text.Encoding]::ASCII,$false,4096,$true)",
    "      $line=$reader.ReadLine()",
    "      if(!$line){continue}",
    "      $parts=$line.Split(' ');$method=$parts[0];$target=$parts[1]",
    "      $hostHeader=''",
    "      while(($header=$reader.ReadLine()) -ne $null -and $header -ne ''){",
    "        if($header -match '^Host:\\s*(.+)$'){$hostHeader=$Matches[1].Trim()}",
    "      }",
    "      if($hostHeader -ne ('127.0.0.1:'+ $port)){",
    "        $body=[Text.Encoding]::UTF8.GetBytes('Forbidden Host')",
    "        $head='HTTP/1.1 403 Forbidden'+$nl+'Content-Length: '+$body.Length+$nl+'Cache-Control: no-store'+$nl+'Connection: close'+$nl+$nl",
    "        $hb=[Text.Encoding]::ASCII.GetBytes($head);$stream.Write($hb,0,$hb.Length);if($method -ne 'HEAD'){$stream.Write($body,0,$body.Length)};continue",
    "      }",
    "      if($method -ne 'GET' -and $method -ne 'HEAD'){",
    "        $body=[Text.Encoding]::UTF8.GetBytes('Method Not Allowed')",
    "        $head='HTTP/1.1 405 Method Not Allowed'+$nl+'Content-Length: '+$body.Length+$nl+'Connection: close'+$nl+$nl",
    "        $hb=[Text.Encoding]::ASCII.GetBytes($head);$stream.Write($hb,0,$hb.Length);if($method -ne 'HEAD'){$stream.Write($body,0,$body.Length)};continue",
    "      }",
    "      try{$uri=[Uri]('http://127.0.0.1:'+ $port + $target);$relative=[Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))}catch{$relative=''}",
    "      if([string]::IsNullOrWhiteSpace($relative)){$relative='index.html'}",
    "      $relative=$relative.Replace('/',[IO.Path]::DirectorySeparatorChar)",
    "      $file=[IO.Path]::GetFullPath((Join-Path $webRoot $relative))",
    "      if(!$file.StartsWith($webPrefix,[StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $file -PathType Leaf)){",
    "        $body=[Text.Encoding]::UTF8.GetBytes('Not Found');$head='HTTP/1.1 404 Not Found'+$nl+'Content-Length: '+$body.Length+$nl+'Connection: close'+$nl+$nl",
    "        $hb=[Text.Encoding]::ASCII.GetBytes($head);$stream.Write($hb,0,$hb.Length);if($method -ne 'HEAD'){$stream.Write($body,0,$body.Length)};continue",
    "      }",
    "      $bytes=[IO.File]::ReadAllBytes($file);$ext=[IO.Path]::GetExtension($file).ToLowerInvariant();$type=if($mime.ContainsKey($ext)){$mime[$ext]}else{'application/octet-stream'}",
    "      $cache=if($relative -match '^player[\\\\/]'){'public, max-age=31536000, immutable'}else{'no-store'}",
    "      $head='HTTP/1.1 200 OK'+$nl+'Content-Type: '+$type+$nl+'Content-Length: '+$bytes.Length+$nl+'Cache-Control: '+$cache+$nl+'X-Content-Type-Options: nosniff'+$nl+'Connection: close'+$nl+$nl",
    "      $hb=[Text.Encoding]::ASCII.GetBytes($head);$stream.Write($hb,0,$hb.Length);if($method -ne 'HEAD'){$stream.Write($bytes,0,$bytes.Length)}",
    "    }catch{Write-Warning $_.Exception.Message}finally{try{$client.Close()}catch{}}",
    "  }",
    "}finally{try{$listener.Stop()}catch{}}",
    '',
  ].join('\r\n');
}

function assignmentHtml(){
  return [
    '<!doctype html>',
    '<html lang="es"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self' blob: data:; connect-src 'self' blob: data:; img-src 'self' blob: data:; media-src 'self' blob: data:; frame-src 'self' blob: data:; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'none'\">",
    '<title>P2LRN · Entrega offline</title>',
    '<link rel="stylesheet" href="./style.css">',
    '</head><body>',
    '<header><div><strong>P2LRN</strong><span>Entrega offline autorreproducible</span></div><div id="clock"></div></header>',
    '<main>',
    '<section class="assignment-card" id="gate"><h1 id="title">Cargando entrega…</h1><div class="provenance" role="note"><strong>Comprueba el origen antes de abrir.</strong><span>Continúa sólo si reconoces al profesor, centro u organización que te ha entregado este curso y esperabas recibirlo. No ejecutes cursos recibidos de origen desconocido.</span></div><p id="policy"></p><div id="participant-wrap" hidden><label>Nombre o identificador del alumno<input id="participant" autocomplete="name" maxlength="160"></label></div><button id="start" type="button" disabled>Comenzar</button><p class="status" id="gate-status" role="status"></p></section>',
    '<section id="session" hidden><div class="session-bar"><div><strong id="session-title"></strong><span id="timer"></span></div><button id="finish" type="button">Finalizar y descargar entrega</button></div><div id="player"></div></section>',
    '<section id="finished" hidden class="assignment-card"><h2>Entrega preparada</h2><p>Se ha descargado un archivo <code>.p2lrn-result</code>. El profesor puede abrirlo directamente en P2LRN Analytics o revisarlo desde Studio.</p><button id="download-again" type="button">Descargar otra vez</button></section>',
    '</main>',
    '<footer>La colaboración y los servicios externos están desactivados en esta entrega. Las fechas offline dependen del reloj del equipo.</footer>',
    '<script src="./player/p2lrn.js"></script><script src="./app.js"></script>',
    '</body></html>',
  ].join('\n');
}

function assignmentCss(){
  return ":root{color-scheme:light;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;color:#18243a;background:#f2f5f9}*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;min-height:100vh;background:radial-gradient(circle at 80% 8%,#e2ecff 0,transparent 34%),#f2f5f9}header{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:20px max(24px,calc((100vw - 1180px)/2));background:#10213d;color:#fff;border-bottom:3px solid #567de6;box-shadow:0 12px 24px #0c193218}header>div:first-child{display:flex;gap:14px;align-items:center;flex-wrap:wrap}header strong{font-size:24px;letter-spacing:-.06em;font-weight:850}header span{color:#c4d4ee;font-size:13px;border-left:1px solid #5d6d87;padding-left:14px}#clock{font-size:13px;color:#cbd7ea}main{width:min(1180px,calc(100% - 36px));margin:40px auto 80px;min-height:60vh}.assignment-card{width:min(100%,730px);margin:7vh auto 0;padding:clamp(24px,4vw,44px);border:1px solid #dce4ef;border-radius:24px;background:white;box-shadow:0 26px 75px #152b5017}.assignment-card:before{content:\"CURSO P2LRN\";display:block;width:fit-content;margin-bottom:18px;background:#eaf0ff;color:#2859ae;border-radius:999px;padding:7px 12px;font-size:11px;font-weight:800;letter-spacing:.12em}h1{font-size:clamp(28px,3.4vw,43px);letter-spacing:-.045em;line-height:1.12;margin:0 0 20px}h2{margin:0 0 14px;font-size:29px;letter-spacing:-.03em}#policy{color:#56647a;line-height:1.8;margin:0 0 24px;padding:16px 18px;background:#f5f8fc;border:1px solid #e5ebf4;border-radius:12px}.provenance{display:grid;gap:6px;margin:0 0 16px;padding:14px 16px;border:1px solid #f1c36d;border-radius:12px;background:#fff8e8;color:#6f4d00}.provenance strong{font-size:14px}.provenance span{font-size:12px;line-height:1.55}.assignment-card label{display:grid;gap:10px;margin:18px 0;font-size:14px;font-weight:750}.assignment-card input{width:100%;min-height:48px;border:1px solid #c6d2e3;border-radius:10px;padding:10px 14px;font:inherit;background:#fff;color:#172741}.assignment-card input:focus-visible,button:focus-visible{outline:3px solid #7da8ff;outline-offset:3px}.assignment-card button,.session-bar button{min-height:48px;border:0;border-radius:10px;padding:0 24px;background:#2563eb;color:white;font:700 14px inherit;cursor:pointer;box-shadow:0 8px 18px #2563eb2b;transition:transform .14s ease,background .14s ease}.assignment-card button:hover:not(:disabled),.session-bar button:hover:not(:disabled){background:#174fcb;transform:translateY(-1px)}button:disabled{opacity:.45;cursor:not-allowed}.status{color:#4a6482;font-size:13px;line-height:1.55;margin:18px 0 0}.status.error{color:#b42318}.session-bar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:0 0 16px;padding:18px 20px;border:1px solid #dce4ef;border-radius:16px;background:white;box-shadow:0 8px 25px #152b500c}.session-bar>div{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.session-bar strong{font-size:18px}#timer{font:700 12px ui-monospace,monospace;color:#4f6480;background:#edf3fd;padding:8px 11px;border-radius:8px}#player{min-height:600px;background:white;border:1px solid #dce4ef;border-radius:16px;overflow:hidden;box-shadow:0 16px 36px #152b5010}footer{max-width:1180px;margin:24px auto;padding:20px 18px 34px;border-top:1px solid #dce4ef;color:#68778c;font-size:12px;line-height:1.7}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}@media(max-width:700px){header{padding:16px 18px;align-items:flex-start}header>div:first-child{display:grid;gap:4px}header span{border:0;padding:0}.session-bar{align-items:stretch;flex-direction:column}.session-bar button{width:100%}main{width:calc(100% - 24px);margin:18px auto 50px}.assignment-card{margin:20px auto 0;padding:23px;border-radius:18px}#player{min-height:480px}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}";
}

function assignmentApp({requireSignature=false}={}){
  return [
    "'use strict';",
    'const SIGNATURE_REQUIRED='+String(requireSignature)+';',
    "const RESULT_SCHEMA='https://p2lrn.org/schema/offline-result/1';",
    "const $=(id)=>document.getElementById(id);",
    "const enc=new TextEncoder();",
    "let assignment=null,adapter=null,player=null,attempt=null,resultCache=null,timerHandle=null,launchInfo=null;",
    "const storageKey=()=> 'p2lrn:offline-assignment:'+assignment.assignmentId;",
    "function canonical(v){if(v===null||typeof v==='boolean'||typeof v==='string')return JSON.stringify(v);if(typeof v==='number')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';throw new Error('Unsupported JSON');}",
    "async function sha(text){const d=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(text)));return 'sha256:'+Array.from(d,b=>b.toString(16).padStart(2,'0')).join('');}",
    "function base64ToBytes(value){return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}",
    "async function verifyAssignment(){if(!assignment.signature)return !SIGNATURE_REQUIRED;const s=assignment.signature;try{if(s.algorithm!=='Ed25519')return false;const keyBytes=base64ToBytes(s.publicKey),sig=base64ToBytes(s.value);const digestBytes=new Uint8Array(await crypto.subtle.digest('SHA-256',keyBytes));const digest='sha256:'+Array.from(digestBytes,b=>b.toString(16).padStart(2,'0')).join('');if(digest!==s.keyFingerprint)return false;const k=await crypto.subtle.importKey('spki',keyBytes,{name:'Ed25519'},false,['verify']);const bare={...assignment};delete bare.signature;return crypto.subtle.verify('Ed25519',k,sig,enc.encode(canonical(bare)));}catch{return false;}}",
    "function blankState(){return{attempts:[],activeAttempt:null,lastWallAt:null,participantLabel:assignment.participant?.label||'',firstOpenedAt:null,lastOpenedAt:null,openCount:0,expiresAt:null,deviceBindingId:null,launches:[]};}",
    "function state(){try{const parsed=JSON.parse(localStorage.getItem(storageKey())||'null');const base=blankState();if(!parsed||typeof parsed!=='object')return base;return{...base,...parsed,attempts:Array.isArray(parsed.attempts)?parsed.attempts:[],launches:Array.isArray(parsed.launches)?parsed.launches:[]};}catch{return blankState();}}",
    "function saveState(s){localStorage.setItem(storageKey(),JSON.stringify(s));}",
    "async function loadNativeLaunchInfo(){try{const response=await fetch('./__p2lrn/launch-state',{cache:'no-store'});if(!response.ok)return null;const value=await response.json();return value&&typeof value==='object'?value:null;}catch{return null;}}",
    "function registerBrowserOpen(){if(launchInfo)return;const s=state(),now=new Date().toISOString();if(!s.firstOpenedAt)s.firstOpenedAt=now;s.lastOpenedAt=now;s.openCount=Math.max(0,Number(s.openCount)||0)+1;if(assignment.policy.expiresAfterFirstOpenDays&&!s.expiresAt)s.expiresAt=new Date(new Date(s.firstOpenedAt).getTime()+assignment.policy.expiresAfterFirstOpenDays*86400000).toISOString();if(!s.deviceBindingId)s.deviceBindingId='browser:'+crypto.randomUUID();s.launches=[...s.launches,{id:crypto.randomUUID(),openedAt:now,source:'browser'}].slice(-256);saveState(s);}",
    "function usageSnapshot(){const s=state(),source=launchInfo||s;return{firstOpenedAt:source.firstOpenedAt||s.firstOpenedAt||null,lastOpenedAt:source.lastOpenedAt||s.lastOpenedAt||null,openCount:Math.max(0,Number(source.openCount??s.openCount)||0),expiresAt:source.expiresAt||s.expiresAt||null,deviceBindingId:source.deviceBindingId||s.deviceBindingId||null,sessions:Array.isArray(source.launches)?source.launches.slice(-256):Array.isArray(s.launches)?s.launches.slice(-256):[]};}",
    "function fmt(iso){return iso?new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(iso)):'Sin límite';}",
    "function humanSeconds(value){const s=Math.max(0,Math.ceil(value));const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),r=s%60;return(h?h+' h ':'')+(m||h?m+' min ':'')+r+' s';}",
    "function anomaly(code,detail=null){attempt.anomalies??=[];if(!attempt.anomalies.some(x=>x.code===code))attempt.anomalies.push({code,observedAt:new Date().toISOString(),detail});}",
    "function policyGate(){const now=Date.now(),p=assignment.policy,u=usageSnapshot();if(p.availableFrom&&now<new Date(p.availableFrom).getTime())return{ok:false,message:'La entrega estará disponible el '+fmt(p.availableFrom)+'.'};if(p.dueAt&&now>new Date(p.dueAt).getTime())return{ok:false,message:'La fecha límite indicada era '+fmt(p.dueAt)+'.'};if(u.expiresAt&&now>=new Date(u.expiresAt).getTime())return{ok:false,message:'Esta entrega caducó el '+fmt(u.expiresAt)+' y ya no se puede iniciar.'};return{ok:true};}",
    "function renderGate(){const s=state(),g=policyGate(),u=usageSnapshot();$('title').textContent=assignment.title||'Entrega P2LRN';const expiry=assignment.policy.expiresAfterFirstOpenDays?(u.expiresAt?'Caduca: '+fmt(u.expiresAt):'Caduca '+assignment.policy.expiresAfterFirstOpenDays+' días después de la primera apertura'):'Sin caducidad por primera apertura';const bits=['Disponible: '+fmt(assignment.policy.availableFrom),'Límite: '+fmt(assignment.policy.dueAt),expiry,assignment.policy.attemptDurationSeconds?'Tiempo por intento: '+humanSeconds(assignment.policy.attemptDurationSeconds):'Sin tiempo máximo','Intentos: '+assignment.policy.maxAttempts,'Aperturas registradas: '+u.openCount];$('policy').textContent=bits.join(' · ');const needsParticipant=!s.participantLabel;$('participant-wrap').hidden=!needsParticipant;if(!needsParticipant)$('participant').value=s.participantLabel;const active=s.activeAttempt&&assignment.policy.allowResume;const used=s.attempts.length;let allowed=g.ok&&(active||used<assignment.policy.maxAttempts);$('start').textContent=active?'Continuar intento':'Comenzar';$('start').disabled=!allowed;$('gate-status').textContent=g.ok?(allowed?'La entrega funciona sin conexión. Las aperturas y la actividad quedan registradas localmente.':'No quedan intentos disponibles.'):g.message;$('gate-status').classList.toggle('error',!g.ok||!allowed);}",
    "function createAttempt(){const s=state();if(!assignment.policy.allowResume&&s.activeAttempt){s.attempts.push({...s.activeAttempt,finishedAt:new Date().toISOString(),status:'abandoned',anomalies:[...(s.activeAttempt.anomalies||[]),{code:'SESSION_RESET',observedAt:new Date().toISOString()}]});s.activeAttempt=null;}if(s.activeAttempt&&assignment.policy.allowResume)return{s,attempt:s.activeAttempt};if(s.attempts.length>=assignment.policy.maxAttempts)throw new Error('No quedan intentos disponibles.');const now=Date.now();const next={id:crypto.randomUUID(),number:s.attempts.length+1,startedAt:new Date(now).toISOString(),startedWallMs:now,lastWallMs:now,anomalies:[]};s.activeAttempt=next;return{s,attempt:next};}",
    "function tick(){if(!attempt)return;const s=state(),now=Date.now();if(Number.isFinite(attempt.lastWallMs)&&now<attempt.lastWallMs-5000)anomaly('CLOCK_ROLLBACK',{previous:attempt.lastWallMs,current:now});if(Number.isFinite(attempt.lastWallMs)&&now>attempt.lastWallMs+10*60*1000)anomaly('CLOCK_JUMP',{previous:attempt.lastWallMs,current:now});attempt.lastWallMs=now;s.activeAttempt=attempt;s.lastWallAt=now;saveState(s);const p=assignment.policy,u=usageSnapshot();let label='Intento '+attempt.number;if(p.attemptDurationSeconds){const elapsed=Math.max(0,(now-attempt.startedWallMs)/1000),remaining=p.attemptDurationSeconds-elapsed;label+=' · '+humanSeconds(remaining);if(remaining<=0){anomaly('ATTEMPT_LIMIT_EXCEEDED');$('finish').textContent='Tiempo agotado · descargar entrega';if(player)player.style.pointerEvents='none';}}if(p.dueAt&&now>new Date(p.dueAt).getTime()){anomaly('DEADLINE_CLOCK_UNTRUSTED');label+=' · fuera de plazo';if(player)player.style.pointerEvents='none';}if(u.expiresAt&&now>=new Date(u.expiresAt).getTime()){anomaly('DELIVERY_EXPIRED');label+=' · entrega caducada';if(player)player.style.pointerEvents='none';}$('timer').textContent=label;$('clock').textContent=new Date(now).toLocaleString();}",
    "async function start(){const gate=policyGate();if(!gate.ok)throw new Error(gate.message);const created=createAttempt(),s=created.s;attempt=created.attempt;const label=String($('participant').value||s.participantLabel||'').trim();if(!label)throw new Error('Indica el nombre o identificador del alumno.');s.participantLabel=label;s.activeAttempt=attempt;saveState(s);$('gate').hidden=true;$('session').hidden=false;$('session-title').textContent=assignment.title||'Entrega P2LRN';const api=await globalThis.P2LRNReady;adapter=api.createOfflineHostAdapter({remote:null,online:()=>false,storageNamespace:assignment.assignmentId+':'+attempt.id});player=await api.mount('#player',{src:'./course.p2lrn',adapter,runtimeBaseUrl:'./player/runtime-host/',activityTracking:assignment.policy.activityTracking});timerHandle=setInterval(tick,1000);tick();}",
    "function latestScore(ops){return [...ops].reverse().find(x=>x.type==='score')?.value??null;}",
    "function answersFromStates(states){const out=[];for(const op of states){const answers=op?.value?.answers;if(!answers||typeof answers!=='object'||Array.isArray(answers))continue;for(const [questionId,answer] of Object.entries(answers))out.push({entityId:op.context?.entityId??null,questionId,answer});}return out;}",
    "function activeMs(events){let best=0;for(const op of events){if(op?.value?.type==='p2lrn:active-time')best=Math.max(best,Number(op.value?.payload?.totalActiveMs)||0);else if(op?.value?.payload&&Number.isFinite(Number(op.value.payload.totalActiveMs)))best=Math.max(best,Number(op.value.payload.totalActiveMs));}return best;}",
    "async function evidenceRoot(records){let root=await sha(assignment.assignmentId+'|'+assignment.contentRoot);for(const record of records)root=await sha(root+'|'+canonical(record));return root;}",
    "function recordOrder(ops){const index={state:0,score:0,event:0};return ops.map(op=>{if(!Object.prototype.hasOwnProperty.call(index,op.type))throw new Error('Operación de seguimiento desconocida: '+String(op.type));return[op.type,index[op.type]++];});}",
    "async function buildResult(){if(player?.stopActivityTracking)player.stopActivityTracking();await new Promise(r=>setTimeout(r,20));const ops=await adapter.pending();const states=ops.filter(x=>x.type==='state'),scores=ops.filter(x=>x.type==='score'),events=ops.filter(x=>x.type==='event');const now=new Date().toISOString();const elapsed=Math.max(0,Math.round((Date.now()-attempt.startedWallMs)/1000));const s=state(),usage=usageSnapshot();attempt.finishedAt=now;attempt.elapsedSeconds=elapsed;attempt.status='submitted';s.attempts.push(attempt);s.activeAttempt=null;saveState(s);const body={schema:RESULT_SCHEMA,version:'1',assignment:{assignmentId:assignment.assignmentId,packageId:assignment.packageId,contentRoot:assignment.contentRoot,title:assignment.title,participantToken:assignment.participant.assignmentToken,participantLabel:s.participantLabel,policy:assignment.policy},assignmentProof:assignment.signature?assignment:null,runtime:{playerVersion:assignment.runtime.playerVersion,runtimeDigest:assignment.runtime.runtimeDigest},attempt:{id:attempt.id,number:attempt.number,startedAt:attempt.startedAt,finishedAt:now,elapsedSeconds:elapsed},usage,summary:{latestScore:latestScore(ops),stateSnapshots:states.length,events:events.length,activeTimeMs:activeMs(events),answers:answersFromStates(states).length,openings:usage.openCount},submission:{states,answers:answersFromStates(states),scores},analytics:{events,activeTimeMs:activeMs(events)},audit:{anomalies:attempt.anomalies||[],recordOrder:recordOrder(ops),evidenceRoot:await evidenceRoot(ops),collaborationDisabled:true,networkPolicy:'deny-by-default'}};const digest=await sha(canonical(body));return{...body,integrity:{algorithm:'sha256',payloadDigest:digest}};}",
    "function downloadResult(result){const blob=new Blob([JSON.stringify(result,null,2)+'\\n'],{type:'application/vnd.p2lrn-result+json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(assignment.filenameBase||'entrega')+'-intento-'+result.attempt.number+'.p2lrn-result';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}",
    "async function finish(){if(timerHandle){clearInterval(timerHandle);timerHandle=null;}$('finish').disabled=true;$('finish').textContent='Preparando entrega…';resultCache=await buildResult();downloadResult(resultCache);$('session').hidden=true;$('finished').hidden=false;}",
    "async function boot(){try{assignment=await fetch('./assignment.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('No se puede leer assignment.json');return r.json();});if(!(await verifyAssignment()))throw new Error('La firma del encargo no es válida. Solicita una nueva entrega al profesor.');launchInfo=await loadNativeLaunchInfo();if(!launchInfo)registerBrowserOpen();renderGate();$('start').addEventListener('click',()=>start().catch(e=>{$('gate-status').textContent=e.message;$('gate-status').classList.add('error')}));$('finish').addEventListener('click',()=>finish().catch(e=>{$('finish').disabled=false;$('finish').textContent='Finalizar y descargar entrega';alert(e.message)}));$('download-again').addEventListener('click',()=>{if(resultCache)downloadResult(resultCache)});setInterval(()=>{$('clock').textContent=new Date().toLocaleString()},1000);setInterval(()=>fetch('./index.html',{cache:'no-store'}).catch(()=>{}),60000);}catch(error){$('title').textContent='No se puede abrir la entrega';$('gate-status').textContent=String(error?.message||error);$('gate-status').classList.add('error');}}",
    "boot();",
    '',
  ].join('\n');
}

function base64Lines(bytes,{lineLength=120}={}){
  const view=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  const chunkSize=3*16384;
  let encoded='';
  for(let offset=0;offset<view.length;offset+=chunkSize){
    const chunk=view.subarray(offset,Math.min(view.length,offset+chunkSize));
    let binary='';
    for(let i=0;i<chunk.length;i+=8192)binary+=String.fromCharCode(...chunk.subarray(i,Math.min(chunk.length,i+8192)));
    encoded+=btoa(binary);
  }
  const lines=[];
  for(let i=0;i<encoded.length;i+=lineLength)lines.push(encoded.slice(i,i+lineLength));
  return lines;
}

async function windowsSingleFileLauncher(zipBytes,filenameBase){
  const digest=await sha256Bytes(zipBytes);
  const expected=digest.slice('sha256:'.length);
  const payload=base64Lines(zipBytes);
  const ps="$ErrorActionPreference='Stop';$self=$env:P2LRN_SELF;$lines=Get-Content -LiteralPath $self -Encoding ASCII;$marker=[Array]::IndexOf($lines,'__P2LRN_PAYLOAD__');if($marker -lt 0){throw 'Payload P2LRN no encontrado.'};$b64=($lines[($marker+1)..($lines.Length-1)] -join '');$bytes=[Convert]::FromBase64String($b64);$sha=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($bytes)).Replace('-','').ToLowerInvariant();if($sha -ne '"+expected+"'){throw 'El paquete P2LRN ha sido modificado o esta corrupto.'};$root=Join-Path $env:LOCALAPPDATA ('P2LRN\\Offline\\'+$sha);$ready=Join-Path $root 'ready.ok';if(!(Test-Path $ready)){if(Test-Path $root){Remove-Item $root -Recurse -Force};New-Item -ItemType Directory -Path $root -Force|Out-Null;$zip=Join-Path $root 'bundle.zip';[IO.File]::WriteAllBytes($zip,$bytes);Expand-Archive -LiteralPath $zip -DestinationPath $root -Force;Remove-Item $zip -Force;Set-Content -LiteralPath $ready -Value $sha -Encoding ASCII};$serve=Join-Path $root 'runtime\\serve.ps1';if(!(Test-Path $serve)){throw 'Runtime offline no encontrado.'};& $serve";
  const preamble=[
    '@echo off',
    'setlocal',
    'set "P2LRN_SELF=%~f0"',
    'title P2LRN - Entrega offline',
    'where powershell.exe >nul 2>&1 || (echo PowerShell no esta disponible en este equipo. & pause & exit /b 1)',
    'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "'+ps.replaceAll('"','\\"')+'"',
    'set "P2LRN_EXIT=%ERRORLEVEL%"',
    'if not "%P2LRN_EXIT%"=="0" pause',
    'exit /b %P2LRN_EXIT%',
    '__P2LRN_PAYLOAD__',
    ...payload,
    '',
  ].join('\r\n');
  return Object.freeze({
    filename:cleanFilename(filenameBase,'entrega-p2lrn')+'.p2lrn-offline.cmd',
    bytes:textBytes(preamble),
    payloadDigest:digest,
  });
}
// A Windows PE launcher is built once from the audited Go source. Studio
// appends a ZIP payload and a fixed trailer; it does not need PowerShell.
// SHA-256 checks corruption, not publisher identity or student authorship.
export async function buildWindowsOfflineExecutable(zipBytes,baseExeBytes,filenameBase='entrega-p2lrn'){
  const zip=zipBytes instanceof Uint8Array?zipBytes:new Uint8Array(zipBytes);
  const exe=baseExeBytes instanceof Uint8Array?baseExeBytes:new Uint8Array(baseExeBytes);
  if(exe.length<4096||exe.length>64*1024*1024||zip.length<22||zip.length>512*1024*1024)
    throw new Error('Tamaño no válido para la entrega EXE.');
  const view=new DataView(exe.buffer,exe.byteOffset,exe.byteLength);
  if(exe[0]!==77||exe[1]!==90||exe.length<64)throw new Error('Lanzador Windows no válido: cabecera MZ.');
  const peOffset=view.getUint32(60,true);
  if(peOffset<64||peOffset+24>exe.length||view.getUint32(peOffset,true)!==0x00004550
    ||view.getUint16(peOffset+4,true)!==0x8664)
    throw new Error('La plantilla no es un ejecutable PE de Windows x64.');
  const end=exe.length+zip.length,bytes=new Uint8Array(end+56);
  bytes.set(exe);bytes.set(zip,exe.length);
  bytes.set(encoder.encode('P2LRN-EXE-V1'),end); // remaining four magic bytes remain zero
  new DataView(bytes.buffer).setBigUint64(end+16,BigInt(zip.length),true);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',zip));
  bytes.set(digest,end+24);
  return Object.freeze({
    filename:cleanFilename(filenameBase,'entrega-p2lrn')+'.p2lrn-offline.exe',
    bytes,
    payloadDigest:await sha256Bytes(zip),
    publisherSigned:false,
  });
}

function readmeText(assignment){
  return [
    'P2LRN · Entrega offline autorreproducible','',
    '1. Extrae esta carpeta/ZIP completa.',
    '2. Haz doble clic en "Abrir P2LRN.cmd".',
    '3. El navegador se abrirá en 127.0.0.1. No necesita Internet.',
    '4. Completa la actividad.',
    '5. Pulsa "Finalizar y descargar entrega".',
    '6. Envía al profesor el archivo .p2lrn-result descargado.','',
    'Colaboración: desactivada.',
    'Red: denegada por diseño del runtime offline; el servidor sólo escucha en 127.0.0.1.',
    'Métricas de actividad: '+(assignment.policy.activityTracking?'activadas':'desactivadas')+'.',
    'Disponible desde: '+(assignment.policy.availableFrom??'sin fecha')+'.',
    'Fecha límite: '+(assignment.policy.dueAt??'sin fecha')+'.',
    'Tiempo máximo: '+(assignment.policy.attemptDurationSeconds?assignment.policy.attemptDurationSeconds+' segundos':'sin límite')+'.',
    'Intentos máximos: '+assignment.policy.maxAttempts+'.',
    'Caducidad desde la primera apertura: '+(assignment.policy.expiresAfterFirstOpenDays?assignment.policy.expiresAfterFirstOpenDays+' días':'sin límite')+'.','',
    'SEGURIDAD: abre esta entrega sólo si conoces quién te la ha enviado y esperabas recibir este curso. No ejecutes archivos de origen desconocido.','',
    'La entrega registra aperturas y sesiones en este dispositivo. En modo totalmente offline, la fecha/hora depende del reloj del equipo y no puede impedir por sí sola una copia realizada antes de la primera apertura.','',
  ].join('\r\n');
}

export async function exportOfflineAssignmentBundle(document,options={}){
  if(!document?.manifest||!document?.graph)throw new TypeError('Studio document is required.');
  const policy=normalizeOfflineAssignmentPolicy(options);
  const compatibility=inspectOfflineAssignmentCompatibility(document);
  if(!compatibility.ok){
    const error=new Error('El curso no es autocontenido para entrega offline: '+compatibility.issues.map((item)=>item.code).join(', '));
    error.code='P2LRN_OFFLINE_EXPORT_INCOMPATIBLE';error.issues=compatibility.issues;throw error;
  }
  const course=await (options.packageExporter??exportP2LRNPackage)(document);
  const courseBytes=assertCompleteCourseZip(course?.bytes);
  if(!course?.manifest?.packageId||!/^sha256:[0-9a-f]{64}$/i.test(String(course?.manifest?.integrity?.contentRoot??''))){
    const error=new Error('El paquete P2LRN exportado no contiene una identidad/integridad válida.');
    error.code='P2LRN_OFFLINE_INVALID_COURSE';
    throw error;
  }
  const runtimeBaseUrl=detectPlayerRuntimeBaseUrl({runtimeBaseUrl:options.runtimeBaseUrl,documentObject:options.documentObject});
  const runtime=await collectRuntime(runtimeBaseUrl,options.fetchImpl??globalThis.fetch.bind(globalThis));
  const title=typeof document.title==='function'?document.title(document.rootId):'Entrega P2LRN';
  const filenameBase=cleanFilename(options.filenameBase??course.filename,'entrega-p2lrn');
  let assignment={
    schema:OFFLINE_ASSIGNMENT_SCHEMA,version:OFFLINE_ASSIGNMENT_VERSION,assignmentId:'urn:uuid:'+crypto.randomUUID(),
    packageId:course.manifest.packageId,contentRoot:course.manifest.integrity.contentRoot,title:String(options.title??title??'Entrega P2LRN'),filenameBase,createdAt:new Date().toISOString(),
    runtime:{playerVersion:String(runtime.release.webSdkVersion),toolkitVersion:String(runtime.release.toolkitVersion??''),runtimeDigest:await sha256Bytes(runtime.releaseBytes)},
    policy,participant:{assignmentToken:crypto.randomUUID(),label:String(options.participantLabel??'').trim()||null},
  };
  if(options.signAssignment===true)assignment=await signOfflineAssignment(assignment);
  const teacherReceipt=assignment.signature?Object.freeze({
    filename:filenameBase+'.p2lrn-assignment.json',
    bytes:jsonBytes({schema:OFFLINE_TEACHER_RECEIPT_SCHEMA,version:'1',assignment}),
  }):null;
  const entries=[
    {path:'Abrir P2LRN.cmd',data:textBytes(launcherCmd())},{path:'LEEME.txt',data:textBytes(readmeText(assignment))},{path:'runtime/serve.ps1',data:textBytes(launcherPowerShell())},
    {path:'www/index.html',data:encoder.encode(assignmentHtml())},{path:'www/style.css',data:encoder.encode(assignmentCss())},{path:'www/app.js',data:encoder.encode(assignmentApp({requireSignature:Boolean(assignment.signature)}))},
    {path:'www/assignment.json',data:jsonBytes(assignment)},{path:'www/course.p2lrn',data:courseBytes},...runtime.entries,
  ];
  const bytes=writeStoredZip(entries);
  const windowsLauncher=await windowsSingleFileLauncher(bytes,filenameBase);
  const windowsExecutable=options.windowsExecutableBytes
    ?await buildWindowsOfflineExecutable(bytes,options.windowsExecutableBytes,filenameBase):null;
  return Object.freeze({
    bytes,
    filename:filenameBase+'.p2lrn-offline.zip',
    windowsLauncher,
    windowsExecutable,
    assignment:Object.freeze(clone(assignment)),
    teacherReceipt,
    course,
    runtimeRelease:clone(runtime.release),
  });
}

export async function parseOfflineAssignmentResult(value,{expectedContentRoot=null,expectedAssignmentId=null,trustedReceipt=null}={}){
  let result;
  if(typeof value==='string')result=JSON.parse(value);
  else if(value instanceof Uint8Array||value instanceof ArrayBuffer)result=JSON.parse(decoder.decode(value instanceof Uint8Array?value:new Uint8Array(value)));
  else result=clone(value);
  if(!result||result.schema!==OFFLINE_RESULT_SCHEMA||result.version!=='1')
    throw new Error('El archivo no es una entrega offline P2LRN compatible.');
  const body=clone(result);delete body.integrity;
  const calculated=await sha256Json(body),declared=String(result.integrity?.payloadDigest??'').toLowerCase();
  const integrityValid=/^sha256:[0-9a-f]{64}$/.test(declared)&&declared===calculated.toLowerCase();
  const contentRoot=String(result.assignment?.contentRoot??''),assignmentId=String(result.assignment?.assignmentId??'');
  const courseMatches=expectedContentRoot==null||String(expectedContentRoot)===contentRoot;
  const assignmentMatches=expectedAssignmentId==null||String(expectedAssignmentId)===assignmentId;
  const proof=result.assignmentProof;
  const signatureValid=proof?.signature?await verifyOfflineAssignmentSignature(proof):null;
  let proofMatchesResult=null;
  if(proof?.signature){
    try{
      proofMatchesResult=proof.assignmentId===assignmentId && proof.packageId===result.assignment?.packageId &&
        proof.contentRoot===contentRoot && proof.participant?.assignmentToken===result.assignment?.participantToken &&
        canonicalize(proof.policy)===canonicalize(result.assignment?.policy) &&
        proof.runtime?.runtimeDigest===result.runtime?.runtimeDigest;
    }catch{proofMatchesResult=false;}
  }
  let receiptMatches=null;
  if(trustedReceipt!=null){
    let receipt=trustedReceipt;
    if(typeof receipt==='string')receipt=JSON.parse(receipt);
    else if(receipt instanceof Uint8Array||receipt instanceof ArrayBuffer)
      receipt=JSON.parse(decoder.decode(receipt instanceof Uint8Array?receipt:new Uint8Array(receipt)));
    receiptMatches=receipt?.schema===OFFLINE_TEACHER_RECEIPT_SCHEMA && receipt.version==='1' &&
      Boolean(proof?.signature) && canonicalize(receipt.assignment)===canonicalize(proof);
  }
  // This authenticates the original teacher's assignment, NOT the learner's
  // execution, score or answers on a machine the learner controls.
  const assignmentAuthenticated=receiptMatches==null?null:
    receiptMatches===true && signatureValid===true && proofMatchesResult===true && courseMatches && assignmentMatches;
  const evidenceValid=await verifyResultEvidence(result);
  const summaryValid=verifyResultSummary(result);
  const answers=Array.isArray(result.submission?.answers)?result.submission.answers:[],
    scores=Array.isArray(result.submission?.scores)?result.submission.scores:[],
    events=Array.isArray(result.analytics?.events)?result.analytics.events:[],
    anomalies=Array.isArray(result.audit?.anomalies)?result.audit.anomalies:[];
  return Object.freeze({
    result:Object.freeze(result),integrityValid,courseMatches,assignmentMatches,calculatedDigest:calculated,
    signatureValid,proofMatchesResult,receiptMatches,assignmentAuthenticated,evidenceValid,summaryValid,
    summary:Object.freeze({
      participantLabel:result.assignment?.participantLabel??null,attemptNumber:Number(result.attempt?.number)||null,
      elapsedSeconds:Number(result.attempt?.elapsedSeconds)||0,activeTimeMs:Number(result.analytics?.activeTimeMs)||0,
      openings:Math.max(0,Number(result.usage?.openCount??result.summary?.openings)||0),
      firstOpenedAt:result.usage?.firstOpenedAt??null,lastOpenedAt:result.usage?.lastOpenedAt??null,
      expiresAt:result.usage?.expiresAt??null,deviceBindingId:result.usage?.deviceBindingId??null,
      sessions:Object.freeze(Array.isArray(result.usage?.sessions)?clone(result.usage.sessions):[]),
      latestScore:result.summary?.latestScore??null,answers:Object.freeze(answers),scores:Object.freeze(scores),
      events:Object.freeze(events),anomalies:Object.freeze(anomalies),
    }),
  });
}
