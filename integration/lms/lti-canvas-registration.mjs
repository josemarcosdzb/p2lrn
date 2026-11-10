// Canvas LTI 1.3 Dynamic Registration (1EdTech / Instructure).
// An LMS administrator initiates the installation inside Canvas. Its short-lived
// registration token is used server-side only and is never written to a log or DB.
import {createHash} from 'node:crypto';
import {pinnedLmsFetch,trustedLmsJwksUrl} from './lti-safe-fetch.mjs';

export const CANVAS_PENDING_DEPLOYMENT='__p2lrn_canvas_dynamic_pending__';
const CONFIG_CLAIM='https://purl.imsglobal.org/spec/lti-tool-configuration';
const MAX_JSON_BYTES=1024*1024;
const SCOPES=[
 'https://purl.imsglobal.org/spec/lti-ags/scope/score',
 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
 'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly'
];
const officialCanvasHost=host=>host==='instructure.com'||host.endsWith('.instructure.com')||
 host==='canvaslms.com'||host.endsWith('.canvaslms.com');
const localCanvasHost=host=>host==='localhost'||host==='127.0.0.1'||
 /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.localhost$/i.test(host);

export function trustedCanvasUrl(value,{allowInsecureLocal=false,allowedHosts=[]}={}){
 let url;
 try{url=new URL(value);}catch{throw new Error('CANVAS_UNTRUSTED_CONFIGURATION_URL');}
 if(url.username||url.password||url.hash||!['http:','https:'].includes(url.protocol)||
    url.port&&url.protocol==='https:'&&url.port!=='443')
  throw new Error('CANVAS_UNTRUSTED_CONFIGURATION_URL');
 const host=url.hostname.toLowerCase();
 const extra=Array.isArray(allowedHosts)&&allowedHosts.some(value=>
  typeof value==='string'&&value.trim().toLowerCase()===host);
 if(url.protocol==='http:'){
  if(!allowInsecureLocal||!localCanvasHost(host))
   throw new Error('CANVAS_HTTPS_REQUIRED');
 }else if(!officialCanvasHost(host)&&!extra&&
          !(allowInsecureLocal&&localCanvasHost(host))){
  throw new Error('CANVAS_HOST_NOT_TRUSTED');
 }
 return url;
}

export function canvasDynamicRegistrationBody(baseUrl){
 const origin=new URL(baseUrl);
 if(!['https:','http:'].includes(origin.protocol)||origin.href!==origin.origin+'/'||
    origin.username||origin.password)throw new Error('P2LRN_ORIGIN_REQUIRED');
 const base=origin.origin;
 return {
  application_type:'web',
  client_name:'P2LRN',
  client_uri:base,
  grant_types:['client_credentials','implicit'],
  initiate_login_uri:base+'/lti/login',
  redirect_uris:[base+'/lti/launch',base+'/lti/deep-link'],
  response_types:['id_token'],
  jwks_uri:base+'/lti/jwks',
  token_endpoint_auth_method:'private_key_jwt',
  scope:SCOPES.join(' '),
  [CONFIG_CLAIM]:{
   domain:origin.hostname,
   target_link_uri:base+'/lti/launch',
   description:'Cursos, lecciones y actividades P2LRN',
   claims:['sub','iss','name','email','locale'],
   messages:[
    {type:'LtiDeepLinkingRequest',label:'Seleccionar contenido P2LRN',
     target_link_uri:base+'/lti/deep-link',
     placements:['assignment_selection','link_selection'],
     preferred_presentation:'iframe',iframe:{width:1050,height:800}}
   ],
   'https://canvas.instructure.com/lti/privacy_level':'public',
   'https://canvas.instructure.com/lti/tool_id':'org.p2lrn.lti'
  }
 };
}

async function readJsonResponse(fetchImpl,url,options,label){
 const reply=await fetchImpl(url,{
  ...options,redirect:'error',signal:AbortSignal.timeout(12000)
 });
 if(!reply.ok)throw new Error(label+'_UNAVAILABLE');
 const length=Number(reply.headers?.get?.('content-length')||0);
 if(length>MAX_JSON_BYTES)throw new Error(label+'_TOO_LARGE');
 const bytes=new Uint8Array(await reply.arrayBuffer());
 if(bytes.byteLength>MAX_JSON_BYTES)throw new Error(label+'_TOO_LARGE');
 try{
  const json=JSON.parse(new TextDecoder().decode(bytes));
  if(!json||typeof json!=='object'||Array.isArray(json))
   throw new Error('object expected');
  return json;
 }catch{throw new Error(label+'_INVALID_JSON');}
}

