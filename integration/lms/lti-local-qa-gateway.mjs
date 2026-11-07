// Dynamic ingress routing for explicitly enabled local QA only.
// Preserve the trusted LMS Host header for Caddy virtual hosts. Node fetch
// normalizes Host for rewritten URLs, so use node:http rather than fetch here.
import {lookup as dnsLookup} from 'node:dns/promises';
import {request as nodeHttpRequest} from 'node:http';
import {isIP} from 'node:net';

const MAX_REPLY=2*1024*1024;
const localLmsHost=host=>/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.localhost$/i.test(host);
const gatewayLabel=host=>typeof host==='string'&&/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host);
const privateIp=host=>{
 if(isIP(host)===4)return /^10\.|^127\.|^192\.168\.|^172\.(1[6-9]|2[0-9]|3[01])\./.test(host);
 if(isIP(host)===6)return host==='::1'||host.toLowerCase().startsWith('fd');
 return false;
};

function postLocalLms(original,gatewayHost,options,requestLocal){
 let payload=null;
 if(options.body!==undefined&&options.body!==null){
  const body=options.body;
  if(typeof body==='string')payload=Buffer.from(body,'utf8');
  else if(body instanceof URLSearchParams)payload=Buffer.from(body.toString(),'utf8');
  else if(body instanceof Uint8Array)payload=Buffer.from(body);
  else throw new TypeError('Unsupported local LMS request body');
 }
 const headers=new Headers(options.headers);
 headers.set('Host',original.host);
 if(payload!==null){
  headers.set('Content-Length',String(payload.byteLength));
  if(options.body instanceof URLSearchParams&&!headers.has('content-type'))
   headers.set('Content-Type','application/x-www-form-urlencoded');
 }
 const gatewayUrl=new URL(original.pathname+original.search,'http://'+gatewayHost);
 return new Promise((resolve,reject)=>{
  const req=requestLocal(gatewayUrl,{
   method:options.method||'GET',headers:Object.fromEntries(headers),signal:options.signal
  },response=>{
   const chunks=[];let total=0;
   response.on('data',buffer=>{
    total+=buffer.byteLength;
    if(total>MAX_REPLY){req.destroy(new Error('Oversized local LMS response'));return;}
    chunks.push(buffer);
   });
   response.on('error',reject);
   response.on('end',()=>{
    const status=response.statusCode;
    if(!Number.isInteger(status)||status<200||status>599){reject(new Error('Invalid local LMS response'));return;}
    const body=[204,205,304].includes(status)?null:Buffer.concat(chunks);
    try{resolve(new Response(body,{status,headers:response.headers}));}catch(e){reject(e);}
   });
  });
  req.on('error',reject);
  req.end(payload??undefined);
 });
}

export async function createLocalQaLmsFetch({
 fetchImpl=fetch,enabled=false,gatewayHost='aulap2p-ingress-local',lookup=dnsLookup,
 requestLocal=nodeHttpRequest
}={}){
 if(typeof fetchImpl!=='function')throw new TypeError('LMS fetch must be callable');
 if(!enabled)return fetchImpl;
 if(!gatewayLabel(gatewayHost))throw new Error('Invalid local QA gateway DNS name');
 try{
  const resolved=await lookup(gatewayHost);
  if(!privateIp(resolved?.address))throw new Error('Local QA ingress must resolve to a private address');
 }catch{
  // Independent self-hosted QA environments without this gateway retain
  // their existing transport. Never use this mapping in production HTTPS.
  return fetchImpl;
 }
 return (url,options={})=>{
  const original=new URL(url);
  if(original.protocol!=='http:'||!localLmsHost(original.hostname)||
     original.hostname==='p2lrn-lti.localhost'||original.username||original.password)
   return fetchImpl(url,options);
  return postLocalLms(original,gatewayHost,options,requestLocal);
 };
}

