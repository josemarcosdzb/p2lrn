// Interoperability LAB - connectivity inventory, NOT a substitute for student E2E.
// Non-destructive; no authentication, no registration, no forged LTI launch.
// Data from the actual Windows host, never a fake platform emulation.
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
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

// Read-only diagnostics of the already-running QA installation. No credentials,
// container configuration, process restarts, ports, or resources are changed.
async function inspectExistingLmsContainers(){
 const run=promisify(execFile);
 try{
  const {stdout}=await run('docker',['ps','--all','--format','{{.Names}}|{{.State}}|{{.Status}}'],{
   timeout:8000,windowsHide:true,maxBuffer:256*1024
  });
  const relevant=/moodle|chamilo|sakai|canvas|edx|caddy|ingress|p2lrn|lti|tutor|^aulap2p-(api|backend)/i;
  const services=stdout.split(/\r?\n/).map(row=>row.trim()).filter(Boolean)
   .map(row=>{const [name,state,status]=row.split('|');return {name,state,status};})
   .filter(row=>relevant.test(row.name)).slice(0,80);
  const resources={hostTotalBytes:null,hostFreeBytes:null,dockerMemoryBytes:null,
   runningMemoryUsage:[],stoppedOpenEdx:[]};
  const os=await import('node:os');
  resources.hostTotalBytes=os.totalmem();resources.hostFreeBytes=os.freemem();
  try{
   const info=await run('docker',['info','--format','{{.MemTotal}}'],{
    timeout:5000,windowsHide:true,maxBuffer:8192});
   const bytes=Number(info.stdout.trim());
   if(Number.isSafeInteger(bytes)&&bytes>=0)resources.dockerMemoryBytes=bytes;
  }catch{}
  try{
   const stats=await run('docker',['stats','--no-stream','--format','{{.Name}}|{{.MemUsage}}'],{
    timeout:12000,windowsHide:true,maxBuffer:128*1024});
   resources.runningMemoryUsage=stats.stdout.split(/\r?\n/).filter(Boolean)
    .map(row=>{const [name,memory]=row.split('|');return {name,memory};})
    .filter(row=>relevant.test(row.name)).slice(0,30);
  }catch{}
  for(const row of services.filter(row=>row.name.startsWith('openedx-')&&row.state!=='running').slice(0,14)){
   try{
    const details=await run('docker',['inspect','--format',
     '{{.State.ExitCode}}|{{.State.OOMKilled}}|{{.HostConfig.RestartPolicy.Name}}',
     row.name],{timeout:4000,windowsHide:true,maxBuffer:8192});
    const [exitCode,oomKilled,restartPolicy]=details.stdout.trim().split('|');
    resources.stoppedOpenEdx.push({name:row.name,exitCode:Number(exitCode),oomKilled:oomKilled==='true',restartPolicy});
   }catch{resources.stoppedOpenEdx.push({name:row.name,inspect:'UNAVAILABLE'});}
  }
  // The Docker bridge and active Caddy route are checked without reading
  // container secrets or changing networking.
  const topology={networks:[],caddyOpenEdxRoutes:[],caddyConfigPresent:false};
  for(const name of ['aulap2p-ingress-local','p2lrn-lti-provider',
   'openedx-josemarcosdiaz-caddy-1','openedx-josemarcosdiaz-lms-1']){
   try{
    const item=await run('docker',['inspect','--format','{{json .NetworkSettings.Networks}}',name],{
     timeout:4000,windowsHide:true,maxBuffer:64*1024});
    const nets=JSON.parse(item.stdout.trim()||'{}');
    topology.networks.push({name,networks:Object.keys(nets||{}).sort()});
   }catch{topology.networks.push({name,networks:[],inspect:'UNAVAILABLE'});}
  }
  try{
   const config=await run('docker',['exec','aulap2p-ingress-local','cat','/etc/caddy/Caddyfile'],{
    timeout:5000,windowsHide:true,maxBuffer:256*1024});
   topology.caddyConfigPresent=true;
   const rows=config.stdout.split(/\r?\n/).map(x=>x.trim());
   topology.caddyImports=rows.filter(x=>/^import\s+/.test(x)).slice(0,12).map(x=>x.slice(0,180));
   // Only expose route names/targets, never raw proxy configuration or headers.
   topology.caddyOpenEdxRoutes=rows.filter(x=>
    /josemarcosdiaz|openedx-josemarcosdiaz|p2lrn-lti-provider/i.test(x))
    .slice(0,30).map(x=>x.slice(0,180).replace(/[;#].*$/,'').trim());
  }catch{}
  try{
   const network=await run('docker',['network','inspect','openedx-josemarcosdiaz_default'],{
    timeout:5000,windowsHide:true,maxBuffer:256*1024});
   const d=JSON.parse(network.stdout)[0];
   topology.openEdxNetwork={
    exists:true,driver:d?.Driver??null,internal:d?.Internal===true,
    members:Object.values(d?.Containers??{}).map(x=>String(x.Name||''))
     .filter(name=>/openedx|ingress|p2lrn/i.test(name)).slice(0,20)
   };
  }catch(e){topology.openEdxNetwork={exists:false,reason:limit(e.code||e.message,100)};}
  try{
   let raw;
   try{
    raw=await run('docker',['exec','aulap2p-ingress-local','wget','-qO-',
     'http://127.0.0.1:2019/config/'],{
     timeout:7000,windowsHide:true,maxBuffer:3*1024*1024});
   }catch{
    raw=await run('docker',['exec','aulap2p-ingress-local','curl','-fsS',
     'http://127.0.0.1:2019/config/'],{
     timeout:7000,windowsHide:true,maxBuffer:3*1024*1024});
   }
   const loaded=JSON.parse(raw.stdout);
   const servers=loaded?.apps?.http?.servers??{};
   const hostRouting=[];
   function findRoutes(value){
    if(!value||typeof value!=='object')return;
    if(Array.isArray(value)){for(const item of value)findRoutes(item);return;}
    const host=Array.isArray(value.match)?
     [...new Set(value.match.flatMap(m=>Array.isArray(m?.host)?m.host:[]))]:[];
    if(host.length){
     const h=host.filter(x=>/localhost$/i.test(String(x))||x==='*');
     if(h.length)hostRouting.push(...h.map(x=>String(x)));
    }
    for(const item of Object.values(value))findRoutes(item);
   }
   findRoutes(servers);
   topology.caddyLiveConfig={
    available:true,servers:Object.keys(servers),
    matchedHosts:[...new Set(hostRouting)].filter(x=>
     /josemarcosdiaz|moodle|chamilo|sakai|canvas|josemarcos|p2lrn/i.test(x)).slice(0,45),
    openEdxMentioned:JSON.stringify(servers).toLowerCase().includes('josemarcosdiaz'),
    routeCount:hostRouting.length
   };
  }catch(e){topology.caddyLiveConfig={available:false,reason:limit(e.code||e.message,130)};}
  topology.existingCaddyRoutes=[];
  try{
   const listing=await run('docker',['exec','aulap2p-ingress-local','sh','-c',
    'ls -1 /etc/caddy/routes /etc/caddy/tenants 2>/dev/null'],{
    timeout:6000,windowsHide:true,maxBuffer:64*1024});
   topology.existingCaddyRoutes=listing.stdout.split(/\r?\n/).filter(x=>/\.caddy$/.test(x))
    .map(x=>x.trim()).slice(0,65);
  }catch{}
  resources.topology=topology;
  return {available:true,services,resources};
 }catch(e){
  return {available:false,reason:limit(e.code||e.message,110)};
 }
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
const existingServiceInventory=await inspectExistingLmsContainers();
const preflight={
  schema:'https://p2lrn.org/schema/interoperability-real-qa/1',
  purpose:'ACTUAL_WINDOWS_NETWORK_DISCOVERY_NOT_END_TO_END_CERTIFICATION',
  startedAt,finishedAt:new Date().toISOString(),branch:process.env.GITHUB_REF_NAME||'mejorastudio',
  commit:process.env.GITHUB_SHA||null,node:process.version,platform:process.platform,
  firstPartyLtiProvider:loopback,firstPartyLtiProviderViaProxy:loopbackProxy,cases,artifacts:[],
  existingServiceInventory,
  PROVIDER_ROUTE_CHECKS_READY:cases.filter(c=>c.id!=='independent-web'&&c.providerTransportReady).length,
  PASS_DESTINATIONS:0,
  note:'HTTP reachability and JWKS availability do not prove valid registration, LTI login, learner session, results, AGS or course package identity.',
};
await mkdir(output,{recursive:true});
const report=join(output,'real-destination-preflight.json');
await writeFile(report,JSON.stringify(preflight,null,2)+'\n');
console.log('P2LRN_REAL_DESTINATION_PREFLIGHT='+JSON.stringify(preflight));
console.log('P2LRN_REAL_DESTINATION_PREFLIGHT_FILE='+report);