export async function installCanvasDynamicRegistration({
 openidConfiguration,registrationToken,baseUrl,fetchImpl,
 allowInsecureLocal=false,allowedHosts=[],registerPlatform
}){
 const remoteFetch=fetchImpl??((url,options)=>pinnedLmsFetch(url,options,{allowInsecureLoopback:allowInsecureLocal}));
 if(typeof remoteFetch!=='function'||typeof registerPlatform!=='function')
  throw new TypeError('Canvas registration requires trusted fetch and durable registration');
 if(typeof registrationToken!=='string'||registrationToken.length<16||
    registrationToken.length>8192||/[\r\n]/.test(registrationToken))
  throw new Error('CANVAS_REGISTRATION_TOKEN_REQUIRED');
 const allowed={allowInsecureLocal,allowedHosts};
 const oidc=trustedCanvasUrl(openidConfiguration,allowed);
 const authHeaders={Authorization:'Bearer '+registrationToken};
 const config=await readJsonResponse(remoteFetch,oidc.toString(),
  {method:'GET',headers:authHeaders},'CANVAS_OIDC');
 const issuer=trustedCanvasUrl(config.issuer,allowed);
 const auth=trustedCanvasUrl(config.authorization_endpoint,allowed);
 const token=trustedCanvasUrl(config.token_endpoint,allowed);
 const jwksUrl=trustedCanvasUrl(config.jwks_uri,allowed);
 const endpoint=trustedCanvasUrl(config.registration_endpoint,allowed);
 trustedLmsJwksUrl(jwksUrl.href,{issuer:issuer.origin,authUrl:auth.href,tokenUrl:token.href},{allowInsecureLoopback:allowInsecureLocal});
 if(issuer.username||issuer.password||issuer.search||issuer.hash)
  throw new Error('CANVAS_UNTRUSTED_ISSUER');
 // A registration token must never be sent to a host unrelated to the
 // discoverable Canvas installation that issued the token.
 if(endpoint.origin!==oidc.origin)
  throw new Error('CANVAS_REGISTRATION_HOST_MISMATCH');
 const jwks=await readJsonResponse(remoteFetch,jwksUrl.toString(),
  {method:'GET'},'CANVAS_JWKS');
 if(!Array.isArray(jwks.keys)||jwks.keys.length===0||jwks.keys.length>50||
    jwks.keys.some(k=>k?.kty!=='RSA'||typeof k.kid!=='string'||
      typeof k.n!=='string'||k.n.length<300||typeof k.e!=='string'||
      k.alg&&k.alg!=='RS256'))
  throw new Error('CANVAS_INVALID_SIGNING_KEYS');
 const posted=await readJsonResponse(remoteFetch,endpoint.toString(),
  {method:'POST',headers:{...authHeaders,'Content-Type':'application/json'},
   body:JSON.stringify(canvasDynamicRegistrationBody(baseUrl))},'CANVAS_REGISTRATION');
 const clientId=String(posted.client_id??'');
 if(!clientId.trim()||clientId.length>512||clientId==='undefined')
  throw new Error('CANVAS_CLIENT_ID_MISSING');
 const suffix=createHash('sha256').update(issuer.toString()+'|'+clientId).digest('hex').slice(0,28);
 const platform={
  id:'canvas-dr-'+suffix,tenantId:'canvas-'+suffix,
  issuer:issuer.origin,clientId,authUrl:auth.toString(),
  launchUrl:new URL('/lti/launch',baseUrl).toString(),
  deepLinkLaunchUrl:new URL('/lti/deep-link',baseUrl).toString(),
  tokenUrl:token.toString(),jwksUrl:jwksUrl.href,jwks,
  deployments:[CANVAS_PENDING_DEPLOYMENT],
  deepLinkReturnOrigins:[issuer.origin],
  status:'ACTIVE'
 };
 // Persist only after Canvas accepted the registration. No credentials are
 // retained. New deployment IDs are trusted only after a verified signed JWT.
 await registerPlatform(platform);
 return {registrationId:platform.id,tenantId:platform.tenantId,
  clientId:platform.clientId,issuer:platform.issuer};
}