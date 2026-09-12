import {createHash, randomBytes} from 'node:crypto';
import {readFileSync, readdirSync, realpathSync, statSync} from 'node:fs';
import {basename, extname, join, resolve, sep} from 'node:path';

const MAGIC = 0x50324835;
const DEFAULT_MAX_FILES = 10000;
const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;
const DEFAULT_TTL_MS = 60 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 32;
const DEFAULT_MAX_SESSION_BYTES_TOTAL = 1024 * 1024 * 1024;

function safePath(value) {
  const text = String(value ?? '').replace(/\\/g, '/');
  if (!text || text.startsWith('/') || text.includes('\0')) throw new Error('Invalid H5P session path.');
  const parts = text.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error(`Unsafe H5P path: ${text}`);
  return parts.join('/');
}
function parseJson(buffer, label) {
  try { return JSON.parse(Buffer.from(buffer).toString('utf8')); }
  catch (error) { throw new Error(`Invalid JSON in ${label}: ${error?.message ?? String(error)}`); }
}
function dependencyKey(dep) {
  if (!dep?.machineName) return null;
  const major = Number(dep.majorVersion);
  const minor = Number(dep.minorVersion);
  return Number.isInteger(major) && Number.isInteger(minor) ? `${dep.machineName}-${major}.${minor}` : String(dep.machineName);
}
function dependencyList(value,label='dependencies') {
  if(value==null)return [];
  if(!Array.isArray(value))throw new Error(`H5P ${label} must be an array.`);
  return value.map((entry,index)=>{if(!entry||typeof entry!=='object'||typeof entry.machineName!=='string'||!entry.machineName.trim())throw new Error(`H5P ${label}[${index}] requires machineName.`);const majorVersion=Number(entry.majorVersion);const minorVersion=Number(entry.minorVersion);if(!Number.isInteger(majorVersion)||!Number.isInteger(minorVersion)||majorVersion<0||minorVersion<0)throw new Error(`H5P ${label}[${index}] requires non-negative integer majorVersion/minorVersion.`);return {machineName:String(entry.machineName),majorVersion,minorVersion};});
}
function mediaType(path) {
  const ext = extname(path).toLowerCase();
  return ({'.json':'application/json; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.mp4':'video/mp4','.webm':'video/webm','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf'})[ext] ?? 'application/octet-stream';
}
function under(root, path) {
  const lexicalRoot = resolve(root);
  const value = resolve(lexicalRoot, path);
  const lexicalBase = lexicalRoot + sep;
  if (value !== lexicalRoot && !value.startsWith(lexicalBase)) throw new Error('Resolved H5P library path escapes configured root.');
  const realRoot = realpathSync(lexicalRoot);
  const realValue = realpathSync(value);
  const realBase = realRoot + sep;
  if (realValue !== realRoot && !realValue.startsWith(realBase)) throw new Error('Resolved H5P library path escapes configured root through a symbolic link.');
  return realValue;
}

function parseSessionPayload(buffer, {maxFiles=DEFAULT_MAX_FILES,maxBytes=DEFAULT_MAX_BYTES}={}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) throw new Error('Truncated H5P session payload.');
  if (buffer.readUInt32BE(0) !== MAGIC) throw new Error('Invalid H5P session magic.');
  const manifestBytes = buffer.readUInt32BE(4);
  if (manifestBytes < 2 || manifestBytes > 8 * 1024 * 1024 || 8 + manifestBytes > buffer.length) throw new Error('Invalid H5P session manifest length.');
  const manifest = parseJson(buffer.subarray(8, 8 + manifestBytes), 'P2RLN H5P session manifest');
  if (manifest?.protocol !== 'p2rln-h5p-session/1' || !Array.isArray(manifest.files)) throw new Error('Unsupported H5P session protocol.');
  if (manifest.files.length > maxFiles) throw new Error(`H5P session contains too many files (${manifest.files.length}).`);
  const data = buffer.subarray(8 + manifestBytes);
  if (data.length > maxBytes) throw new Error(`H5P session exceeds ${maxBytes} bytes.`);
  const files = new Map();
  let covered = 0;
  const intervals = [];
  for (const descriptor of manifest.files) {
    const path = safePath(descriptor?.path);
    const offset = Number(descriptor?.offset);
    const length = Number(descriptor?.length);
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > data.length) throw new Error(`Invalid H5P file range: ${path}`);
    if (files.has(path)) throw new Error(`Duplicate H5P file path: ${path}`);
    intervals.push([offset, offset + length, path]);
    files.set(path, data.subarray(offset, offset + length));
    covered += length;
  }
  intervals.sort((a,b)=>a[0]-b[0]);
  let cursor = 0;
  for (const [start,end,path] of intervals) {
    if (start !== cursor) throw new Error(`Non-canonical H5P payload ranges near ${path}.`);
    cursor = end;
  }
  if (cursor !== data.length || covered !== data.length) throw new Error('H5P session payload contains trailing or overlapping bytes.');
  return {manifest,files,totalBytes:data.length};
}

