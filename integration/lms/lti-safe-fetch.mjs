// Resolve, validate and PIN the actual outbound address for LTI HTTPS requests.
// HTTPS still validates the original LMS hostname (SNI and certificate SAN).
// This avoids the DNS check/use gap of a standalone lookup followed by fetch().
import {lookup as dnsLookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request as httpsRequest} from 'node:https';
import {request as httpRequest} from 'node:http';

const LOCAL=/^(localhost|127\.0\.0\.1|(?:[a-z0-9-]+\.)+localhost)$/;
const MAX_BODY=1024*1024;
const MAX_RESPONSE=2*1024*1024;

export function publicLmsAddress(value){
 const address=String(value||'').toLowerCase();
 if(isIP(address)===4){
  const octets=address.split('.').map(Number);
  const [a,b,c]=octets;
  return a!==0&&a!==10&&a!==127&&a<224&&a!==169&&
   !(a===100&&b>=64&&b<=127)&&
   !(a===172&&b>=16&&b<=31)&&
   !(a===192&&b===168)&&
   !(a===192&&b===0&&c===0)&&
   !(a===198&&(b===18||b===19));
 }
 if(isIP(address)===6){
  // 2000::/3 is the only globally routed IPv6 unicast range.
  // Explicitly refuse IPv4-mapped, ULA, link-local, loopback and multicast.
  return /^[23][0-9a-f]{0,3}:/u.test(address);
 }
 return false;
}

// Only the approved LMS registry may select a JWKS endpoint. JWT header
// jku/x5u values are never used to pick a network destination.
export function trustedLmsJwksUrl(value,registration,{allowInsecureLoopback=false}={}){
 if(value==null||value==='')return undefined;
 if(typeof value!=='string'||value.length>4096)throw new Error('LTI_UNTRUSTED_JWKS_URL');
 let u;
 try{u=new URL(value);}catch{throw new Error('LTI_UNTRUSTED_JWKS_URL');}
 const dev=allowInsecureLoopback&&LOCAL.test(u.hostname);
 if((u.protocol!=='https:'&&!(dev&&u.protocol==='http:'))||
    u.username||u.password||u.hash||!u.hostname||
    (isIP(u.hostname)&&!dev))throw new Error('LTI_UNTRUSTED_JWKS_URL');
 const origins=new Set();
 try{
  for(const field of ['issuer','authUrl','tokenUrl']){
   if(registration?.[field])origins.add(new URL(registration[field]).origin);
  }
 }catch{throw new Error('LTI_UNTRUSTED_JWKS_URL');}
 if(!origins.has(u.origin))throw new Error('LTI_UNTRUSTED_JWKS_ORIGIN');
 return u.href;
}

export async function validatedLmsAddresses(url,{lookup=dnsLookup,allowInsecureLoopback=false}={}){
 const u=url instanceof URL?url:new URL(url);
 const dev=allowInsecureLoopback&&LOCAL.test(u.hostname);
 if((u.protocol!=='https:'&&!(dev&&u.protocol==='http:'))||
    u.username||u.password||u.hash||u.hostname.length>255||
    (isIP(u.hostname)&&!dev))throw new Error('LTI_UNTRUSTED_NETWORK_TARGET');
 const entries=await lookup(u.hostname,{all:true,verbatim:true});
 if(!Array.isArray(entries)||entries.length<1||entries.length>32||
    entries.some(entry=>!entry||!isIP(entry.address)||
      entry.family!==isIP(entry.address)||
      (!dev&&!publicLmsAddress(entry.address))))
  throw new Error('LTI_UNSAFE_DNS_ADDRESS');
 return {url:u,addresses:entries};
}

export async function pinnedLmsFetch(url,options={},config={}){
 const {url:u,addresses}=await validatedLmsAddresses(url,config);
 if(options.redirect&&options.redirect!=='manual'&&options.redirect!=='error')
  throw new Error('LTI_REDIRECTS_DISALLOWED');
 const selected=addresses[0],limit=config.maxResponseBytes??MAX_RESPONSE;
 if(!Number.isSafeInteger(limit)||limit<1||limit>MAX_RESPONSE)
  throw new Error('LTI_INVALID_RESPONSE_LIMIT');
 const headers=new Headers(options.headers||{});
 headers.set('Accept-Encoding','identity');
 let body=options.body==null?null:
  options.body instanceof URLSearchParams?options.body.toString():
  typeof options.body==='string'||Buffer.isBuffer(options.body)?
   options.body:null;
 if(options.body!=null&&body===null)throw new Error('LTI_UNSUPPORTED_REQUEST_BODY');
 if(body!=null&&Buffer.byteLength(body)>MAX_BODY)throw new Error('LTI_REQUEST_TOO_LARGE');
 const native=u.protocol==='https:'?httpsRequest:httpRequest;
 return await new Promise((resolve,reject)=>{
  const req=native(u,{
   method:options.method||'GET',
   headers:Object.fromEntries(headers.entries()),
   signal:options.signal??AbortSignal.timeout(8000),
   timeout:8000,
   agent:false,
   // Native TLS continues to use u.hostname as servername for certificate checks.
   lookup:(host,opts,cb)=>opts?.all?
    cb(null,[{address:selected.address,family:selected.family}]):
    cb(null,selected.address,selected.family)
  },reply=>{
   const chunks=[];let size=0;
   const declared=Number(reply.headers['content-length']||0);
   if(declared>limit){req.destroy(new Error('LTI_RESPONSE_TOO_LARGE'));return;}
   reply.on('data',chunk=>{
    size+=chunk.length;
    if(size>limit){req.destroy(new Error('LTI_RESPONSE_TOO_LARGE'));return;}
    chunks.push(chunk);
   });
   reply.once('error',reject);
   reply.once('end',()=>{
    const status=reply.statusCode||500;
    if(status<200||status>599){reject(new Error('LTI_INVALID_HTTP_RESPONSE'));return;}
    const responseHeaders=new Headers();
    for(const [key,value] of Object.entries(reply.headers)){
     if(value!==undefined)responseHeaders.set(key,Array.isArray(value)?value.join(', '):value);
    }
    resolve(new Response([204,205,304].includes(status)?null:Buffer.concat(chunks),
     {status,headers:responseHeaders}));
   });
  });
  req.once('error',reject);
  req.once('timeout',()=>req.destroy(new Error('LTI_REQUEST_TIMEOUT')));
  req.end(body??undefined);
 });
}
