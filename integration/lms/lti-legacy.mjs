// Explicit, independently authenticated LTI 1.0 / 1.1 compatibility.
// LTI 1.3 OIDC/JWT routes never invoke this verifier.
import {createCipheriv,createDecipheriv,createHash,createHmac,hkdfSync,randomBytes,timingSafeEqual} from 'node:crypto';

const enc=x=>encodeURIComponent(String(x)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const sha=s=>createHash('sha256').update(s).digest('hex');
const str=(v,name,max=4096)=>{
 if(typeof v!=='string'||!v.trim()||v.length>max)throw new Error('INVALID_LEGACY_'+name);
 return v;
};
const xml=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const fixed=(x,y)=>Buffer.byteLength(x)===Buffer.byteLength(y)&&timingSafeEqual(Buffer.from(x),Buffer.from(y));
const v1keys=new Set(['oauth_consumer_key','oauth_nonce','oauth_signature_method','oauth_timestamp','oauth_version','oauth_signature','oauth_callback','oauth_body_hash']);

function baseUrl(raw){
 const u=new URL(raw);
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.hash||u.search)
  throw Error('INVALID_LEGACY_LAUNCH_URL');
 const host=u.hostname.toLowerCase(),port=u.port?':'+u.port:'';
 return u.protocol+'//'+host+port+(u.pathname||'/');
}
export function legacySigningBase(method,rawUrl,params){
 const u=new URL(rawUrl);
 const pairs=[...u.searchParams.entries(),...Object.entries(params)
  .filter(([key])=>key!=='oauth_signature').flatMap(([key,value])=>Array.isArray(value)?
    value.map(v=>[key,v]):[[key,value]])]
  .map(([key,value])=>[enc(key),enc(value)])
  .sort(([a,av],[b,bv])=>a<b?-1:a>b?1:av<bv?-1:av>bv?1:0);
 const normal=pairs.map(p=>p.join('=')).join('&');
 return [method.toUpperCase(),enc(baseUrl(u.origin+u.pathname)),enc(normal)].join('&');
}
export function signLegacyOauth(method,url,params,secret){
 const signatureMethod=params.oauth_signature_method;
 if(!['HMAC-SHA1','HMAC-SHA256'].includes(signatureMethod))
  throw Error('UNSUPPORTED_LEGACY_SIGNATURE');
 const hash=signatureMethod==='HMAC-SHA1'?'sha1':'sha256';
 return createHmac(hash,enc(secret)+'&').update(legacySigningBase(method,url,params)).digest('base64');
}
export function parseLegacyForm(body){
 const raw=String(body);
 if(Buffer.byteLength(raw)>65536)throw Error('LEGACY_LAUNCH_TOO_LARGE');
 const data=new URLSearchParams(raw),params=Object.create(null);
 let count=0;
 for(const [key,value] of data){
  count++;
  if(count>110||!key||key.length>160||value.length>8192||Object.hasOwn(params,key))
   throw Error('INVALID_LEGACY_LAUNCH_FORM');
  params[key]=value;
 }
 return params;
}
export function validateLegacyPlatform(reg,{allowInsecureLocal=false}={}){
 str(reg?.id,'REGISTRATION_ID',120);
 if(!reg.id.startsWith('legacy:'))throw Error('INVALID_LEGACY_REGISTRATION_ID');
 str(reg.tenantId,'TENANT',128);
 str(reg.consumerKey,'CONSUMER_KEY',256);
 str(reg.launchUrl,'LAUNCH_URL',1024);
 str(reg.issuerOrigin,'ISSUER',1024);
 const u=new URL(reg.launchUrl),issuer=new URL(reg.issuerOrigin);
 const trust=url=>url.protocol==='https:'||
  (allowInsecureLocal&&url.protocol==='http:'&&/^(?:localhost|127\.0\.0\.1|(?:[a-z0-9-]+\.)+localhost)$/i.test(url.hostname));
 if(!trust(u)||!trust(issuer)||reg.issuerOrigin!==issuer.origin)throw Error('UNTRUSTED_LEGACY_ORIGIN');
 if(u.pathname!=='/lti/legacy/launch'||u.search||u.hash||u.username||u.password||
    issuer.username||issuer.password||issuer.hash||issuer.search)
  throw Error('UNTRUSTED_LEGACY_ENDPOINT');
 if(reg.status!=='ACTIVE'&&reg.status!=='DISABLED')throw Error('INVALID_LEGACY_STATUS');
 return reg;
}
const keyFor=pem=>Buffer.from(hkdfSync('sha256',Buffer.from(str(pem,'PRIVATE_IDENTITY',12000)),
 Buffer.from('p2lrn/legacy-registration/v1'),Buffer.from('legacy-secret-aes256gcm'),32));
