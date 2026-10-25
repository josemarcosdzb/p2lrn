import {createServer} from 'node:http';
import {existsSync, readFileSync, realpathSync, statSync} from 'node:fs';
import {basename, extname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createH5PSessionRegistry, h5pSessionEtag, h5pMediaType} from './h5p-session.mjs';

const VERSION='0.5.0-alpha.11';
const MAX_UPLOAD_BYTES_DEFAULT=256*1024*1024;
const MAX_SESSION_CREATES_PER_MINUTE_DEFAULT=60;
const ASSETS = new Map([
  ['/scorm/', {path:new URL('../dist/runtime-host/scorm.html',import.meta.url),type:'text/html; charset=utf-8',document:'scorm'}],
  ['/scorm/index.html',{path:new URL('../dist/runtime-host/scorm.html',import.meta.url),type:'text/html; charset=utf-8',document:'scorm'}],
  ['/scorm/scorm-host.js',{path:new URL('../dist/runtime-host/scorm-host.js',import.meta.url),type:'text/javascript; charset=utf-8'}],
  ['/scorm-runtime-core.js',{path:new URL('../dist/scorm-runtime-core.js',import.meta.url),type:'text/javascript; charset=utf-8'}],
  ['/h5p/',{path:new URL('../dist/runtime-host/h5p.html',import.meta.url),type:'text/html; charset=utf-8',document:'h5p'}],
  ['/h5p/index.html',{path:new URL('../dist/runtime-host/h5p.html',import.meta.url),type:'text/html; charset=utf-8',document:'h5p'}],
  ['/h5p-runtime-shell.js',{path:new URL('../dist/h5p-runtime-shell.js',import.meta.url),type:'text/javascript; charset=utf-8'}],
  ['/h5p/h5p-host.js',{path:new URL('../dist/runtime-host/h5p-host.js',import.meta.url),type:'text/javascript; charset=utf-8'}],
]);

