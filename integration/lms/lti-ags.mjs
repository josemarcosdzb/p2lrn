// P2LRN-owned LTI Advantage AGS service. Browser scores are NEVER trusted here.
import {createPrivateKey,randomUUID,sign} from 'node:crypto';
import {isIP} from 'node:net';
import {lookup as dnsLookup} from 'node:dns/promises';
const SCORE_SCOPE='https://purl.imsglobal.org/spec/lti-ags/scope/score';
const bytes=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const URL_LIMIT=4096;
const allowedUrl=(value,origins,local)=>{
 if(typeof value!=='string'||value.length>URL_LIMIT)throw new Error('Invalid LMS service URL');
 let u;try{u=new URL(value);}catch{throw new Error('Invalid LMS service URL');}
 const dev=local&&/^(localhost|127\.0\.0\.1|.*\.localhost)$/.test(u.hostname);
 if((u.protocol!=='https:'&&!dev)||u.username||u.password||u.hash||!origins.has(u.origin))
  throw new Error('Unapproved LMS service URL');
 if(isIP(u.hostname)&&!dev)throw new Error('An IP address is not an authorized LMS host');
 return u;
};
const readJson=async(response,limit)=>{
 const len=Number(response.headers.get('content-length')||0);
 if(len>limit)throw new Error('Oversized LMS response');
 const text=await response.text();
 if(Buffer.byteLength(text)>limit)throw new Error('Oversized LMS response');
 try{return JSON.parse(text);}catch{throw new Error('Invalid LMS JSON response');}
};
function signAssertion(tool,clientId,tokenUrl){
 const privateKey=createPrivateKey(tool.privateKeyPem);
 if(privateKey.asymmetricKeyType!=='rsa'||(privateKey.asymmetricKeyDetails?.modulusLength??0)<2048)
  throw new Error('LTI server signing key must be RSA >=2048');
 const epoch=Math.floor(Date.now()/1000);
 const jwt=bytes({alg:'RS256',typ:'JWT',kid:tool.kid})+'.'+bytes({
  iss:clientId,sub:clientId,aud:tokenUrl,iat:epoch,exp:epoch+300,jti:randomUUID()
 });
 return jwt+'.'+sign('RSA-SHA256',Buffer.from(jwt),privateKey).toString('base64url');
}
export function createLtiAgsClient({tool,fetchImpl=fetch,lookup=dnsLookup,allowInsecureLoopback=false}){
 if(!tool?.privateKeyPem||!tool?.kid)throw new TypeError('P2LRN RSA identity required');
 async function checkHost(u){
  if(allowInsecureLoopback&&/^(localhost|127\.0\.0\.1|.*\.localhost)$/.test(u.hostname))return;
  const addresses=await lookup(u.hostname,{all:true,verbatim:true});
  if(!addresses?.length)throw new Error('LMS service DNS has no addresses');
  for(const entry of addresses){
   const a=entry.address.toLowerCase();
   if(a==='::1'||a==='::'||a.startsWith('fe80:')||a.startsWith('fc')||
      a.startsWith('fd')||a.startsWith('::ffff:127.')||a.startsWith('::ffff:10.')||
      a.startsWith('::ffff:192.168.')||
      /^10\.|^127\.|^169\.254\.|^192\.168\.|^0\.|^22[4-9]\.|^23[0-9]\.|^24[0-9]\.|^25[0-5]\./.test(a)||
      (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(a)))
    throw new Error('LMS service resolves to a private or unsafe address');
  }
 }
 async function postScore({ags,subject,clientId,tokenUrl,issuer,score}){
  if(!ags||!Array.isArray(ags.scope)||!ags.scope.includes(SCORE_SCOPE))
   throw new Error('LMS did not authorize AGS score scope');
  const allowed=new Set([new URL(issuer).origin,new URL(tokenUrl).origin]);
  if(Array.isArray(ags.allowedOrigins))for(const origin of ags.allowedOrigins)allowed.add(origin);
  const tokenEndpoint=allowedUrl(tokenUrl,allowed,allowInsecureLoopback);
  const lineitem=allowedUrl(ags.lineitem,allowed,allowInsecureLoopback);
  if(lineitem.search||lineitem.hash)throw new Error('AGS lineitem URL must not include query');
  const scoreUrl=new URL(lineitem.toString());
  scoreUrl.pathname=scoreUrl.pathname.replace(/\/$/,'')+'/scores';
  await checkHost(tokenEndpoint);await checkHost(scoreUrl);
  const clientAssertion=signAssertion(tool,clientId,tokenEndpoint.toString());
  const form=new URLSearchParams({
   grant_type:'client_credentials',
   client_assertion_type:'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
   client_assertion:clientAssertion,scope:SCORE_SCOPE
  });
  const auth=await fetchImpl(tokenEndpoint,{method:'POST',redirect:'manual',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:form,signal:AbortSignal.timeout(8000)});
  if(!auth.ok||auth.status>=300)throw new Error('LMS OAuth token request failed: HTTP '+auth.status);
  const reply=await readJson(auth,65536);
  if(typeof reply.access_token!=='string'||!reply.access_token.trim()||reply.access_token.length>8192 ||
     reply.token_type?.toLowerCase()!=='bearer')
   throw new Error('LMS did not return a valid bearer token');
  if(typeof subject!=='string'||!subject.trim())throw new Error('Missing verified LMS learner');
  const n=score?.normalized;
  if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)
   throw new Error('Server-approved score must be within [0,1]');
  const payload={userId:subject,scoreGiven:Math.round(n*1000000)/1000000,
   scoreMaximum:1,activityProgress:score.completed?'Completed':'InProgress',
   gradingProgress:'FullyGraded',timestamp:new Date().toISOString()};
  const response=await fetchImpl(scoreUrl,{method:'POST',redirect:'manual',
   headers:{Authorization:'Bearer '+reply.access_token,
    'Content-Type':'application/vnd.ims.lis.v1.score+json'},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
  if(!response.ok||response.status>=300)throw new Error('LMS AGS score delivery failed: HTTP '+response.status);
  return {ok:true,status:response.status};
 }
 return Object.freeze({postScore});
}