export function encryptLegacySecret(raw,pem){
 str(raw,'SHARED_SECRET',512);
 if(raw.length<24)throw Error('WEAK_LEGACY_SHARED_SECRET');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyFor(pem),iv);
 const body=Buffer.concat([cipher.update(raw,'utf8'),cipher.final()]);
 return [iv,cipher.getAuthTag(),body].map(v=>v.toString('base64url')).join('.');
}
export function decryptLegacySecret(encrypted,pem){
 const parts=str(encrypted,'SEALED_SECRET',2048).split('.');
 if(parts.length!==3)throw Error('INVALID_SEALED_LEGACY_SECRET');
 const [iv,tag,body]=parts.map(s=>Buffer.from(s,'base64url'));
 if(iv.length!==12||tag.length!==16||body.length<1)throw Error('INVALID_SEALED_LEGACY_SECRET');
 const dec=createDecipheriv('aes-256-gcm',keyFor(pem),iv);
 dec.setAuthTag(tag);
 return Buffer.concat([dec.update(body),dec.final()]).toString('utf8');
}
export function verifyLegacyLaunch({params,registration,secret,requestUrl,consumeNonce,now=Math.floor(Date.now()/1000),allowInsecureLocal=false}){
 validateLegacyPlatform(registration,{allowInsecureLocal});
 if(registration.status!=='ACTIVE')throw Error('DISABLED_LEGACY_TOOL');
 if(typeof params!=='object'||params===null||Array.isArray(params)||Object.keys(params).length>110)
  throw Error('INVALID_LEGACY_LAUNCH');
 if(baseUrl(requestUrl)!==baseUrl(registration.launchUrl)||new URL(requestUrl).search)
  throw Error('LEGACY_LAUNCH_TARGET_MISMATCH');
 if(params.id_token!==undefined||params.state!==undefined)throw Error('LEGACY_OIDC_DOWNGRADE_DENIED');
 if(params.oauth_consumer_key!==registration.consumerKey)throw Error('UNKNOWN_LEGACY_CONSUMER');
 if(params.lti_message_type!=='basic-lti-launch-request'||
    !['LTI-1p0','LTI-1p1'].includes(params.lti_version))
  throw Error('INVALID_LEGACY_LTI_VERSION');
 if(params.oauth_signature_method!=='HMAC-SHA1'&&params.oauth_signature_method!=='HMAC-SHA256')
  throw Error('UNSUPPORTED_LEGACY_SIGNATURE_METHOD');
 if(params.oauth_version!==undefined&&params.oauth_version!=='1.0')throw Error('INVALID_LEGACY_OAUTH_VERSION');
 const seconds=Number(params.oauth_timestamp);
 if(!Number.isSafeInteger(seconds)||Math.abs(seconds-now)>300)throw Error('EXPIRED_LEGACY_TIMESTAMP');
 const n=str(params.oauth_nonce,'NONCE',256);
 if(n.length<12)throw Error('WEAK_LEGACY_NONCE');
 const expected=signLegacyOauth('POST',registration.launchUrl,params,secret);
 if(!fixed(expected,str(params.oauth_signature,'SIGNATURE',256)))throw Error('INVALID_LEGACY_SIGNATURE');
 const userId=str(params.user_id,'SUBJECT',512),resourceLinkId=str(params.resource_link_id,'RESOURCE_LINK',512);
 const contextId=str(params.context_id,'CONTEXT',512);
 const bindingId=str(params.custom_p2lrn_binding_id??params.p2lrn_binding_id,'BINDING',128);
 if(!/^[a-f0-9]{64}$/i.test(bindingId))throw Error('INVALID_LEGACY_CONTENT_BINDING');
 if(typeof consumeNonce!=='function'||!consumeNonce(registration.id,sha(n),seconds))
  throw Error('REPLAYED_LEGACY_LAUNCH');
 const source=params.lis_result_sourcedid||null,service=params.lis_outcome_service_url||null;
 let basicOutcome=null;
 if(source&&service){
  if(params.lti_version==='LTI-1p1'||params.lti_version==='LTI-1p0'){
   const url=new URL(str(service,'OUTCOME_URL',1024));
   if(url.origin!==registration.issuerOrigin||
    !(url.protocol==='https:'||(allowInsecureLocal&&url.protocol==='http:'))||
    url.username||url.password||url.hash)
    throw Error('UNTRUSTED_LEGACY_OUTCOME');
   basicOutcome={serviceUrl:url.toString(),sourceId:str(source,'RESULT_SOURCE',4096),protocol:'legacy'};
  }
 }
 return Object.freeze({registrationId:registration.id,tenantId:registration.tenantId,
  deploymentId:'legacy',bindingId,platformSubject:userId,learnerKey:sha(registration.id+':'+userId),
  resourceLinkId,contextId,basicOutcome});
}
export async function sendLegacyOutcome({serviceUrl,sourceId,consumerKey,secret,issuerOrigin,
 normalized,fetchImpl=fetch,allowInsecureLocal=false,nonce=randomBytes(20).toString('hex'),now=Math.floor(Date.now()/1000)}){
 if(typeof normalized!=='number'||!Number.isFinite(normalized)||normalized<0||normalized>1)
  throw Error('INVALID_LEGACY_GRADE');
 const target=new URL(str(serviceUrl,'OUTCOME_URL',1024)),issuer=new URL(issuerOrigin);
 if(target.origin!==issuer.origin||
  !(target.protocol==='https:'||(allowInsecureLocal&&target.protocol==='http:'&&
   /^(?:localhost|127\.0\.0\.1|(?:[a-z0-9-]+\.)+localhost)$/i.test(target.hostname)))||
   target.username||target.password||target.hash)throw Error('UNTRUSTED_LEGACY_OUTCOME');
 const messageId=randomBytes(16).toString('hex');
 const body='<?xml version="1.0" encoding="UTF-8"?>'+
  '<imsx_POXEnvelopeRequest xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0">'+
  '<imsx_POXHeader><imsx_POXRequestHeaderInfo><imsx_version>V1.0</imsx_version><imsx_messageIdentifier>'+messageId+'</imsx_messageIdentifier></imsx_POXRequestHeaderInfo></imsx_POXHeader>'+
  '<imsx_POXBody><replaceResultRequest><resultRecord><sourcedGUID><sourcedId>'+xml(sourceId)+
  '</sourcedId></sourcedGUID><result><resultScore><language>en</language><textString>'+normalized+
  '</textString></resultScore></result></resultRecord></replaceResultRequest></imsx_POXBody></imsx_POXEnvelopeRequest>';
 const opts={
  oauth_consumer_key:consumerKey,oauth_nonce:nonce,oauth_signature_method:'HMAC-SHA1',
  oauth_timestamp:String(now),oauth_version:'1.0',
  oauth_body_hash:createHash('sha1').update(body).digest('base64')
 };
 opts.oauth_signature=signLegacyOauth('POST',target.href,opts,secret);
 const authorization='OAuth '+Object.entries(opts).sort(([a],[b])=>a.localeCompare(b))
  .map(([k,v])=>enc(k)+'="'+enc(v)+'"').join(', ');
 const res=await fetchImpl(target.href,{method:'POST',
  headers:{Authorization:authorization,'Content-Type':'application/xml','Accept':'application/xml'},
  body,signal:AbortSignal.timeout(15000)});
 if(res.status!==200)throw Error('LEGACY_OUTCOME_HTTP_'+res.status);
 const answer=await res.text();
 if(answer.length>65536||!/<(?:\w+:)?imsx_POXEnvelopeResponse(?:\s[^>]*)?>/i.test(answer)||!/<(?:\w+:)?imsx_codeMajor>\s*success\s*<\/(?:\w+:)?imsx_codeMajor>/i.test(answer))
  throw Error('LEGACY_OUTCOME_NOT_ACCEPTED');
 return {delivered:true,http:res.status,protocol:'LTI-1.1 Basic Outcomes'};
}
