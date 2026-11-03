// Read-only LTI Advantage NRPS 2.0 client. No roster data is persisted.
// Membership URLs must be received in signed launches and bound to the LMS.
import {createPrivateKey,randomUUID,sign} from 'node:crypto';
import {isIP} from 'node:net';
import {lookup as dnsLookup} from 'node:dns/promises';

export const NRPS_CLAIM='https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice';
export const NRPS_SCOPE='https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly';
export const NRPS_MEDIA_TYPE='application/vnd.ims.lti-nrps.v2.membershipcontainer+json';
const MAX_URL=4096,MAX_PAGES=25,MAX_MEMBERS=5000,MAX_RESPONSE=2*1024*1024;
const encoded=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const localHost=h=>/^(localhost|127\.0\.0\.1|(?:[a-z0-9-]+\.)+localhost)$/.test(h);

function originsFor(reg,local){
 if(!reg||reg.status!=='ACTIVE')throw new Error('Inactive LMS registration for NRPS');
 const entries=[reg.issuer,reg.tokenUrl,...(reg.nrpsAllowedOrigins||[])];
 if(entries.length>20)throw new Error('Too many registered NRPS origins');
 const origins=new Set();
 for(const candidate of entries){
  if(typeof candidate!=='string'||candidate.length>MAX_URL)throw new Error('Invalid registered NRPS origin');
  let u;try{u=new URL(candidate);}catch{throw new Error('Invalid registered NRPS origin');}
  const dev=local&&u.protocol==='http:'&&localHost(u.hostname);
  if((u.protocol!=='https:'&&!dev)||u.username||u.password||u.hash||
     (isIP(u.hostname)&&!dev))throw new Error('Unsafe NRPS LMS origin');
  origins.add(u.origin);
 }
 return origins;
}
function approved(raw,origins,local){
 if(typeof raw!=='string'||!raw.trim()||raw.length>MAX_URL)throw new Error('Invalid NRPS URL');
 let u;try{u=new URL(raw);}catch{throw new Error('Invalid NRPS URL');}
 const dev=local&&u.protocol==='http:'&&localHost(u.hostname);
 if((u.protocol!=='https:'&&!dev)||u.username||u.password||u.hash||
    !origins.has(u.origin)||(isIP(u.hostname)&&!dev))
  throw new Error('Unapproved NRPS service URL');
 return u;
}
export function validateNrpsClaim(claim,registration,{allowInsecureLoopback=false}={}){
 if(claim==null)return null;
 if(!claim||typeof claim!=='object'||Array.isArray(claim)||
    !Array.isArray(claim.service_versions)||!claim.service_versions.includes('2.0'))
  throw new Error('LMS has not advertised NRPS 2.0');
 const url=approved(claim.context_memberships_url,originsFor(registration,allowInsecureLoopback),allowInsecureLoopback);
 return {membershipUrl:url.href,serviceVersions:['2.0']};
}
function assertion(tool,clientId,tokenUrl){
 const key=createPrivateKey(tool.privateKeyPem);
 if(key.asymmetricKeyType!=='rsa'||(key.asymmetricKeyDetails?.modulusLength??0)<2048)
  throw new Error('P2LRN NRPS signing key must be RSA >= 2048');
 if(typeof clientId!=='string'||!clientId||clientId.length>512)
  throw new Error('Invalid NRPS client ID');
 const now=Math.floor(Date.now()/1000);
 const jwt=encoded({alg:'RS256',typ:'JWT',kid:tool.kid})+'.'+
   encoded({iss:clientId,sub:clientId,aud:tokenUrl,iat:now,exp:now+300,jti:randomUUID()});
 return jwt+'.'+sign('RSA-SHA256',Buffer.from(jwt),key).toString('base64url');
}
async function readJsonLimited(response,max){
 const declared=Number(response.headers?.get?.('content-length')||0);
 if(declared>max)throw new Error('NRPS response exceeds size limit');
 const reader=response.body?.getReader?.();
 if(reader){
  const chunks=[];let total=0;
  try{
   while(true){
    const {done,value}=await reader.read();if(done)break;
    total+=value.byteLength;
    if(total>max)throw new Error('NRPS response exceeds size limit');
    chunks.push(Buffer.from(value));
   }
  }finally{reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw new Error('Invalid NRPS JSON response');}
 }
 const text=await response.text();
 if(Buffer.byteLength(text)>max)throw new Error('NRPS response exceeds size limit');
 try{return JSON.parse(text);}catch{throw new Error('Invalid NRPS JSON response');}
}
function parseNext(header){
 if(!header)return null;
 const found=[...String(header).matchAll(/<([^<>]+)>\s*;\s*rel\s*=\s*"?([^";,]+)"?/gi)]
  .filter(m=>m[2].trim().toLowerCase().split(/\s+/).includes('next'));
 if(found.length>1)throw new Error('Multiple NRPS next links');
 return found[0]?.[1]??null;
}
function member(m){
 if(!m||typeof m!=='object'||Array.isArray(m)||
    typeof m.user_id!=='string'||!m.user_id.trim()||m.user_id.length>512||
    !Array.isArray(m.roles)||!m.roles.length||m.roles.length>30||
    m.roles.some(role=>typeof role!=='string'||!role.trim()||role.length>512))
  throw new Error('Invalid NRPS membership schema');
 const status=m.status??'Active';
 if(!['Active','Inactive'].includes(status))throw new Error('Invalid NRPS membership status');
 const value={userId:m.user_id,roles:[...new Set(m.roles)],status};
 for(const [from,to,max] of [['name','name',256],['given_name','givenName',128],
                              ['family_name','familyName',128],['email','email',320]]){
  if(m[from]!=null){
   if(typeof m[from]!=='string'||m[from].length>max)throw new Error('Invalid NRPS optional profile');
   value[to]=m[from];
  }
 }
 return value;
}
export function createLtiNrpsClient({tool,fetchImpl=fetch,lookup=dnsLookup,allowInsecureLoopback=false}={}){
 if(!tool?.privateKeyPem||!tool?.kid)throw new TypeError('Persistent P2LRN tool key required');
 async function checkDns(u){
  if(allowInsecureLoopback&&localHost(u.hostname))return;
  const addresses=await lookup(u.hostname,{all:true,verbatim:true});
  if(!Array.isArray(addresses)||!addresses.length)throw new Error('NRPS DNS returned no addresses');
  for(const entry of addresses){
   const addr=String(entry?.address||'').toLowerCase();
   const v4=addr.startsWith('::ffff:')?addr.slice(7):addr;
   if(!addr||addr==='::'||addr==='::1'||addr.startsWith('fe80:')||
      addr.startsWith('fc')||addr.startsWith('fd')||addr.startsWith('ff')||
      /^(?:0|10|127|169\.254|192\.168)\./.test(v4)||
      /^172\.(1[6-9]|2\d|3[01])\./.test(v4)||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(v4)||
      /^198\.(1[89])\./.test(v4)||
      /^(?:22[4-9]|23\d|24\d|25[0-5])\./.test(v4))
    throw new Error('NRPS DNS resolves to a private or unsafe address');
  }
 }
 async function request(phase,url,options){
  try{return await fetchImpl(url,{...options,redirect:'manual',signal:AbortSignal.timeout(8000)});}
  catch(error){throw new Error('NRPS '+phase+' '+(['AbortError','TimeoutError'].includes(error?.name)?'TIMEOUT':'NETWORK_ERROR'));}
 }
 async function listMembers({registration,service,contextId}={}){
  if(!service?.serviceVersions?.includes('2.0'))throw new Error('NRPS not offered by a verified launch');
  if(typeof contextId!=='string'||!contextId.trim()||contextId.length>1024)
   throw new Error('NRPS context is required');
  const origins=originsFor(registration,allowInsecureLoopback);
  const tokenUrl=approved(registration.tokenUrl,origins,allowInsecureLoopback);
  const initial=approved(service.membershipUrl,origins,allowInsecureLoopback);
  await checkDns(tokenUrl);await checkDns(initial);
  const body=new URLSearchParams({
   grant_type:'client_credentials',client_assertion_type:'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
   client_assertion:assertion(tool,registration.clientId,tokenUrl.href),scope:NRPS_SCOPE
  });
  const auth=await request('TOKEN',tokenUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!auth.ok||auth.status>=300)throw new Error('NRPS OAuth token request failed: HTTP '+auth.status);
  const token=await readJsonLimited(auth,65536);
  if(typeof token?.access_token!=='string'||!token.access_token.trim()||
     token.access_token.length>8192||String(token.token_type||'').toLowerCase()!=='bearer')
   throw new Error('LMS returned an invalid NRPS access token');
  const people=new Map(),visited=new Set();
  let next=initial.href;
  while(next){
   if(visited.size>=MAX_PAGES)throw new Error('NRPS page limit exceeded');
   const url=approved(next,origins,allowInsecureLoopback);
   if(url.origin!==initial.origin||visited.has(url.href))
    throw new Error('Unapproved or repeated NRPS pagination URL');
   visited.add(url.href);await checkDns(url);
   const response=await request('MEMBERSHIPS',url,{method:'GET',
    headers:{Authorization:'Bearer '+token.access_token,Accept:NRPS_MEDIA_TYPE}});
   if(!response.ok||response.status>=300)throw new Error('NRPS membership lookup failed: HTTP '+response.status);
   const ct=String(response.headers?.get?.('content-type')||'').split(';')[0].trim().toLowerCase();
   if(ct!==NRPS_MEDIA_TYPE&&ct!=='application/json')
    throw new Error('Unsupported NRPS response content type');
   const data=await readJsonLimited(response,MAX_RESPONSE);
   if(data?.context?.id!==contextId||!Array.isArray(data.members))
    throw new Error('NRPS response context or members mismatch');
   if(data.members.length+people.size>MAX_MEMBERS)throw new Error('NRPS roster too large');
   for(const row of data.members){
    const item=member(row),old=people.get(item.userId);
    if(old&&JSON.stringify(old)!==JSON.stringify(item))
     throw new Error('Conflicting NRPS membership pages');
    people.set(item.userId,item);
   }
   const link=parseNext(response.headers?.get?.('link'));
   next=link?new URL(link,url).href:null;
  }
  return {contextId,members:[...people.values()],total:people.size,pages:visited.size,
   source:'NRPS 2.0',fetchedAt:new Date().toISOString()};
 }
 return Object.freeze({listMembers});
}