function inspectBundledLibraries(files) {
  const byKey = new Map();
  const byName = new Map();
  for (const [path, bytes] of files) {
    const match = /^([^/]+)\/library\.json$/i.exec(path);
    if (!match) continue;
    const metadata = parseJson(bytes, path);
    const major=Number(metadata?.majorVersion);const minor=Number(metadata?.minorVersion);
    if(!metadata?.machineName||!Number.isInteger(major)||!Number.isInteger(minor)||major<0||minor<0)throw new Error(`Invalid H5P library metadata: ${path}`);
    const descriptor = {folder:match[1], metadata};
    byKey.set(`${metadata.machineName}-${major}.${minor}`, descriptor);
    if (!byName.has(String(metadata.machineName))) byName.set(String(metadata.machineName), descriptor);
  }
  return {byKey,byName};
}

function scanSharedLibraries(directory) {
  const byKey = new Map();
  const byName = new Map();
  const byAlias = new Map();
  if (!directory) return {root:null,byKey,byName,byAlias};
  const root = resolve(directory);
  let entries=[];
  try { entries=readdirSync(root,{withFileTypes:true}); } catch { return {root,byKey,byName,byAlias}; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folder = entry.name;
    let file;
    let libraryRoot;
    let metadata;
    try {
      libraryRoot=under(root,folder);
      file=under(libraryRoot,'library.json');
      metadata=JSON.parse(readFileSync(file,'utf8'));
    } catch { continue; }
    if (!metadata?.machineName) continue;
    const descriptor={folder,metadata,path:libraryRoot};
    const key=`${metadata.machineName}-${Number(metadata.majorVersion)}.${Number(metadata.minorVersion)}`;
    byKey.set(key,descriptor); if(!byName.has(String(metadata.machineName)))byName.set(String(metadata.machineName),descriptor);
    byAlias.set(folder,descriptor); byAlias.set(key,descriptor); if(!byAlias.has(String(metadata.machineName)))byAlias.set(String(metadata.machineName),descriptor);
  }
  return {root,byKey,byName,byAlias};
}

function resolveLibrary(dep,bundled,shared){
  const key=dependencyKey(dep);
  const exact=bundled.byKey.get(key)??shared.byKey.get(key);
  if(exact)return {source:bundled.byKey.has(key)?'bundle':'shared',descriptor:exact};
  const loose=bundled.byName.get(dep.machineName)??shared.byName.get(dep.machineName);
  if(loose && Number(loose.metadata.majorVersion)===dep.majorVersion && Number(loose.metadata.minorVersion)===dep.minorVersion)return {source:bundled.byName.get(dep.machineName)===loose?'bundle':'shared',descriptor:loose};
  return null;
}

function preloadedAssetPaths(metadata) {
  const paths=[];
  for (const field of ['preloadedJs','preloadedCss']) {
    const entries=metadata?.[field];
    if(entries==null)continue;
    if(!Array.isArray(entries))throw new Error(`H5P ${metadata?.machineName??'library'} ${field} must be an array.`);
    for(let index=0;index<entries.length;index++){
      const raw=entries[index]?.path;
      if(typeof raw!=='string'||!raw.trim())throw new Error(`H5P ${metadata?.machineName??'library'} ${field}[${index}] requires path.`);
      paths.push(safePath(raw));
    }
  }
  return paths;
}

