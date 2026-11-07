// Interoperability LAB - connectivity inventory, NOT a substitute for student E2E.
// Non-destructive; no authentication, no registration, no forged LTI launch.
// Data from the actual Windows host, never a fake platform emulation.
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {classifyLmsResponse,connectivityState} from './lms-http-inspection.mjs';
const startedAt=new Date().toISOString();
const output=resolve(process.env.P2LRN_INTEROP_OUTPUT||join(process.cwd(),'.interop-evidence'));
const limit=(text,n=240)=>String(text??'').slice(0,n);
const sha=(value)=>createHash('sha256').update(value).digest('hex');
const labs=[
  {id:'moodle',url:process.env.P2LRN_QA_MOODLE_URL||'http://jose-moodle-qa-20261017.localhost',source:'integration/lms/README.md or P2LRN_QA_MOODLE_URL'},
  {id:'chamilo',url:process.env.P2LRN_QA_CHAMILO_URL||'http://chamilojose.localhost',source:'integration/lms/README.md or P2LRN_QA_CHAMILO_URL'},
  {id:'sakai',url:process.env.P2LRN_QA_SAKAI_URL||'http://josesakai.localhost',source:'integration/lms/README.md or P2LRN_QA_SAKAI_URL'},
  {id:'canvas',url:process.env.P2LRN_QA_CANVAS_URL||'http://josemarcos.localhost',source:'AulaP2P local ingress or P2LRN_QA_CANVAS_URL'},
  {id:'openedx',url:process.env.P2LRN_QA_OPENEDX_URL||'http://josemarcosdiaz.localhost',source:'AulaP2P local ingress or P2LRN_QA_OPENEDX_URL'},
  {id:'independent-web',url:process.env.P2LRN_QA_WEB_URL||null,source:'environment variable P2LRN_QA_WEB_URL'},
];
const MAX_RESPONSE_BYTES=2*1024*1024;
const safeUrl=value=>{
 const parsed=value instanceof URL?new URL(value):new URL(String(value));
 if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.hash)
  throw new Error('Unsafe LMS URL');
 return parsed;
};
const expectedFor=options=>options.expectJwks?'jwks':options.expectJson?'health':'page';

async function request(url,options={}){
 try{
  const parsed=safeUrl(url);
  const response=await fetch(parsed,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(7000),
   headers:{Accept:options.expectJson||options.expectJwks?'application/json':'text/html,application/json;q=0.8'}});
  const declaredLength=Number(response.headers.get('content-length')||0);
  if(declaredLength>MAX_RESPONSE_BYTES){
   await response.body?.cancel().catch(()=>{});
   return {reached:true,status:response.status,classification:'OVERSIZED_RESPONSE',payloadObserved:false,
    bodyLength:null,error:'RESPONSE_TOO_LARGE'};
  }
  const content=await response.text();
  if(Buffer.byteLength(content)>MAX_RESPONSE_BYTES)return {
   reached:true,status:response.status,classification:'OVERSIZED_RESPONSE',payloadObserved:false,
   bodyLength:Buffer.byteLength(content),error:'RESPONSE_TOO_LARGE'};
  return {reached:true,...classifyLmsResponse({
   status:response.status,body:content,mediaType:response.headers.get('content-type'),
   location:response.headers.get('location'),requestedUrl:parsed.href,expected:expectedFor(options)
  })};
 }catch(error){
  return {reached:false,error:limit(error?.cause?.code||error?.code||error?.name||String(error),130),
   detail:limit(error?.cause?.message||error?.message||String(error),210)};
 }
}

