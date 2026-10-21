import {createHash} from 'node:crypto';
import {copyFile,mkdir,readFile,readdir,rm,stat} from 'node:fs/promises';
import {dirname,join,relative,resolve} from 'node:path';
import {reviseSiteBrowserAssets} from '../deploy/netlify/browser-site-revision.mjs';
import {copyCanonicalRuntime,validateLocalReferences,writeRelease} from '../packages/player/scripts/build-dist.mjs';

// Synchronize the canonical Player source as a unit, then refresh every browser
// module URL. Preserve the homepage, old files and a rollback manifest.
const profile=process.env.USERPROFILE;
if(!profile)throw new Error('Windows USERPROFILE is required');
const repo=resolve(import.meta.dirname,'..');
const site=join(profile,'P2LRN-local-4183','site');
const dist=join(site,'player','current','dist');
const htmlPath=join(site,'demo','index.html');
const sourceHtml=await readFile(join(repo,'deploy','netlify','site','demo','index.html'),'utf8');
const htmlBefore=await readFile(htmlPath,'utf8');
if(!sourceHtml.includes('/player/current/dist/p2lrn.js') ||
   !htmlBefore.includes('/player/current/dist/p2lrn.js')){
  throw Error('The viewer entrypoint was customized; refusing to replace the local page.');
}
const live=await fetch('http://127.0.0.1:4183/demo/?preflight='+Date.now(),{cache:'no-store'});
if(live.status!==200 || !(await live.text()).includes('id="demo-player"')){
  throw Error('Port 4183 does not serve the expected P2LRN demo');
}
const run=process.env.GITHUB_RUN_ID ?? 'manual';
const backup=join(profile,'Downloads','p2lrn-validation','local-demo-revision',run);
const staged=join(backup,'source-stage');
await mkdir(staged,{recursive:true});
await copyCanonicalRuntime(staged);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function walk(dir){
  const result=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,entry.name);
    if(entry.isDirectory())result.push(...await walk(path));
    else if(entry.isFile())result.push(path);
  }
  return result;
}
async function loadOrNull(path){
  try{return await readFile(path);}
  catch(e){if(e?.code==='ENOENT')return null;throw e;}
}
const stagedFiles=(await walk(staged)).sort();
const differences=[];
for(const stagedPath of stagedFiles){
  const rel=relative(staged,stagedPath);
  const target=join(dist,rel);
  const [before,canonical]=await Promise.all([loadOrNull(target),readFile(stagedPath)]);
  if(!before?.equals(canonical)){
    differences.push({rel,target,source:stagedPath,before,sourceHash:hash(canonical)});
  }
}
for(const [file,marker] of [
  ['renderers/questionnaire-rosco.js','p2lrn-rosco-center'],
  ['renderers/game-common.js','gameStyleUrl.search'],
  ['questionnaire-games.css','p2lrn-rosco-layout'],
  ['p2lrn-player.js','playerStyleUrl.search'],
]){
  const stagedSource=await readFile(join(staged,...file.split('/')),'utf8');
  if(!stagedSource.includes(marker))throw Error('Canonical runtime is missing '+marker+' in '+file);
}
const version=JSON.parse(await readFile(join(repo,'packages','player','package.json'),'utf8')).version;
const toolkitVersion=JSON.parse(await readFile(join(repo,'packages','toolkit','package.json'),'utf8')).version;
if(version!==toolkitVersion)throw Error('Player/Toolkit versions differ; aborting synchronization');
const demoBackup=join(backup,'demo-index-before.html');
await copyFile(htmlPath,demoBackup);
const releasePath=join(dist,'release.json');
const originalRelease=await loadOrNull(releasePath);
if(originalRelease)await copyFile(releasePath,join(backup,'release-before.json'));
for(const {rel,target,before} of differences){
  if(!before)continue;
  const copyTo=join(backup,'runtime-before',rel);
  await mkdir(dirname(copyTo),{recursive:true});
  await copyFile(target,copyTo);
}
console.log('LOCAL_PLAYER_SOURCE_DIFFERENCES='+JSON.stringify(differences.map(x=>x.rel)));
console.log('LOCAL_PLAYER_BACKUP='+backup);
const applied=[];
try{
  for(const entry of differences){
    await mkdir(dirname(entry.target),{recursive:true});
    await copyFile(entry.source,entry.target);
    applied.push(entry);
  }
  await validateLocalReferences(dist);
  await writeRelease(dist,version,toolkitVersion);
  const revised=await reviseSiteBrowserAssets({siteRoot:site,htmlFiles:[htmlPath]});
  const html=await readFile(htmlPath,'utf8');
  const roscoPath='/player/current/dist/renderers/questionnaire-rosco.js';
  if(!html.includes(roscoPath+'?v='+revised.runtimeRevision))throw Error('Rosco import lacks revision');
  if(!html.includes('/player/current/dist/p2lrn.js?v='+revised.runtimeRevision))throw Error('Player loader lacks revision');
  for(const [file,marker] of [
    ['renderers/questionnaire-rosco.js','p2lrn-rosco-center'],
    ['renderers/game-common.js','gameStyleUrl.search'],
    ['questionnaire-games.css','p2lrn-rosco-layout'],
    ['p2lrn-player.js','playerStyleUrl.search'],
  ]){
    const localFile=join(dist,...file.split('/'));
    const canonical=join(staged,...file.split('/'));
    const [localBytes,sourceBytes]=await Promise.all([readFile(localFile),readFile(canonical)]);
    if(!localBytes.equals(sourceBytes)||!localBytes.toString('utf8').includes(marker)){
      throw Error('Local runtime did not synchronize '+file);
    }
  }
  const response=await fetch('http://127.0.0.1:4183/demo/?revision='+revised.runtimeRevision,{cache:'no-store'});
  const served=await response.text();
  if(response.status!==200 || !served.includes(roscoPath+'?v='+revised.runtimeRevision)){
    throw Error('The running site did not serve the corrected viewer HTML');
  }
  console.log('LOCAL_VIEWER_PREVIOUS_VERSIONING='+JSON.stringify({
    hadImportMap:htmlBefore.includes('<script type="importmap">'),
    hadVersionedPlayer:/\/player\/current\/dist\/p2lrn\.js\?v=/u.test(htmlBefore),
  }));
  console.log('LOCAL_VIEWER_REVISION='+revised.runtimeRevision);
  console.log('LOCAL_VIEWER_CHANGED_PAGES='+JSON.stringify(revised.changes));
  console.log('LOCAL_PLAYER_CANONICAL_FILES_SYNCHRONIZED='+differences.length);
  console.log('LOCAL_VIEWER_HTTP_CACHE_CONTROL='+response.headers.get('cache-control'));
  console.log('LOCAL_PLAYER_AND_VIEWER_SYNC_PASS');
}catch(error){
  for(const entry of applied.reverse()){
    if(entry.before){
      const previous=join(backup,'runtime-before',entry.rel);
      await copyFile(previous,entry.target);
    }else{
      await rm(entry.target,{force:true}).catch(()=>{});
    }
  }
  if(originalRelease)await copyFile(join(backup,'release-before.json'),releasePath);
  else await rm(releasePath,{force:true}).catch(()=>{});
  await copyFile(demoBackup,htmlPath);
  console.error('LOCAL_PLAYER_SYNC_ROLLBACK_COMPLETE');
  throw error;
}
