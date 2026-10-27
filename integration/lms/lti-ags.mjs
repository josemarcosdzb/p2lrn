// P2LRN-owned LTI Advantage AGS service. Browser scores are NEVER trusted here.
import {createHash,createPrivateKey,randomUUID,sign} from 'node:crypto';
import {isIP} from 'node:net';
import {lookup as dnsLookup} from 'node:dns/promises';
const SCORE_SCOPE='https://purl.imsglobal.org/spec/lti-ags/scope/score';
const LINEITEM_SCOPE='https://purl.imsglobal.org/spec/lti-ags/scope/lineitem';
const LINEITEM_READ_SCOPE='https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly';
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
 async function postScore({ags,subject,resourceLinkId,clientId,tokenUrl,issuer,score}){
  if(!ags||!Array.isArray(ags.scope)||!ags.scope.includes(SCORE_SCOPE))
   throw new Error('LMS did not authorize AGS score scope');
  if(typeof subject!=='string'||!subject.trim())throw new Error('Missing verified LMS learner');
  const n=score?.normalized;
  if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)
   throw new Error('Server-approved score must be within [0,1]');
  const needsLineitem=typeof ags.lineitem!=='string'||!ags.lineitem.trim();
  const canCreateLineitem=ags.scope.includes(LINEITEM_SCOPE);
  const canReadLineitem=canCreateLineitem||ags.scope.includes(LINEITEM_READ_SCOPE);
  if(needsLineitem&&(!canReadLineitem||
     typeof resourceLinkId!=='string'||!resourceLinkId.trim()||resourceLinkId.length>1024))
   throw new Error('AGS lineitem lookup requires an authorized collection and resource link');
  const allowed=new Set([new URL(issuer).origin,new URL(tokenUrl).origin]);
  if(Array.isArray(ags.allowedOrigins))for(const origin of ags.allowedOrigins)allowed.add(origin);
  const tokenEndpoint=allowedUrl(tokenUrl,allowed,allowInsecureLoopback);
  let lineitem=needsLineitem?null:allowedUrl(ags.lineitem,allowed,allowInsecureLoopback);
  let scoreMaximum=1;
  const collection=needsLineitem?allowedUrl(ags.lineitems,allowed,allowInsecureLoopback):null;
  if(lineitem&&(lineitem.search||lineitem.hash))
   throw new Error('AGS lineitem URL must not include query');
  await checkHost(tokenEndpoint);
  if(lineitem)await checkHost(lineitem);
  if(collection)await checkHost(collection);
  const clientAssertion=signAssertion(tool,clientId,tokenEndpoint.toString());
  const scopes=needsLineitem?[SCORE_SCOPE,canCreateLineitem?LINEITEM_SCOPE:LINEITEM_READ_SCOPE]:[SCORE_SCOPE];
  const form=new URLSearchParams({
   grant_type:'client_credentials',
   client_assertion_type:'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
   client_assertion:clientAssertion,scope:scopes.join(' ')
  });
  const auth=await fetchImpl(tokenEndpoint,{method:'POST',redirect:'manual',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:form,signal:AbortSignal.timeout(8000)});
  if(!auth.ok||auth.status>=300)throw new Error('LMS OAuth token request failed: HTTP '+auth.status);
  const reply=await readJson(auth,65536);
  if(typeof reply.access_token!=='string'||!reply.access_token.trim()||reply.access_token.length>8192 ||
     reply.token_type?.toLowerCase()!=='bearer')
   throw new Error('LMS did not return a valid bearer token');
  const bearer='Bearer '+reply.access_token;
  if(!lineitem){
   // Never create a new gradebook column for each learner or each retry.
   // This key identifies the LTI resource link and remains stable across attempts.
   const tag='p2lrn:'+createHash('sha256').update(resourceLinkId).digest('hex').slice(0,24);
   const filter=new URL(collection.toString());
   filter.searchParams.set('resource_link_id',resourceLinkId);
   await checkHost(filter);
   const list=await fetchImpl(filter,{method:'GET',redirect:'manual',
    headers:{Authorization:bearer,Accept:'application/vnd.ims.lis.v2.lineitemcontainer+json'},
    signal:AbortSignal.timeout(8000)});
   if(!list.ok||list.status>=300)throw new Error('LMS AGS lineitems lookup failed: HTTP '+list.status);
   const items=await readJson(list,262144);
   if(!Array.isArray(items))throw new Error('LMS AGS lineitems collection is not a JSON array');
   const matching=items.filter(item=>item&&item.resourceLinkId===resourceLinkId);
   const tagged=matching.filter(item=>item.tag===tag);
   if(tagged.length>1||(tagged.length===0&&matching.length>1))
    throw new Error('Ambiguous LMS gradebook columns for the same resource');
   const existing=tagged[0]||(matching.length===1?matching[0]:null);
   if(existing){
    if(typeof existing.scoreMaximum==='number'&&Number.isFinite(existing.scoreMaximum)&&
       existing.scoreMaximum>0&&existing.scoreMaximum<=1000000)
     scoreMaximum=existing.scoreMaximum;
    lineitem=allowedUrl(existing.id,allowed,allowInsecureLoopback);
   }else{
    if(!canCreateLineitem)
     throw new Error('No LMS gradebook column for resource and lineitem creation scope was not granted');
    const body=JSON.stringify({label:'P2LRN',scoreMaximum:1,resourceLinkId,tag});
    const created=await fetchImpl(collection,{method:'POST',redirect:'manual',
     headers:{Authorization:bearer,'Content-Type':'application/vnd.ims.lis.v2.lineitem+json'},
     body,signal:AbortSignal.timeout(8000)});
    if(!created.ok||created.status>=300)throw new Error('LMS AGS lineitem creation failed: HTTP '+created.status);
    let id=created.headers.get('location');
    if(!id){
     const response=await readJson(created,65536);
     id=response?.id;
    }
    if(typeof id!=='string'||!id.trim())throw new Error('LMS AGS did not return created lineitem id');
    lineitem=allowedUrl(new URL(id,collection).toString(),allowed,allowInsecureLoopback);
   }
  }
  if(lineitem.search||lineitem.hash)throw new Error('AGS lineitem URL must not include query');
  const scoreUrl=new URL(lineitem.toString());
  scoreUrl.pathname=scoreUrl.pathname.replace(/\/$/,'')+'/scores';
  await checkHost(scoreUrl);
  const payload={userId:subject,scoreGiven:Math.round(n*scoreMaximum*1000000)/1000000,
   scoreMaximum,activityProgress:score.completed?'Completed':'InProgress',
   gradingProgress:'FullyGraded',timestamp:new Date().toISOString()};
  const response=await fetchImpl(scoreUrl,{method:'POST',redirect:'manual',
   headers:{Authorization:bearer,
    'Content-Type':'application/vnd.ims.lis.v1.score+json'},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
  if(!response.ok||response.status>=300)throw new Error('LMS AGS score delivery failed: HTTP '+response.status);
  return {ok:true,status:response.status};
 }
 return Object.freeze({postScore});
}
