import {createServer} from 'node:http';
import {cp,mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {dirname,extname,join,resolve,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {runChromePageGate,findChrome} from './verify-browser-from-npm.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const gate=join(root,'.npm-pack-gate');
const packages=join(gate,'install','node_modules','@p2lrn');
const site=join(gate,'independent-native-qa');
const reportFile=join(gate,'public-npm-native-visual.json');
const kinds=['rosco','crossword','memory','matching','ordering','classification','true-false','fill-blanks','word-search','3d','3d-matching','3d-classification'];
const importLocal=async path=>import(pathToFileURL(path).href);
const mime={'.js':'text/javascript; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.p2lrn':'application/vnd.p2lrn.package','.png':'image/png','.wasm':'application/wasm'};
async function writeFixture(kind){
  const toolkit=join(packages,'toolkit','web');
  const {createP2LRNStudioDocument}=await importLocal(join(toolkit,'studio','new-document.js'));
  const {exportP2LRNPackage}=await importLocal(join(toolkit,'studio','package-export.js'));
  const {buildQuestionnaireGame}=await importLocal(join(toolkit,'questionnaire-games-core.js'));
  const doc=createP2LRNStudioDocument({title:'Prueba real npm '+kind,language:'es'});
  const unit=doc.children(doc.rootId)[0];
  if(!unit)throw Error('Cannot create unit for '+kind);
  const activity=doc.addGame(unit.id,{kind,title:'Actividad '+kind,language:'es'});
  const question=await doc.readQuestionnaire(activity.id);
  const renderer=activity.extensions?.['https://p2lrn.org/ext/renderer-preference/1']?.preferred;
  const expected=buildQuestionnaireGame(question.payload,renderer,{seedSource:'npm-independent-visual-qa'});
  if(!expected.compatible)throw Error('Published Studio generated incompatible '+kind+': '+JSON.stringify(expected.reasons));
  const exported=await exportP2LRNPackage(doc);
  if(!exported?.bytes?.byteLength)throw Error('Generated game export is empty');
  const filename=kind+'.p2lrn';
  await writeFile(join(site,'native',filename),exported.bytes);
  return {kind,filename,node:activity.id,bytes:exported.bytes.byteLength,renderer};
}
async function serve(req,res){
  try{
    const uri=new URL(req.url,'http://127.0.0.1');
    let name=decodeURIComponent(uri.pathname);
    if(name==='/'||name==='')name='/index.html';
    const file=resolve(site,'.'+name);
    if(!file.startsWith(site+sep)&&file!==join(site,'index.html'))throw Error('Path outside root');
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(data);
  }catch(error){
    res.writeHead(404,{'Content-Type':'text/plain'});
    res.end(String(error?.message??'Missing file'));
  }
}
async function main(){
  const playerDist=join(packages,'player','dist');
  if(!(await stat(join(playerDist,'p2lrn.js'))).isFile())throw Error('Public npm Player distribution is missing');
  await mkdir(join(site,'native'),{recursive:true});
  await cp(playerDist,join(site,'player','current','dist'),{recursive:true,force:true});
  await cp(join(root,'scripts','fixtures','npm-native-game-visual.html'),join(site,'index.html'));
  const fixture=[];
  const results=[];
  const browsers=[];
  for(const kind of kinds){
    try{const made=await writeFixture(kind);fixture.push(made);}
    catch(error){
      results.push({kind,status:'BUILD_FAIL',error:String(error?.stack??error).slice(0,1250)});
    }
  }
  const server=createServer((req,res)=>{void serve(req,res);});
  const port=await new Promise((ok,fail)=>{
    server.once('error',fail);
    server.listen(0,'127.0.0.1',()=>ok(server.address().port));
  });
  try{
    const chrome=await findChrome();
    console.log('INDEPENDENT_NATIVE_BROWSER='+chrome);
    for(let i=0;i<fixture.length;i++){
      const entry=fixture[i];
      const query=new URLSearchParams({kind:entry.kind,src:'/native/'+entry.filename,node:entry.node});
      const url='http://127.0.0.1:'+port+'/?'+query;
      const screenshotName='native-npm-'+entry.kind;
      try{
        const data=await runChromePageGate(chrome,url,join(gate,'native-qa-profile-'+i),
          {timeoutMs:27000,screenshotName});
        let payload=null;
        try{payload=JSON.parse(data.detail??'{}');}catch{}
        const metrics=payload?.detail??null;
        const mobile=data.mobile??null;
        const status=data.status==='PASS'&&!(mobile?.overflow>2)?'PASS':data.status==='PASS'?'MOBILE_OVERFLOW':data.status;
        results.push({kind:entry.kind,status,node:entry.node,bytes:entry.bytes,renderer:entry.renderer,
          desktop:metrics,mobile,screenshot:data.screenshot,mobileScreenshot:data.mobileScreenshot,
          consoleErrors:data.browserLogs.filter(log=>log.level==='error').slice(0,5),
          exceptions:data.runtimeExceptions.slice(0,5)});
      }catch(error){
        results.push({kind:entry.kind,status:'RUN_FAIL',error:String(error?.message??error).slice(0,1400)});
      }
      console.log('NATIVE_GAME_AUDIT='+JSON.stringify(results[results.length-1]));
    }
  }finally{
    await new Promise(ok=>server.close(ok));
  }
  const defects=results.filter(entry=>entry.status!=='PASS');
  const output={version:'0.5.0-alpha.10',channel:'public-npm',browser:'isolated-Windows-Chrome',
    total:kinds.length,passed:results.filter(entry=>entry.status==='PASS').length,
    defects,results,checkedAt:new Date().toISOString()};
  await writeFile(reportFile,JSON.stringify(output,null,2)+'\n');
  console.log('PUBLIC_NPM_NATIVE_VISUAL_SUMMARY='+JSON.stringify({
    total:output.total,passed:output.passed,defects:output.defects.map(entry=>({kind:entry.kind,status:entry.status,error:entry.error?.slice(0,220),desktop:entry.desktop})),
  }));
  if(defects.length)process.exitCode=1;
}
main().catch(error=>{
  console.error('PUBLIC_NPM_NATIVE_VISUAL_FATAL='+String(error?.stack??error));
  process.exitCode=1;
});