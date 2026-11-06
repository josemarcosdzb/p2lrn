import {startH5PRuntime} from './h5p-runtime-shell.js';
const MAX_FILES = 10000;
const MAX_BYTES = 512 * 1024 * 1024;
// Use a computed runtime asset path: Next.js/Turbopack resolves literal directory URLs
// as build-time imports even when the second argument is an intermediate variable.
const runtimePath = ['.', 'runtime-host', ''].join('/');
const DEFAULT_BASE_URL = new URL(runtimePath, import.meta.url).href;
const decoder = new TextDecoder('utf-8', {fatal:false});

function dependencyKey(dep) {
  const name=String(dep?.machineName??'').trim();
  const major=Number(dep?.majorVersion);
  const minor=Number(dep?.minorVersion);
  return name&&Number.isInteger(major)&&Number.isInteger(minor)?`${name}-${major}.${minor}`:null;
}
function dependencyList(value) {
  return Array.isArray(value)?value.map((entry)=>({machineName:String(entry?.machineName??''),majorVersion:Number(entry?.majorVersion),minorVersion:Number(entry?.minorVersion)})).filter((entry)=>dependencyKey(entry)):[];
}
function contentDependencies(content) {
  const out=new Map();
  const stack=[content];
  while(stack.length){
    const value=stack.pop();
    if(Array.isArray(value)){for(const item of value)stack.push(item);continue;}
    if(!value||typeof value!=='object')continue;
    for(const [key,child] of Object.entries(value)){
      if(key==='library'&&typeof child==='string'){
        const match=/^(.+?)\s+(\d+)\.(\d+)$/u.exec(child.trim());
        if(match){const dep={machineName:match[1],majorVersion:Number(match[2]),minorVersion:Number(match[3])};out.set(dependencyKey(dep),dep);}
      }
      stack.push(child);
    }
  }
  return [...out.values()];
}
function mediaType(path) {
  const clean=String(path).split(/[?#]/,1)[0].toLowerCase();
  const ext=clean.includes('.')?clean.slice(clean.lastIndexOf('.')):'';
  return ({
    '.json':'application/json; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8',
    '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp',
    '.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.mp4':'video/mp4','.webm':'video/webm',
    '.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.eot':'application/vnd.ms-fontobject',
  })[ext]??'application/octet-stream';
}
function safeRelative(value) {
  const path=String(value??'').replace(/\\/g,'/').replace(/^\.\//u,'');
  if(!path||path.startsWith('/')||path.includes('\0'))throw new Error(`Invalid H5P library path: ${path}`);
  if(path.split('/').some((part)=>!part||part==='.'||part==='..'))throw new Error(`Unsafe H5P library path: ${path}`);
  return path;
}
function parseJson(bytes,label){try{return JSON.parse(decoder.decode(bytes));}catch(error){throw new Error(`Invalid JSON in ${label}: ${error?.message??String(error)}`);}}
function runtimeLimitError(message){const error=new Error(message);error.code='P2LRN_H5P_RUNTIME_TOO_LARGE';return error;}

export function getAutomaticH5PRuntimeResources(baseUrl=DEFAULT_BASE_URL) {
  let base;
  try{base=new URL(String(baseUrl||DEFAULT_BASE_URL),globalThis.location?.href??DEFAULT_BASE_URL);}catch{base=new URL(DEFAULT_BASE_URL);}
  if(!base.pathname.endsWith('/'))base.pathname+='/';
  const staticBase=/\/runtime-host\/$/u.test(base.pathname)?base:new URL(DEFAULT_BASE_URL);
  return Object.freeze({
    baseUrl:staticBase.href,
    hostScriptUrl:new URL('h5p-host.js',staticBase).href,
    runtimeAssetsUrl:new URL('assets/',staticBase).href,
    sharedLibrariesUrl:new URL('h5p-libraries/',staticBase).href,
  });
}

export function createOpaqueH5PRuntimeDocument() {
  const bootstrap = `(${startH5PRuntime.toString()})();`.replace(/<\/script/giu, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline' blob:; img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src 'none'; frame-src about: blob: data:; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><title>P2LRN H5P Runtime</title><style>html,body,#h5p-stage{width:100%;min-height:100%;margin:0;padding:0}#h5p-error{font:14px system-ui,sans-serif;color:#7a1f1f;padding:16px;white-space:pre-wrap}</style></head><body><div id="h5p-stage"></div><div id="h5p-error" hidden></div><script>${bootstrap}</script></body></html>`;
}

async function readBundledMetadata(nested, names) {
  const out=new Map();
  for(const path of names){
    const match=/^([^/]+)\/library\.json$/u.exec(String(path));
    if(!match)continue;
    const bytes=await nested.read(path);
    const metadata=parseJson(bytes,path);
    const key=dependencyKey(metadata);
    if(key)out.set(key,{source:'bundle',folder:match[1],metadata,key});
  }
  return out;
}

async function fetchJson(fetchImpl,url,label){
  let response;
  try{response=await fetchImpl(url,{credentials:'omit',cache:'no-store'});}catch(error){const failure=new Error(`Unable to load ${label}: ${error?.message??String(error)}`);failure.code='P2LRN_H5P_SHARED_LIBRARIES_UNAVAILABLE';throw failure;}
  if(!response?.ok){const failure=new Error(`Unable to load ${label}: HTTP ${response?.status??'unknown'}`);failure.code='P2LRN_H5P_SHARED_LIBRARIES_UNAVAILABLE';throw failure;}
  try{return await response.json();}catch(error){const failure=new Error(`Invalid ${label}: ${error?.message??String(error)}`);failure.code='P2LRN_H5P_SHARED_LIBRARIES_UNAVAILABLE';throw failure;}
}

async function mapLimit(items,limit,worker){
  const out=new Array(items.length);let next=0;
  const runners=Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const index=next++;if(index>=items.length)return;out[index]=await worker(items[index],index);}});
  await Promise.all(runners);return out;
}

export async function hydrateH5PRuntimeCore({session,runtimeAssetsUrl,fetchImpl=globalThis.fetch}) {
  if(!session||!Array.isArray(session.files)||!Array.isArray(session.transfers))throw new TypeError('Invalid H5P static session.');
  if(typeof fetchImpl!=='function')throw new TypeError('H5P runtime-core hydration requires fetch.');
  const base=new URL(String(runtimeAssetsUrl));
  const cssUrl=new URL('styles/h5p.css',base);
  const scriptUrl=new URL('frame.bundle.js',base);
  const fetchBytes=async(url,label)=>{
    let response;
    try{response=await fetchImpl(url,{credentials:'omit',cache:'no-store'});}catch(error){const failure=new Error(`Unable to load ${label}: ${error?.message??String(error)}`);failure.code='P2LRN_H5P_RUNTIME_ASSET_UNAVAILABLE';throw failure;}
    if(!response?.ok){const failure=new Error(`Unable to load ${label}: HTTP ${response?.status??'unknown'}`);failure.code='P2LRN_H5P_RUNTIME_ASSET_UNAVAILABLE';throw failure;}
    return response.arrayBuffer();
  };
  const cssBuffer=await fetchBytes(cssUrl.href,'H5P core stylesheet');
  const cssText=decoder.decode(new Uint8Array(cssBuffer));
  const refs=[];
  for(const match of cssText.matchAll(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/giu)){
    const raw=String(match[2]??'').trim();
    if(!raw||/^(?:data:|blob:|https?:|\/\/|#)/iu.test(raw))continue;
    const resolved=new URL(raw,cssUrl);
    const rel=resolved.pathname.includes('/fonts/')?'fonts/'+resolved.pathname.split('/fonts/')[1]:null;
    if(rel&&!refs.some((item)=>item.rel===rel))refs.push({rel,url:resolved.href});
  }
  const scriptBuffer=await fetchBytes(scriptUrl.href,'H5P core script');
  const fontBuffers=await mapLimit(refs,8,async(item)=>({...item,buffer:await fetchBytes(item.url,`H5P core asset ${item.rel}`)}));
  const additions=[
    {path:'__p2lrn_runtime__/frame.bundle.js',mediaType:'text/javascript',buffer:scriptBuffer},
    {path:'__p2lrn_runtime__/styles/h5p.css',mediaType:'text/css',buffer:cssBuffer},
    ...fontBuffers.map((item)=>({path:`__p2lrn_runtime__/${item.rel}`,mediaType:mediaType(item.rel),buffer:item.buffer})),
  ];
  const existing=new Set(session.files.map((file)=>String(file.path)));
  let total=Number(session.totalBytes??0);
  for(const item of additions){
    if(existing.has(item.path))continue;
    total+=item.buffer.byteLength;
    if(total>MAX_BYTES)throw runtimeLimitError(`H5P runtime payload exceeds ${MAX_BYTES} bytes.`);
    existing.add(item.path);
    session.files.push(item);
    session.transfers.push(item.buffer);
  }
  session.totalBytes=total;
  return session;
}

export async function hydrateH5PStaticSession({session,nested,inspection,sharedLibrariesUrl,fetchImpl=globalThis.fetch}) {
  if(!session||!Array.isArray(session.files)||!Array.isArray(session.transfers))throw new TypeError('Invalid H5P static session.');
  if(typeof fetchImpl!=='function')throw new TypeError('H5P shared-library hydration requires fetch.');
  const initial=[...(inspection?.required??[]),...contentDependencies(inspection?.content??null)];
  if(!initial.length)return session;
  const bundled=await readBundledMetadata(nested,inspection?.names??nested?.names?.()??[]);
  const existing=new Set(session.files.map((file)=>String(file.path)));
  const needsShared=initial.some((dep)=>!bundled.has(dependencyKey(dep)));
  if(!needsShared){
    const queue=[...initial],seen=new Set();
    while(queue.length){const dep=queue.shift();const key=dependencyKey(dep);if(!key||seen.has(key))continue;seen.add(key);const found=bundled.get(key);if(!found)return hydrateH5PStaticSession({session,nested,inspection:{...inspection,required:[dep]},sharedLibrariesUrl,fetchImpl});for(const child of dependencyList(found.metadata?.preloadedDependencies))queue.push(child);}
    return session;
  }
  const base=new URL(String(sharedLibrariesUrl));
  const catalog=await fetchJson(fetchImpl,new URL('index.json',base).href,'H5P shared-library catalog');
  const entries=Array.isArray(catalog?.libraries)?catalog.libraries:[];
  const byKey=new Map(entries.map((entry)=>[dependencyKey(entry),entry]).filter(([key])=>key));
  const queue=[...initial],seen=new Set(),shared=new Map();
  while(queue.length){
    const dep=queue.shift();const key=dependencyKey(dep);if(!key||seen.has(key))continue;seen.add(key);
    const local=bundled.get(key);
    if(local){for(const child of dependencyList(local.metadata?.preloadedDependencies))queue.push(child);continue;}
    const entry=byKey.get(key);
    if(!entry){const error=new Error(`Missing H5P library for automatic runtime: ${key}`);error.code='P2LRN_H5P_LIBRARIES_MISSING';throw error;}
    if(!Array.isArray(entry.files)||!entry.files.length){const error=new Error(`H5P library catalog does not expose files for ${key}. Rebuild or update @p2lrn/h5p-libraries.`);error.code='P2LRN_H5P_LIBRARY_CATALOG_INCOMPLETE';throw error;}
    const folder=safeRelative(entry.folder);
    const metadata=await fetchJson(fetchImpl,new URL(`${encodeURIComponent(folder)}/library.json`,base).href,`${key} library.json`);
    shared.set(key,{entry:{...entry,folder},metadata});
    for(const child of dependencyList(metadata?.preloadedDependencies))queue.push(child);
  }
  const additions=[];
  for(const {entry} of shared.values())for(const relRaw of entry.files){const rel=safeRelative(relRaw);const path=`${entry.folder}/${rel}`;if(existing.has(path))continue;existing.add(path);additions.push({path,url:new URL(`${encodeURIComponent(entry.folder)}/${rel.split('/').map(encodeURIComponent).join('/')}`,base).href});}
  if(existing.size>MAX_FILES)throw runtimeLimitError(`H5P runtime contains too many files (${existing.size}).`);
  const fetched=await mapLimit(additions,12,async(item)=>{
    let response;try{response=await fetchImpl(item.url,{credentials:'omit',cache:'no-store'});}catch(error){const failure=new Error(`Unable to load H5P library asset ${item.path}: ${error?.message??String(error)}`);failure.code='P2LRN_H5P_SHARED_LIBRARIES_UNAVAILABLE';throw failure;}
    if(!response?.ok){const failure=new Error(`Unable to load H5P library asset ${item.path}: HTTP ${response?.status??'unknown'}`);failure.code='P2LRN_H5P_SHARED_LIBRARIES_UNAVAILABLE';throw failure;}
    const buffer=await response.arrayBuffer();return {...item,buffer};
  });
  let total=Number(session.totalBytes??0);
  for(const item of fetched){total+=item.buffer.byteLength;if(total>MAX_BYTES)throw runtimeLimitError(`H5P runtime payload exceeds ${MAX_BYTES} bytes.`);session.files.push({path:item.path,mediaType:mediaType(item.path),buffer:item.buffer});session.transfers.push(item.buffer);}
  session.totalBytes=total;
  return session;
}

export const H5P_AUTOMATIC_RUNTIME_DEFAULT_BASE_URL=DEFAULT_BASE_URL;