function missingResolvedAssets(resolved,files) {
  const missing=[];
  for(const relative of preloadedAssetPaths(resolved.descriptor.metadata)){
    if(resolved.source==='bundle'){
      const path=`${resolved.descriptor.folder}/${relative}`;
      if(!files.has(path))missing.push(path);
      continue;
    }
    try{
      const path=under(resolved.descriptor.path,relative);
      if(!statSync(path).isFile())missing.push(`${resolved.descriptor.folder}/${relative}`);
    }catch{missing.push(`${resolved.descriptor.folder}/${relative}`);}
  }
  return missing;
}

function validateDependencies(files,shared){
  const h5pBytes=files.get('h5p.json'); const contentBytes=files.get('content/content.json');
  if(!h5pBytes||!contentBytes) return {ok:false,code:'P2RLN_H5P_STRUCTURE_INVALID',error:'H5P runtime payload requires h5p.json and content/content.json.'};
  let h5p; try{h5p=parseJson(h5pBytes,'h5p.json');parseJson(contentBytes,'content/content.json');}catch(error){return {ok:false,code:'P2RLN_H5P_INVALID_JSON',error:error.message};}
  let direct;try{direct=dependencyList(h5p.preloadedDependencies,'preloadedDependencies');}catch(error){return {ok:false,code:'P2RLN_H5P_MANIFEST_INVALID',error:error.message};}
  if(!h5p.mainLibrary || !direct.some((dep)=>dep.machineName===h5p.mainLibrary))return {ok:false,code:'P2RLN_H5P_MAIN_LIBRARY_UNDECLARED',error:'H5P mainLibrary must be declared in preloadedDependencies.'};
  let bundled;try{bundled=inspectBundledLibraries(files);}catch(error){return {ok:false,code:'P2RLN_H5P_LIBRARY_METADATA_INVALID',error:error.message};} const missing=[]; const visited=new Set(); const queue=[...direct];const resolvedByAlias=new Map();const versionByName=new Map();
  const missingAssets=[];
  while(queue.length){const dep=queue.shift();const key=dependencyKey(dep);if(!key||visited.has(key))continue;const prior=versionByName.get(dep.machineName);if(prior&&prior!==key)return {ok:false,code:'P2RLN_H5P_LIBRARY_VERSION_CONFLICT',error:`H5P dependency graph requires incompatible versions of ${dep.machineName}: ${prior} and ${key}.`};versionByName.set(dep.machineName,key);visited.add(key);const resolved=resolveLibrary(dep,bundled,shared);if(!resolved){missing.push(dep);continue;}let assets;try{assets=missingResolvedAssets(resolved,files);}catch(error){return {ok:false,code:'P2RLN_H5P_LIBRARY_METADATA_INVALID',error:error.message};}missingAssets.push(...assets);resolvedByAlias.set(key,resolved);resolvedByAlias.set(dep.machineName,resolved);resolvedByAlias.set(resolved.descriptor.folder,resolved);const meta=resolved.descriptor.metadata;let children;try{children=dependencyList(meta.preloadedDependencies,`${meta.machineName} preloadedDependencies`);}catch(error){return {ok:false,code:'P2RLN_H5P_LIBRARY_METADATA_INVALID',error:error.message};}for(const child of children)queue.push(child);}
  if(missing.length)return {ok:false,code:'P2RLN_H5P_LIBRARIES_MISSING',error:`Missing H5P libraries: ${missing.map((d)=>`${d.machineName} ${d.majorVersion}.${d.minorVersion}`).join(', ')}`,missing,h5p,bundled};
  if(missingAssets.length)return {ok:false,code:'P2RLN_H5P_LIBRARY_ASSETS_MISSING',error:`Missing H5P preloaded assets: ${[...new Set(missingAssets)].join(', ')}`,missingAssets:[...new Set(missingAssets)],h5p,bundled};
  return {ok:true,h5p,bundled,dependencyCount:visited.size,resolvedByAlias};
}

