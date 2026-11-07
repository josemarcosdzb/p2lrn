// Shared conservative HTTP assessment for the real LMS connectivity inventory.
// This is not LTI certification or proof of a learner session.
import {createHash} from 'node:crypto';

const digest=s=>createHash('sha256').update(s).digest('hex');
const limited=(s,n)=>String(s??'').slice(0,n);

function redirectPath(location,requestedUrl){
 if(!location)return null;
 try{
  const u=new URL(location,requestedUrl);
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;
  return u.origin+u.pathname; // Never emit session tokens or other query strings.
 }catch{return null;}
}

export function classifyLmsResponse({status,body='',mediaType='',location=null,requestedUrl='http://localhost/',expected='page'}){
 if(!Number.isInteger(status)||status<100||status>599)throw new TypeError('Invalid HTTP status');
 if(!['page','health','jwks'].includes(expected))throw new TypeError('Unknown expected LMS response');
 const payload=typeof body==='string'?body:Buffer.from(body??'').toString('utf8');
 const bodyLength=Buffer.byteLength(payload);
 const media=String(mediaType||'').split(';')[0].trim().toLowerCase();
 const isJson=media==='application/json'||media.endsWith('+json');
 let json=null;
 if(bodyLength>0&&isJson){
  try{json=JSON.parse(payload);}catch{}
 }
 const healthValid=!!json&&json.status==='ok'&&json.standalone===true&&json.provider==='P2LRN LTI 1.3';
 const keys=Array.isArray(json?.keys)?json.keys:[];
 // Key material here must be public; never include the full JWKS in reports.
 const jwksValid=keys.length>0&&keys.every(k=>k&&typeof k==='object'&&k.kty==='RSA'&&
  typeof k.n==='string'&&k.n.length>20&&typeof k.e==='string'&&k.e.length>0&&!('d' in k));
 const title=payload.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  ?.replace(/\s+/g,' ').trim()||null;
 let classification;
 if(status>=300&&status<400)classification='REDIRECT_ONLY';
 else if(status<200||status>=300)classification='HTTP_ERROR';
 else if(bodyLength===0)classification='EMPTY_HTTP_RESPONSE';
 else if(expected==='health'&&!healthValid)classification='INVALID_LTI_HEALTH';
 else if(expected==='jwks'&&!jwksValid)classification='INVALID_PUBLIC_JWKS';
 else classification=expected==='page'?'HTTP_CONTENT_PRESENT':'LTI_ENDPOINT_VALID';
 const payloadObserved=classification==='HTTP_CONTENT_PRESENT'||classification==='LTI_ENDPOINT_VALID';
 return {
  status,mediaType:media,bodyLength,bodySha256:digest(payload),title:limited(title,120),
  redirectTarget:redirectPath(location,requestedUrl),classification,payloadObserved,
  ltiHealthOk:expected==='health'?healthValid:null,
  jwksKeys:expected==='jwks'&&jwksValid?keys.length:null
 };
}

export function connectivityState({direct,proxy}){
 if(direct?.classification==='HTTP_CONTENT_PRESENT')return 'HTTP_CONTENT_OBSERVED_NOT_AUTHENTICATED';
 if(proxy?.classification==='HTTP_CONTENT_PRESENT')return 'PROXY_CONTENT_OBSERVED_NOT_AUTHENTICATED';
 if(direct?.classification==='EMPTY_HTTP_RESPONSE'||proxy?.classification==='EMPTY_HTTP_RESPONSE')
  return 'EMPTY_HTTP_RESPONSE';
 if(direct?.classification==='REDIRECT_ONLY'||proxy?.classification==='REDIRECT_ONLY')
  return 'HTTP_REDIRECT_ONLY';
 if(direct?.reached||proxy?.reached)return 'HTTP_ERROR_OR_INVALID_RESPONSE';
 return 'UNREACHABLE';
}