async function viaLoopbackProxy(url,options={}){
 let target;
 try{target=safeUrl(url)}catch{return {skipped:true,reason:'Invalid LMS URL'};}
 if(target.protocol!=='http:'||!(/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.localhost$/i).test(target.hostname))
  return {skipped:true,reason:'Not a documented local proxy URL'};
 const port=Number(target.port||80);
 if(!Number.isInteger(port)||port<1||port>65535)return {skipped:true,reason:'Invalid proxy port'};
 return new Promise(resolve=>{
  let finished=false;
  const done=x=>{if(!finished){finished=true;resolve(x);}};
  const via='127.0.0.1:'+port+'+Host';
  const req=httpRequest({hostname:'127.0.0.1',port,path:target.pathname+target.search,
   method:'GET',headers:{Host:target.host,Accept:options.expectJson||options.expectJwks?
    'application/json':'text/html'},timeout:5500},response=>{
    const parts=[];let count=0;
    response.on('data',chunk=>{
     count+=chunk.length;
     if(count>MAX_RESPONSE_BYTES){
      response.destroy();
      done({reached:true,via,status:response.statusCode,classification:'OVERSIZED_RESPONSE',
       payloadObserved:false,error:'RESPONSE_TOO_LARGE'});
      return;
     }
     parts.push(chunk);
    });
    response.on('error',e=>done({reached:false,via,error:limit(e.code||e.message,130)}));
    response.on('end',()=>{
     if(finished)return;
     const body=Buffer.concat(parts).toString('utf8');
     done({reached:true,via,requestedHost:target.host,...classifyLmsResponse({
      status:response.statusCode,body,mediaType:response.headers['content-type'],
      location:response.headers.location,requestedUrl:target.href,expected:expectedFor(options)
     })});
    });
  });
  req.on('timeout',()=>req.destroy(new Error('HTTP_TIMEOUT')));
  req.on('error',error=>done({reached:false,via,error:limit(error.code||error.message,130)}));
  req.end();
 });
}

const cases=[];
for(const lab of labs){
  const result={id:lab.id,source:lab.source,address:lab.url??null,contentSha256:null,
    state:lab.url?'UNVERIFIED':'NOT_CONFIGURED',studentLaunch:'NOT_TESTED',gradePassback:'NOT_TESTED'};
  if(lab.url){
    result.ui=await request(lab.url);
    if(!result.ui.payloadObserved)result.proxyProbe=await viaLoopbackProxy(lab.url);
    result.state=connectivityState({direct:result.ui,proxy:result.proxyProbe});
    if(lab.id!=='independent-web'){
      result.p2lrnHealth=await request(new URL('/lti/health',lab.url),{expectJson:true});
      if(!result.p2lrnHealth.payloadObserved)result.p2lrnProxyHealth=await viaLoopbackProxy(new URL('/lti/health',lab.url),{expectJson:true});
      const jwks=await request(new URL('/lti/jwks',lab.url),{expectJwks:true});
      if(!jwks.payloadObserved)result.jwksProxy=await viaLoopbackProxy(new URL('/lti/jwks',lab.url),{expectJwks:true});
      const preferredJwks=jwks.payloadObserved?jwks:result.jwksProxy?.payloadObserved?result.jwksProxy:jwks;
      result.jwks={reached:preferredJwks.reached,status:preferredJwks.status??null,
        keys:preferredJwks.jwksKeys??null,classification:preferredJwks.classification??null,
        viaProxy:preferredJwks===result.jwksProxy,error:preferredJwks.error??null};
      result.providerTransportReady=Boolean(
        (result.p2lrnHealth.ltiHealthOk===true||result.p2lrnProxyHealth?.ltiHealthOk===true)&&
        result.jwks.classification==='LTI_ENDPOINT_VALID');
    }
  }
  cases.push(result);
}
const loopback=await request('http://p2lrn-lti.localhost/lti/health',{expectJson:true});
const loopbackProxy=loopback.payloadObserved?null:await viaLoopbackProxy('http://p2lrn-lti.localhost/lti/health',{expectJson:true});
const preflight={
  schema:'https://p2lrn.org/schema/interoperability-real-qa/1',
  purpose:'ACTUAL_WINDOWS_NETWORK_DISCOVERY_NOT_END_TO_END_CERTIFICATION',
  startedAt,finishedAt:new Date().toISOString(),branch:process.env.GITHUB_REF_NAME||'mejorastudio',
  commit:process.env.GITHUB_SHA||null,node:process.version,platform:process.platform,
  firstPartyLtiProvider:loopback,firstPartyLtiProviderViaProxy:loopbackProxy,cases,artifacts:[],
  PROVIDER_ROUTE_CHECKS_READY:cases.filter(c=>c.id!=='independent-web'&&c.providerTransportReady).length,
  PASS_DESTINATIONS:0,
  note:'HTTP reachability and JWKS availability do not prove valid registration, LTI login, learner session, results, AGS or course package identity.',
};
await mkdir(output,{recursive:true});
const report=join(output,'real-destination-preflight.json');
await writeFile(report,JSON.stringify(preflight,null,2)+'\n');
console.log('P2LRN_REAL_DESTINATION_PREFLIGHT='+JSON.stringify(preflight));
console.log('P2LRN_REAL_DESTINATION_PREFLIGHT_FILE='+report);