export function createH5PSessionRegistry(options={}){
  const maxFiles=Number(options.maxH5pFiles??DEFAULT_MAX_FILES); const maxBytes=Number(options.maxH5pPackageBytes??DEFAULT_MAX_BYTES); const ttlMs=Number(options.h5pSessionTtlMs??DEFAULT_TTL_MS); const maxSessions=Number(options.maxH5pSessions??DEFAULT_MAX_SESSIONS); const maxSessionBytesTotal=Number(options.maxH5pSessionBytesTotal??DEFAULT_MAX_SESSION_BYTES_TOTAL);
  if(!Number.isSafeInteger(maxFiles)||maxFiles<1||!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isSafeInteger(maxSessions)||maxSessions<1||!Number.isSafeInteger(maxSessionBytesTotal)||maxSessionBytesTotal<1||!Number.isFinite(ttlMs)||ttlMs<=0)throw new TypeError('Invalid H5P runtime session limits.');
  const shared=scanSharedLibraries(options.h5pLibrariesDir); const sessions=new Map();
  const cleanup=()=>{const now=Date.now();for(const [id,s] of sessions)if(s.expiresAt<=now)sessions.delete(id);};
  const activeBytes=()=>{let total=0;for(const session of sessions.values())total+=session.totalBytes;return total;};
  const evictOldest=()=>{const oldest=[...sessions.entries()].sort((a,b)=>a[1].createdAt-b[1].createdAt)[0];if(!oldest)return false;sessions.delete(oldest[0]);return true;};
  function create(buffer){cleanup();
    let parsed;try{parsed=parseSessionPayload(buffer,{maxFiles,maxBytes});}catch(error){return {ok:false,code:'P2RLN_H5P_SESSION_INVALID',error:error.message};}
    if(parsed.totalBytes>maxSessionBytesTotal)return {ok:false,code:'P2RLN_H5P_SESSION_CAPACITY',error:`H5P session requires ${parsed.totalBytes} bytes; host aggregate limit is ${maxSessionBytesTotal}.`};
    const checked=validateDependencies(parsed.files,shared);if(!checked.ok)return checked;
    while(sessions.size>=maxSessions || activeBytes()+parsed.totalBytes>maxSessionBytesTotal){if(!evictOldest())break;}
    if(sessions.size>=maxSessions || activeBytes()+parsed.totalBytes>maxSessionBytesTotal)return {ok:false,code:'P2RLN_H5P_SESSION_CAPACITY',error:'H5P runtime session capacity is exhausted.'};
    const id=randomBytes(24).toString('base64url');const now=Date.now();const session={id,createdAt:now,expiresAt:now+ttlMs,files:parsed.files,totalBytes:parsed.totalBytes,h5p:checked.h5p,bundled:checked.bundled,resolvedByAlias:checked.resolvedByAlias,dependencyCount:checked.dependencyCount};sessions.set(id,session);return {ok:true,session};}
  function get(id){cleanup();const session=sessions.get(String(id));if(session)session.expiresAt=Date.now()+ttlMs;return session??null;}
  function remove(id){return sessions.delete(String(id));}
  function read(id,rawPath){const session=get(id);if(!session)return null;let path;try{path=safePath(rawPath);}catch{return null;}if(session.files.has(path))return {body:session.files.get(path),type:mediaType(path),source:'session'};
    const [folder,...rest]=path.split('/');
    if(!rest.length)return null;const resolved=session.resolvedByAlias.get(folder);if(!resolved)return null;
    if(resolved.source==='bundle'){const mapped=`${resolved.descriptor.folder}/${rest.join('/')}`;if(session.files.has(mapped))return {body:session.files.get(mapped),type:mediaType(mapped),source:'session-alias'};return null;}
    try{const file=under(resolved.descriptor.path,rest.join('/'));const st=statSync(file);if(!st.isFile())return null;return {body:readFileSync(file),type:mediaType(file),source:'shared'};}catch{return null;}}
  return Object.freeze({create,get,remove,read,sharedLibraryCount:shared.byKey.size,get size(){cleanup();return sessions.size;},get totalBytes(){cleanup();return activeBytes();}});
}

export function h5pSessionEtag(body){return `\"${createHash('sha256').update(body).digest('base64url')}\"`;}
export function h5pMediaType(path){return mediaType(path);}