function normalizeBasePath(value){let path=String(value??'/runtime').trim()||'/runtime';if(!path.startsWith('/'))path='/'+path;path=path.replace(/\/{2,}/g,'/');if(path.length>1)path=path.replace(/\/+$/,'');if(path.includes('?')||path.includes('#')||path.includes('..'))throw new TypeError('Invalid P2LRN runtime basePath.');return path;}
function normalizeOrigins(values){
  if(values==null)return [];
  if(!Array.isArray(values))throw new TypeError('allowedParentOrigins must be an array when provided.');
  const out=[];
  for(const value of values){
    if(value==='*')throw new TypeError('Wildcard allowedParentOrigins is not permitted; list trusted application origins explicitly.');
    const url=new URL(String(value));
    if(!['http:','https:'].includes(url.protocol)||url.origin!==String(value))throw new TypeError(`Invalid allowed parent origin: ${String(value)}`);
    const localHttp=url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(url.protocol==='http:'&&!localHttp)throw new TypeError(`Non-local allowed parent origin must use HTTPS: ${url.origin}`);
    out.push(url.origin);
  }
  return [...new Set(out)];
}
function originAllowed(origin,allowed){return Boolean(origin&&allowed.includes(origin));}
function corsHeaders(req,allowed){const origin=String(req.headers.origin??'');if(!originAllowed(origin,allowed))return {};return {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, HEAD, POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'};}
function securityHeaders(asset,frameAncestors){const ancestors=frameAncestors.length?frameAncestors:["'none'"];const common={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()'};if(asset?.document==='scorm')common['Content-Security-Policy']=["default-src 'none'","script-src 'self' 'unsafe-inline' blob:","style-src 'unsafe-inline'","img-src data: blob:","media-src blob: data:","font-src blob: data:","frame-src about: blob:","connect-src 'none'","object-src 'none'","base-uri 'none'","form-action 'none'",`frame-ancestors ${ancestors.join(' ')}`].join('; ');if(asset?.document==='h5p')common['Content-Security-Policy']=["default-src 'none'","script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:","style-src 'self' 'unsafe-inline' blob:","img-src 'self' data: blob:","media-src 'self' data: blob:","font-src 'self' data: blob:","frame-src 'self' about: blob:","connect-src 'self'","worker-src 'self' blob:","object-src 'none'","base-uri 'self'","form-action 'none'",`frame-ancestors ${ancestors.join(' ')}`].join('; ');return common;}
function send(res,status,body,type,headers={},headOnly=false){const bytes=Buffer.isBuffer(body)?body:Buffer.from(body??'');res.statusCode=status;res.setHeader('Content-Type',type);res.setHeader('Content-Length',String(bytes.length));res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');for(const [k,v] of Object.entries(headers))res.setHeader(k,v);res.end(headOnly?undefined:bytes);}
function json(res,status,value,headers={},headOnly=false){send(res,status,JSON.stringify(value)+'\n','application/json; charset=utf-8',headers,headOnly);}
function safeUnder(root,relative){const lexicalRoot=resolve(root);const full=resolve(lexicalRoot,relative);const lexicalBase=lexicalRoot+sep;if(full!==lexicalRoot&&!full.startsWith(lexicalBase))return null;if(!existsSync(full))return null;try{const realRoot=realpathSync(lexicalRoot);const realFile=realpathSync(full);const realBase=realRoot+sep;if(realFile!==realRoot&&!realFile.startsWith(realBase))return null;return realFile;}catch{return null;}}
function runtimeAsset(root,relative){if(!root)return null;const file=safeUnder(root,relative);if(!file)return null;try{if(!statSync(file).isFile())return null;}catch{return null;}return {path:file,type:h5pMediaType(file)};}
function collect(req,limit){return new Promise((resolvePromise,reject)=>{const chunks=[];let total=0;req.on('data',(chunk)=>{total+=chunk.length;if(total>limit){reject(Object.assign(new Error(`Request body exceeds ${limit} bytes.`),{code:'P2LRN_H5P_RUNTIME_TOO_LARGE'}));req.destroy();return;}chunks.push(chunk);});req.on('end',()=>resolvePromise(Buffer.concat(chunks,total)));req.on('error',reject);});}

export function createP2LRNRuntimeHandler(options={}){
  const basePath=normalizeBasePath(options.basePath);const frameAncestors=normalizeOrigins(options.allowedParentOrigins);const allowedOrigins=frameAncestors;const cache=new Map();const standaloneDir=options.h5pStandaloneDir?resolve(String(options.h5pStandaloneDir)):null;const sessions=createH5PSessionRegistry(options);const maxUploadBytes=Number(options.maxH5pUploadBytes??MAX_UPLOAD_BYTES_DEFAULT);const maxSessionCreatesPerMinute=Number(options.maxH5pSessionCreatesPerMinute??MAX_SESSION_CREATES_PER_MINUTE_DEFAULT);
  if(!Number.isSafeInteger(maxUploadBytes)||maxUploadBytes<1)throw new TypeError('Invalid maxH5pUploadBytes.');
  if(!Number.isSafeInteger(maxSessionCreatesPerMinute)||maxSessionCreatesPerMinute<1)throw new TypeError('Invalid maxH5pSessionCreatesPerMinute.');
  let sessionCreateWindowStart=Date.now();let sessionCreateCount=0;
  const takeSessionCreateSlot=()=>{const now=Date.now();if(now-sessionCreateWindowStart>=60000){sessionCreateWindowStart=now;sessionCreateCount=0;}if(sessionCreateCount>=maxSessionCreatesPerMinute)return false;sessionCreateCount+=1;return true;};
  const requiredStandalone=['main.bundle.js','frame.bundle.js','styles/h5p.css'];const h5pRuntimeAvailable=Boolean(standaloneDir&&requiredStandalone.every((name)=>runtimeAsset(standaloneDir,name)));
  return function handler(req,res,next){
    const method=String(req.method||'GET').toUpperCase();let pathname;try{pathname=new URL(req.url||'/','http://p2lrn.invalid').pathname;}catch{send(res,400,'Bad Request\n','text/plain; charset=utf-8');return;}
    const within=basePath==='/'?true:(pathname===basePath||pathname.startsWith(basePath+'/'));if(!within){if(typeof next==='function'){next();return;}send(res,404,'Not Found\n','text/plain; charset=utf-8');return;}
    let relative=basePath==='/'?pathname:pathname.slice(basePath.length);if(relative===''||relative==='/'){res.statusCode=308;res.setHeader('Location',`${basePath==='/'?'':basePath}/scorm/`||'/scorm/');res.setHeader('Content-Length','0');res.end();return;}
    if(relative==='/health'&&['GET','HEAD'].includes(method)){json(res,200,{ok:true,runtime:'p2lrn-runtime',version:VERSION,scorm:true,h5p:{configured:h5pRuntimeAvailable,standaloneDir:Boolean(standaloneDir),sharedLibraries:sessions.sharedLibraryCount,activeSessions:sessions.size,activeSessionBytes:sessions.totalBytes}}, {'Cache-Control':'no-store'},method==='HEAD');return;}

    // H5P CORS/session API.
    if(relative==='/h5p/session'&&method==='OPTIONS'){const headers=corsHeaders(req,allowedOrigins);if(!Object.keys(headers).length){send(res,403,'Forbidden\n','text/plain; charset=utf-8');return;}send(res,204,'','text/plain',headers,true);return;}
    if(relative==='/h5p/session'&&method==='POST'){
      const headers=corsHeaders(req,allowedOrigins);if(!Object.keys(headers).length){json(res,403,{ok:false,code:'P2LRN_H5P_ORIGIN_DENIED',error:'Origin is not allowed to create H5P runtime sessions.'});return;}
      if(!takeSessionCreateSlot()){json(res,429,{ok:false,code:'P2LRN_H5P_RATE_LIMITED',error:'H5P runtime session creation rate limit exceeded.'},{...headers,'Retry-After':'60'});return;}
      if(!h5pRuntimeAvailable){json(res,503,{ok:false,code:'P2LRN_H5P_RUNTIME_UNAVAILABLE',error:'H5P Standalone runtime assets are not configured.'},headers);return;}
      const mediaType=String(req.headers['content-type']||'').split(';',1)[0].trim().toLowerCase();if(!['application/vnd.p2lrn.h5p-session','application/vnd.p2rln.h5p-session'].includes(mediaType)){json(res,415,{ok:false,code:'P2LRN_H5P_SESSION_MEDIA_TYPE',error:'Content-Type must be application/vnd.p2lrn.h5p-session.'},headers);return;}
      collect(req,maxUploadBytes).then((body)=>{const result=sessions.create(body);if(!result.ok){json(res,['P2LRN_H5P_LIBRARIES_MISSING','P2LRN_H5P_LIBRARY_ASSETS_MISSING'].includes(result.code)?409:result.code==='P2LRN_H5P_SESSION_CAPACITY'?413:400,result,headers);return;}const {session}=result;const runtimePrefix=basePath==='/'?'':basePath;const prefix=`${runtimePrefix}/h5p/session/${session.id}/`;json(res,201,{ok:true,id:session.id,expiresAt:new Date(session.expiresAt).toISOString(),mainLibrary:session.h5p.mainLibrary,dependencies:session.dependencyCount,sessionUrl:prefix,contentUrl:`${prefix}content/`,librariesUrl:prefix,runtimeAssetsUrl:`${runtimePrefix}/h5p/assets/`},headers);}).catch((error)=>json(res,error?.code==='P2LRN_H5P_RUNTIME_TOO_LARGE'?413:400,{ok:false,code:error?.code||'P2LRN_H5P_SESSION_INVALID',error:String(error?.message||error)},headers));return;
    }
    const sessionMatch=/^\/h5p\/session\/([A-Za-z0-9_-]+)(?:\/(.*))?$/.exec(relative);
    if(sessionMatch&&method==='OPTIONS'){const headers=corsHeaders(req,allowedOrigins);if(!Object.keys(headers).length){send(res,403,'Forbidden\n','text/plain; charset=utf-8');return;}send(res,204,'','text/plain',headers,true);return;}
    if(sessionMatch&&method==='DELETE'){const headers=corsHeaders(req,allowedOrigins);if(!Object.keys(headers).length){send(res,403,'Forbidden\n','text/plain; charset=utf-8');return;}sessions.remove(sessionMatch[1]);send(res,204,'','text/plain',headers,true);return;}
    if(sessionMatch&&['GET','HEAD'].includes(method)){const tail=sessionMatch[2]||'h5p.json';const found=sessions.read(sessionMatch[1],tail);if(!found){send(res,404,'Not Found\n','text/plain; charset=utf-8');return;}const headers={'Cache-Control':'private, no-store','ETag':h5pSessionEtag(found.body),'Cross-Origin-Resource-Policy':'same-origin'};send(res,200,found.body,found.type,headers,method==='HEAD');return;}

    const runtimeAssetMatch=/^\/h5p\/assets\/(.+)$/.exec(relative);
    if(runtimeAssetMatch&&['GET','HEAD'].includes(method)){const asset=runtimeAsset(standaloneDir,runtimeAssetMatch[1]);if(!asset){send(res,404,'Not Found\n','text/plain; charset=utf-8');return;}let body=cache.get(asset.path);if(!body){body=readFileSync(asset.path);cache.set(asset.path,body);}send(res,200,body,asset.type,{'Cache-Control':'public, max-age=31536000, immutable','Cross-Origin-Resource-Policy':'same-origin'},method==='HEAD');return;}

    if(!['GET','HEAD'].includes(method)){res.setHeader('Allow','GET, HEAD');send(res,405,'Method Not Allowed\n','text/plain; charset=utf-8');return;}
    const asset=ASSETS.get(relative);if(!asset){if(typeof next==='function'){next();return;}send(res,404,'Not Found\n','text/plain; charset=utf-8');return;}
    if(asset.document==='h5p'&&!h5pRuntimeAvailable){json(res,503,{ok:false,code:'P2LRN_H5P_RUNTIME_UNAVAILABLE',error:'H5P Standalone runtime assets are not configured.'});return;}
    let body=cache.get(relative);if(!body){body=readFileSync(fileURLToPath(asset.path));cache.set(relative,body);}send(res,200,body,asset.type,securityHeaders(asset,frameAncestors),method==='HEAD');
  };
}

export async function startP2LRNRuntimeHost(options={}){const host=String(options.host??'127.0.0.1');const port=Number(options.port??0);if(!Number.isInteger(port)||port<0||port>65535)throw new TypeError('Invalid P2LRN runtime port.');const basePath=normalizeBasePath(options.basePath);const handler=createP2LRNRuntimeHandler({...options,basePath});const server=createServer(handler);await new Promise((resolvePromise,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolvePromise();});});const address=server.address();if(!address||typeof address==='string'){server.close();throw new Error('P2LRN runtime server did not expose an IP socket.');}const urlHost=address.address.includes(':')?`[${address.address}]`:address.address;const origin=`http://${urlHost}:${address.port}`;const baseUrl=`${origin}${basePath==='/'?'/':basePath+'/'}`;return Object.freeze({server,origin,baseUrl,close:()=>new Promise((resolvePromise,reject)=>server.close((error)=>error?reject(error):resolvePromise()))});}

// Alpha15 API aliases. They intentionally call the canonical implementation.
export const createP2RLNRuntimeHandler=createP2LRNRuntimeHandler;
export const startP2RLNRuntimeHost=startP2LRNRuntimeHost;


export {createP2LRNCollaborationService,createP2LRNCollaborationHandler,P2LRN_COLLABORATION_HTTP_VERSION,P2LRN_COLLABORATION_HTTP_MEDIA_TYPE,P2LRN_COLLABORATION_OPERATIONS} from './collaboration-http.mjs';
