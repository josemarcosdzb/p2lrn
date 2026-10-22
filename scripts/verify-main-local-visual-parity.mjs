import {createServer} from 'node:http';
import {cp,mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {dirname,extname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runChromePageGate,findChrome} from './verify-browser-from-npm.mjs';
import {createP2LRNStudioDocument} from '../packages/toolkit/web/studio/new-document.js';
import {exportP2LRNPackage} from '../packages/toolkit/web/studio/package-export.js';
import {buildQuestionnaireGame} from '../packages/toolkit/web/questionnaire-games-core.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const gate=join(root,'.npm-pack-gate');
const samples=['rosco','crossword','3d','3d-matching','3d-classification','fill-blanks'];
const manifest=join(gate,'three-way-browser-qa.json');
const demo=join(root,'scripts','fixtures','npm-native-game-visual.html');
const channels=[
  {name:'github-main',source:join(root,'packages','player','dist')},
  {name:'running-local-files',source:process.env.USERPROFILE?join(process.env.USERPROFILE,'P2LRN-local-4183','site','player','current','dist'):null},
  {name:'public-npm',source:join(gate,'install','node_modules','@p2lrn','player','dist')},
];
const mime={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.json':'application/json','.p2lrn':'application/vnd.p2lrn.package','.wasm':'application/wasm','.png':'image/png'};
async function fileExists(path){
  try{return (await stat(path)).isFile();}
  catch{return false;}
}
function staticServer(base){
  return createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
      const relative=pathname==='/'?'index.html':pathname.replace(/^\/+/u,'');
      const file=resolve(base,relative);
      if(!file.startsWith(base+sep)&&file!==join(base,'index.html'))throw Error('Outside QA fixture');
      const data=await readFile(file);
      res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});
      res.end(data);
    }catch(error){
      res.writeHead(404,{'Content-Type':'text/plain','Cache-Control':'no-store'});
      res.end(String(error?.message??'Missing resource'));
    }
  });
}
async function listen(server){
  return new Promise((resolvePromise,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolvePromise(server.address().port));
  });
}
const fixture=[];
for(const kind of samples){
  try{
    const doc=createP2LRNStudioDocument({title:'QA comparativa '+kind,language:'es'});
    const unit=doc.children(doc.rootId)[0];
    if(!unit)throw Error('No unit');
    const activity=doc.addGame(unit.id,{kind,title:'Actividad '+kind,language:'es'});
    const record=await doc.readQuestionnaire(activity.id);
    const renderer=activity.extensions?.['https://p2lrn.org/ext/renderer-preference/1']?.preferred;
    const compiled=buildQuestionnaireGame(record.payload,renderer,{seedSource:'same-package-threeway'});
    if(!compiled.compatible)throw Error('Main failed to build '+kind+': '+JSON.stringify(compiled.reasons));
    const exported=await exportP2LRNPackage(doc);
    fixture.push({kind,node:activity.id,renderer,bytes:exported.bytes});
  }catch(error){
    fixture.push({kind,fixtureError:String(error?.stack??error).slice(0,1200)});
  }
}
const results=[];
const chrome=await findChrome();
for(const channel of channels){
  const base=join(gate,'three-way-browsers',channel.name);
  if(!channel.source||!(await fileExists(join(channel.source,'p2lrn.js')))){
    results.push({channel:channel.name,status:'UNAVAILABLE',reason:'The Player distribution was not found; no false local-pass'});
    continue;
  }
  await mkdir(join(base,'native'),{recursive:true});
  await cp(channel.source,join(base,'player','current','dist'),{recursive:true,force:true});
  await cp(demo,join(base,'index.html'));
  for(const item of fixture)if(item.bytes)await writeFile(join(base,'native',item.kind+'.p2lrn'),item.bytes);
  const server=staticServer(base);
  let port=null;
  try{
    port=await listen(server);
    for(const item of fixture){
      if(!item.bytes){
        results.push({channel:channel.name,kind:item.kind,status:'BUILD_FAIL',details:item.fixtureError});
        continue;
      }
      const query=new URLSearchParams({channel:channel.name,kind:item.kind,src:'/native/'+item.kind+'.p2lrn',node:item.node});
      const url='http://127.0.0.1:'+port+'/?'+query;
      try{
        const result=await runChromePageGate(chrome,url,join(gate,'threeway-profile-'+channel.name+'-'+item.kind),
          {timeoutMs:29000,screenshotName:'threeway-'+channel.name+'-'+item.kind});
        let detail=null;try{detail=JSON.parse(result.detail??'{}')?.detail;}catch{}
        const status=result.status==='PASS'&&result.mobile?.overflow>2?'MOBILE_OVERFLOW':result.status;
        const row={channel:channel.name,kind:item.kind,status,fixtureBytes:item.bytes.length,
          detail,mobile:result.mobile,shot:result.screenshot,mobileShot:result.mobileScreenshot,
          browserErrors:result.browserLogs.filter(x=>x.level==='error').slice(0,6),
          exceptions:result.runtimeExceptions.slice(0,5)};
        results.push(row);
      }catch(error){
        results.push({channel:channel.name,kind:item.kind,status:'RUN_FAIL',details:String(error?.stack??error).slice(0,1300)});
      }
      console.log('THREEWAY_VISUAL_RESULT='+JSON.stringify(results[results.length-1]));
    }
  }finally{
    if(port!==null)await new Promise(ok=>server.close(ok));
  }
}
const matrix=Object.fromEntries(samples.map(kind=>[kind,Object.fromEntries(channels.map(ch=>[
  ch.name,results.find(r=>r.kind===kind&&r.channel===ch.name)?.status??'NOT_RUN',
]))]));
const report={date:new Date().toISOString(),gitSha:process.env.GITHUB_SHA??null,
  runId:process.env.GITHUB_RUN_ID??null,scope:'same bytes and same node ID for GitHub main, local disk and npm',
  caveat:'Running-local-files copies only the Player currently installed at localhost; network file parity is checked separately.',
  channels:channels.map(ch=>ch.name),samples:samples.map(k=>({kind:k,bytes:fixture.find(e=>e.kind===k)?.bytes?.length??null})),
  matrix,results};
await mkdir(gate,{recursive:true});
await writeFile(manifest,JSON.stringify(report,null,2)+'\n');
if(process.env.USERPROFILE){
  const evidence=join(process.env.USERPROFILE,'Downloads','p2lrn-validation','threeway-'+(process.env.GITHUB_RUN_ID??'manual'));
  await mkdir(evidence,{recursive:true});
  await writeFile(join(evidence,'threeway-browser-qa.json'),JSON.stringify(report,null,2)+'\n');
  console.log('THREEWAY_VISUAL_ARCHIVE='+evidence);
}
console.log('THREEWAY_VISUAL_MATRIX='+JSON.stringify(matrix));
const mainFailures=results.filter(x=>x.channel==='github-main'&&x.status!=='PASS');
const localFailures=results.filter(x=>x.channel==='running-local-files'&&x.status!=='PASS');
console.log('THREEWAY_MAIN_FAILURES='+JSON.stringify(mainFailures.map(x=>({kind:x.kind,status:x.status}))));
console.log('THREEWAY_LOCAL_FAILURES='+JSON.stringify(localFailures.map(x=>({kind:x.kind,status:x.status}))));
if(mainFailures.length||localFailures.length)process.exitCode=1;
