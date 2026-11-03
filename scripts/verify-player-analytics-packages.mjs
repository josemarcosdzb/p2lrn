import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const analyticsRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..','packages','analytics');
const playerRoot=resolve(analyticsRoot,'..','player');
function run(command,args,{cwd=analyticsRoot}={}){
  if(process.platform==='win32'&&command==='npm'){
    const cli=join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
    if(existsSync(cli))return spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8'});
  }
  return spawnSync(command,args,{cwd,encoding:'utf8'});
}
function mustRun(command,args,options={}){
  const result=run(command,args,options);
  assert.equal(result.status,0,
    ['Command: '+command+' '+args.join(' '),result.stderr,result.stdout].filter(Boolean).join('\n'));
  return result;
}
const tmp=mkdtempSync(join(tmpdir(),'p2lrn-player-analytics-pack-'));
try{
  const archives=[];
  for(const root of [playerRoot,analyticsRoot]){
    mustRun('npm',['pack',root,'--pack-destination',tmp,'--silent'],{cwd:tmp});
    const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
    const name=pkg.name.replace('@','').replace('/','-')+'-'+pkg.version+'.tgz';
    const archive=join(tmp,name);
    assert(existsSync(archive),'Missing packed archive: '+archive);
    archives.push(archive);
    console.log('PACKED '+pkg.name+' '+pkg.version);
  }
  const project=join(tmp,'app');
  mkdirSync(project);
  writeFileSync(join(project,'package.json'),'{"type":"module","private":true}\n');
  mustRun('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund',
    '--no-save','--omit=optional',...archives],{cwd:project});
  const probe=[
    "globalThis.HTMLElement=class extends EventTarget { attachShadow(){return {replaceChildren(){}};} };",
    "const registered=new Map();globalThis.customElements={get:n=>registered.get(n),define:(n,v)=>registered.set(n,v)};",
    "if(!globalThis.crypto){const {webcrypto}=await import('node:crypto');globalThis.crypto=webcrypto;}",
    "const player=await import('@p2lrn/player');",
    "const analytics=await import('@p2lrn/analytics');",
    "const model=await import('@p2lrn/analytics/results');",
    "const server=await import('@p2lrn/player/server/results');",
    "if(!registered.get('p2lrn-player')||!registered.get('p2lrn-analytics')||",
    "   typeof player.createPlayerAnalyticsSession!=='function'||",
    "   typeof player.createHttpResultHost!=='function'||",
    "   typeof analytics.loadAnalyticsResultSource!=='function'||",
    "   typeof model.analyticsDatasetFromResultFiles!=='function'||",
    "   typeof server.createP2LRNResultsHttpHandler!=='function')process.exit(2);",
    "const el=Object.assign(new EventTarget(),{packageId:'test-course',contentRoot:'sha256:'+'a'.repeat(64)});",
    "let persisted=null;",
    "const host={async loadCurrent(){return null;},async saveResult(result){persisted=result;return {saved:true};}};",
    "const session=await player.createPlayerAnalyticsSession(el,{",
    "  identity:{mode:'platform',issuer:'test.school',subjectId:'alice'},courseId:'test-course',host",
    "});",
    "const event=new Event('p2lrn:score');event.detail={score:7,maxScore:10};el.dispatchEvent(event);",
    "const intermediate=await session.checkpoint();",
    "if(intermediate.attempt.status!=='in_progress'||persisted.attempt.status!=='in_progress')process.exit(3);",
    "const result=await session.finish();session.stop();",
    "if(result.attempt.status!=='submitted'||persisted.attempt.status!=='submitted')process.exit(4);",
    "const dataset=await model.analyticsDatasetFromResultFiles([result]);",
    "if(dataset.learners.length!==1||dataset.attempts.length!==1)process.exit(5);",
    "console.log('PLAYER_AND_ANALYTICS_NPM_INTEROP_OK');",
  ].join('\n');
  const loaded=mustRun(process.execPath,['--input-type=module','-e',probe],{cwd:project});
  process.stdout.write(loaded.stdout);
}finally{
  rmSync(tmp,{recursive:true,force:true});
}
