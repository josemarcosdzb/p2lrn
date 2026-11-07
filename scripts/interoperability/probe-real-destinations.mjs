// Interoperability LAB - connectivity inventory, NOT a substitute for student E2E.
// Non-destructive; no authentication, no registration, no forged LTI launch.
// Data from the actual Windows host, never a fake platform emulation.
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {request as httpRequest} from 'node:http';
const startedAt=new Date().toISOString();
const output=resolve(process.env.P2LRN_INTEROP_OUTPUT||join(process.cwd(),'.interop-evidence'));
const limit=(text,n=240)=>String(text??'').slice(0,n);
const sha=(value)=>createHash('sha256').update(value).digest('hex');
const labs=[
  {id:'moodle',url:'http://jose-moodle-qa-20261017.localhost',source:'integration/lms/README.md'},
  {id:'chamilo',url:'http://chamilojose.localhost',source:'integration/lms/README.md'},
  {id:'sakai',url:'http://josesakai.localhost',source:'integration/lms/README.md'},
  {id:'canvas',url:process.env.P2LRN_QA_CANVAS_URL||null,source:'environment variable P2LRN_QA_CANVAS_URL'},
  {id:'openedx',url:process.env.P2LRN_QA_OPENEDX_URL||null,source:'environment variable P2LRN_QA_OPENEDX_URL'},
  {id:'independent-web',url:process.env.P2LRN_QA_WEB_URL||null,source:'environment variable P2LRN_QA_WEB_URL'},
];
async function request(url,{expectJson=false}={}){
  try{
    const parsed=new URL(url);
    if(!['http:','https:'].includes(parsed.protocol))throw new Error('Unsafe transport');
    if(parsed.username||parsed.password)throw new Error('Credentials in URL not allowed');
    const response=await fetch(parsed,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(7000),headers:{Accept:expectJson?'application/json':'text/html,application/json;q=0.8'}});
    const media=response.headers.get('content-type')?.split(';')[0]||'';
    const body=await response.text();
    const title=body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].replace(/\s+/g,' ').trim()||null;
    const json=expectJson&&media.includes('json')?JSON.parse(body):null;
    return {
      reached:true,status:response.status,mediaType:media,redirectTarget:response.headers.get('location')||null,
      title:limit(title,120),bodySha256:sha(body),bodyLength:body.length,
      ltiHealthOk:expectJson?json?.status==='ok'&&json?.standalone===true&&json?.provider==='P2LRN LTI 1.3':null,
      jwksKeys:expectJson&&Array.isArray(json?.keys)?json.keys.length:null,
    };
  }catch(error){
    return {reached:false,error:limit(error?.cause?.code||error?.code||error?.name||String(error),130),
      detail:limit(error?.cause?.message||error?.message||String(error),210)};
  }
}
async function viaLoopbackProxy(url,{expectJson=false}={}){
  const target=new URL(url);
  if(target.protocol!=='http:'||!target.hostname.endsWith('.localhost'))return {skipped:true,reason:'Not a documented local proxy URL'};
  return new Promise(resolve=>{
    const req=httpRequest({hostname:'127.0.0.1',port:Number(target.port||80),path:target.pathname+target.search,
      method:'GET',headers:{Host:target.host,Accept:expectJson?'application/json':'text/html'},timeout:5500},response=>{
        const parts=[];let count=0;
        response.on('data',chunk=>{count+=chunk.length;if(count<=1024*1024)parts.push(chunk);});
        response.on('end',()=>{
          const body=Buffer.concat(parts).toString('utf8');
          let json=null;try{json=expectJson?JSON.parse(body):null;}catch{}
          resolve({reached:true,via:'127.0.0.1:80+Host',requestedHost:target.host,
            status:response.statusCode,bodySha256:sha(body),title:(body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]||null),
            ltiHealthOk:expectJson?json?.status==='ok'&&json?.provider==='P2LRN LTI 1.3':null,
            jwksKeys:expectJson&&Array.isArray(json?.keys)?json.keys.length:null});
        });
      });
    req.on('timeout',()=>req.destroy(new Error('HTTP_TIMEOUT')));
    req.on('error',error=>resolve({reached:false,via:'127.0.0.1:80+Host',error:limit(error.code||error.message,130)}));
    req.end();
  });
}
const cases=[];
for(const lab of labs){
  const result={id:lab.id,source:lab.source,address:lab.url??null,contentSha256:null,
    state:lab.url?'UNVERIFIED':'NOT_CONFIGURED',studentLaunch:'NOT_TESTED',gradePassback:'NOT_TESTED'};
  if(lab.url){
    result.ui=await request(lab.url);
    if(!result.ui.reached)result.proxyProbe=await viaLoopbackProxy(lab.url);
    result.state=result.ui.reached?'HTTP_ONLY_REACHED':result.proxyProbe?.reached?'HOST_ROUTED_ONLY':'UNREACHABLE';
    if(['moodle','chamilo','sakai'].includes(lab.id)){
      result.p2lrnHealth=await request(new URL('/lti/health',lab.url),{expectJson:true});
      if(!result.p2lrnHealth.reached)result.p2lrnProxyHealth=await viaLoopbackProxy(new URL('/lti/health',lab.url),{expectJson:true});
      const jwks=await request(new URL('/lti/jwks',lab.url),{expectJson:true});
      result.jwks={reached:jwks.reached,status:jwks.status??null,keys:jwks.jwksKeys??null,error:jwks.error??null};
      if(!jwks.reached)result.jwksProxy=await viaLoopbackProxy(new URL('/lti/jwks',lab.url),{expectJson:true});
    }
  }
  cases.push(result);
}
const loopback=await request('http://p2lrn-lti.localhost/lti/health',{expectJson:true});
const preflight={
  schema:'https://p2lrn.org/schema/interoperability-real-qa/1',
  purpose:'ACTUAL_WINDOWS_NETWORK_DISCOVERY_NOT_END_TO_END_CERTIFICATION',
  startedAt,finishedAt:new Date().toISOString(),branch:process.env.GITHUB_REF_NAME||'mejorastudio',
  commit:process.env.GITHUB_SHA||null,node:process.version,platform:process.platform,
  firstPartyLtiProvider:loopback,cases,artifacts:[],
  PASS_DESTINATIONS:0,
  note:'HTTP reachability and JWKS availability do not prove valid registration, LTI login, learner session, results, AGS or course package identity.',
};
await mkdir(output,{recursive:true});
const report=join(output,'real-destination-preflight.json');
await writeFile(report,JSON.stringify(preflight,null,2)+'\n');
console.log('P2LRN_REAL_DESTINATION_PREFLIGHT='+JSON.stringify(preflight));
console.log('P2LRN_REAL_DESTINATION_PREFLIGHT_FILE='+report);
