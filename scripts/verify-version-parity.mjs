import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const installation=join(root,'.npm-pack-gate','install','node_modules','@p2lrn');
const local=process.env.USERPROFILE?join(process.env.USERPROFILE,'P2LRN-local-4183','site'):null;
const out=join(root,'.npm-pack-gate','version-parity.json');
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
async function get(file){
  if(!file)return {exists:false};
  try{
    const buffer=await readFile(file);
    return {exists:true,bytes:buffer.length,sha256:sha(buffer),text:buffer.toString('utf8')};
  }catch(e){
    if(e?.code==='ENOENT')return {exists:false};
    return {exists:false,error:String(e)};
  }
}
async function http(path){
  try{
    const response=await fetch('http://127.0.0.1:4183/'+path,{cache:'no-store',signal:AbortSignal.timeout(8500)});
    if(!response.ok)return {status:response.status,error:'HTTP non-success'};
    const body=Buffer.from(await response.arrayBuffer());
    return {status:response.status,sha256:sha(body),bytes:body.length,cacheControl:response.headers.get('cache-control')};
  }catch(e){return {error:String(e)};}
}
async function version(path){
  const value=await get(path);
  if(!value.exists)return null;
  try{return JSON.parse(value.text).version??null;}catch{return null;}
}
const tests=[
  {id:'rosco',source:'packages/toolkit/web/renderers/questionnaire-rosco.js',npm:'player/dist/renderers/questionnaire-rosco.js',local:'player/current/dist/renderers/questionnaire-rosco.js',markers:['p2lrn-rosco-center','p2lrn-rosco-progress','Math.cos(theta)']},
  {id:'crossword',source:'packages/toolkit/web/renderers/questionnaire-crossword.js',npm:'player/dist/renderers/questionnaire-crossword.js',local:'player/current/dist/renderers/questionnaire-crossword.js',markers:['p2lrn-crossword-clue','p2lrn-crossword-cell','--p2lrn-crossword-columns']},
  {id:'game-css',source:'packages/toolkit/web/questionnaire-games.css',npm:'player/dist/questionnaire-games.css',local:'player/current/dist/questionnaire-games.css',markers:['.p2lrn-rosco-center','.p2lrn-crossword-cell','.p2lrn-crossword-clue']},
  {id:'game-styles-loader',source:'packages/toolkit/web/renderers/game-common.js',npm:'player/dist/renderers/game-common.js',local:'player/current/dist/renderers/game-common.js',markers:['gameStyleUrl.search']},
  {id:'player-styles-loader',source:'packages/toolkit/web/p2lrn-player.js',npm:'player/dist/p2lrn-player.js',local:'player/current/dist/p2lrn-player.js',markers:['playerStyleUrl.search']},
  {id:'3d-engine',source:'packages/toolkit/web/renderers/questionnaire-3d.js',npm:'player/dist/renderers/questionnaire-3d.js',local:'player/current/dist/renderers/questionnaire-3d.js',markers:['Three','Rapier']},
  {id:'authoring-game',source:'packages/toolkit/web/studio/new-document.js',npm:'toolkit/web/studio/new-document.js',markers:['3d-matching','3d-classification']},
];
const results=[];
for(const item of tests){
  const sources={
    github:await get(join(root,item.source)),
    npm:await get(join(installation,item.npm)),
    local:await get(local&&item.local?join(local,item.local):null),
  };
  const features={};
  for(const [channel,file] of Object.entries(sources)){
    features[channel]=Object.fromEntries(item.markers.map(marker=>[marker,file.exists?file.text.includes(marker):null]));
    delete file.text;
  }
  const summary={
    id:item.id,features,sources,
    npmMatchesGitHub:sources.npm.exists&&sources.github.exists?sources.npm.sha256===sources.github.sha256:null,
    localMatchesGitHub:sources.local.exists&&sources.github.exists?sources.local.sha256===sources.github.sha256:null,
    localMatchesNpm:sources.local.exists&&sources.npm.exists?sources.local.sha256===sources.npm.sha256:null,
  };
  if(item.local)summary.localHttp=await http(item.local);
  if(summary.localHttp?.sha256 && sources.local.exists)summary.httpMatchesLocalFile=summary.localHttp.sha256===sources.local.sha256;
  results.push(summary);
  console.log('P2LRN_PARITY_ITEM='+JSON.stringify({
    id:summary.id,npmMatchesGitHub:summary.npmMatchesGitHub,
    localMatchesGitHub:summary.localMatchesGitHub,
    httpMatchesLocalFile:summary.httpMatchesLocalFile,
    features:summary.features,localHttpStatus:summary.localHttp?.status??null,
  }));
}
const [npmPlayer,npmStudio,mainPlayer,mainStudio]=await Promise.all([
 version(join(installation,'player','package.json')),
 version(join(installation,'studio','package.json')),
 version(join(root,'packages','player','package.json')),
 version(join(root,'packages','studio','package.json')),
]);
const viewer=await http('demo/');
const studio=await http('studio/');
const home=await http('');
const sourceRevision=process.env.GITHUB_SHA??null;
const comparison={
  recordedAt:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID??null,
  gitHead:sourceRevision,versions:{npmPlayer,npmStudio,mainPlayer,mainStudio},
  context:{npm:'fresh registry.npmjs.org install, exact 0.5.0-alpha.10',github:'checked-out main at recorded SHA',local:'read-only localhost:4183 and on-disk site'},
  pages:{home,viewer,studio},
  results,
  summary:{
    compared:results.length,
    npmEqualSource:results.filter(x=>x.npmMatchesGitHub===true).length,
    localEqualSource:results.filter(x=>x.localMatchesGitHub===true).length,
    localServedVerified:results.filter(x=>x.httpMatchesLocalFile===true).length,
    npmSourceDifferences:results.filter(x=>x.npmMatchesGitHub===false).map(x=>x.id),
    localSourceDifferences:results.filter(x=>x.localMatchesGitHub===false).map(x=>x.id),
    localUnavailable:results.filter(x=>x.localMatchesGitHub===null&&x.sources.github.exists).map(x=>x.id),
  }
};
await mkdir(join(root,'.npm-pack-gate'),{recursive:true});
await writeFile(out,JSON.stringify(comparison,null,2)+'\n');
if(process.env.USERPROFILE){
  const archive=join(process.env.USERPROFILE,'Downloads','p2lrn-validation','parity-'+(process.env.GITHUB_RUN_ID??'manual'));
  await mkdir(archive,{recursive:true});
  await writeFile(join(archive,'three-way-parity.json'),JSON.stringify(comparison,null,2)+'\n');
  console.log('P2LRN_PARITY_ARCHIVE='+archive);
}
console.log('P2LRN_PARITY_SUMMARY='+JSON.stringify(comparison.summary));
console.log('P2LRN_PARITY_NOT_A_PASS_CERTIFICATE=true');
