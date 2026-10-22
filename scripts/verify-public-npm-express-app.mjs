import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {runChromePageGate,findChrome} from './verify-browser-from-npm.mjs';

const execFileAsync=promisify(execFile);
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const gate=join(repo,'.npm-pack-gate');
const install=join(gate,'install');
const host=join(install,'express-host-qa');
const nodeModules=join(install,'node_modules');
const packages=join(nodeModules,'@p2lrn');
const reportPath=join(gate,'public-npm-express-integration.json');
const fileExists=async path=>(await stat(path).catch(()=>null))?.isFile()??false;
const hash=value=>createHash('sha256').update(value).digest('hex');

async function npmCli(){
  if(process.platform!=='win32')return {command:'npm',prefix:[]};
  const candidates=[process.env.npm_execpath,join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js')].filter(Boolean);
  for(const candidate of candidates)if(await fileExists(candidate))return {command:process.execPath,prefix:[candidate]};
  throw Error('npm-cli.js missing on Windows');
}
async function main(){
  for(const name of ['player','studio','toolkit','h5p-libraries'])
    assert(await fileExists(join(packages,name,'package.json')),'Public npm package is not installed: '+name);
  const publicVersion=JSON.parse(await readFile(join(packages,'studio','package.json'),'utf8')).version;
  await mkdir(host,{recursive:true});
  await writeFile(join(host,'package.json'),JSON.stringify({
    name:'p2lrn-express-host-e2e',private:true,type:'module',
    dependencies:{express:'5.1.0','@p2lrn/studio':publicVersion,'@p2lrn/player':publicVersion},
  },null,2));
  if(!await fileExists(join(nodeModules,'express','package.json'))){
    const {command,prefix}=await npmCli();
    await execFileAsync(command,[...prefix,'install','--no-audit','--no-fund','--ignore-scripts',
      '--save-exact','--registry=https://registry.npmjs.org','express@5.1.0'],{
      cwd:install,timeout:240000,maxBuffer:1024*1024,
    });
    console.log('EXPRESS_PUBLIC_PACKAGE_INSTALLED=5.1.0');
  }
  const cli=join(packages,'studio','bin','p2lrn-studio.mjs');
  const setupRun=await execFileAsync(process.execPath,[cli,'setup','express','--cwd',host,'--course-path','courses'],{
    cwd:install,timeout:90000,maxBuffer:1024*1024,
  });
  const setup=JSON.parse(setupRun.stdout);
  assert.equal(setup.target,'express');
  assert(setup.generatedEndpoints.save&&setup.generatedEndpoints.reader&&setup.generatedEndpoints.import,
    'CLI did not generate all Express routes');
  const route=join(host,'p2lrn-setup','express-route.mjs');
  assert(await fileExists(route),'Generated Express adapter is missing');
  const {default:express}=await import(pathToFileURL(join(nodeModules,'express','index.js')).href);
  const {installP2LRNStudio}=await import(pathToFileURL(route).href);
  const app=express();
  app.disable('x-powered-by');
  const channel=process.argv.find(arg=>arg.startsWith('--channel='))?.slice('--channel='.length)??'public-npm';
  if(!['public-npm','staged-tarball'].includes(channel))throw Error('Unsupported tested distribution channel '+channel);
  const output={version:publicVersion,channel,integration:'Express 5.1.0',setupFiles:setup.files,
    productionAuthCaveat:'Host auth/origin middleware is a simulated QA gate; the generated Studio routes do not implement application authentication.',
    checks:[],browser:null};
  let port=0;
  const getOrigin=()=> 'http://127.0.0.1:'+port;
  app.use('/api/p2lrn/studio',(req,res,next)=>{
    const role=/\bqa_session=([^;]+)/u.exec(String(req.headers.cookie??''))?.[1] ?? null;
    if(!role)return res.status(401).json({error:'Unauthenticated'});
    if(role!=='editor')return res.status(403).json({error:'Unauthorized course edit'});
    if(req.headers.origin!==getOrigin())return res.status(403).json({error:'Invalid request origin'});
    next();
  });
  const prevCwd=process.cwd();
  process.chdir(host);
  installP2LRNStudio(app);
  app.use('/studio/current/dist',express.static(join(packages,'studio','dist'),{fallthrough:false}));
  app.use('/player/current/dist',express.static(join(packages,'player','dist'),{fallthrough:false}));
  app.use('/courses',express.static(join(host,'courses'),{fallthrough:false}));
  app.get('/favicon.ico',(_,res)=>res.status(204).end());
  const html=await readFile(join(repo,'scripts','fixtures','npm-express-host.html'),'utf8');
  app.get('/',(_,res)=>res.type('html').send(html));
  const server=app.listen(0,'127.0.0.1');
  port=await new Promise((done,fail)=>{
    server.once('listening',()=>done(server.address().port));
    server.once('error',fail);
  });
  try{
    const original=await readFile(join(repo,'examples','canonical','minimal-course.p2lrn'));
    const send=async(kind,{cookie,from=getOrigin(),bytes=original,
       mime='application/octet-stream',filename='integration-course.p2lrn'}={})=>{
      const headers={'content-type':mime,origin:from,'x-p2lrn-filename':filename};
      if(cookie)headers.cookie='qa_session='+cookie;
      const result=await fetch(getOrigin()+'/api/p2lrn/studio/'+kind,{method:'POST',headers,body:bytes});
      const returned=Buffer.from(await result.arrayBuffer());
      let json=null;try{json=JSON.parse(returned.toString('utf8'));}catch{}
      return {status:result.status,bytes:returned,json};
    };
    for(const operation of ['save','read','import']){
      const unauth=await send(operation);
      const learner=await send(operation,{cookie:'learner'});
      const foreign=await send(operation,{cookie:'editor',from:'https://foreign.invalid'});
      assert.equal(unauth.status,401,operation+' should require a session');
      assert.equal(learner.status,403,operation+' should authorize editor');
      assert.equal(foreign.status,403,operation+' should check same-origin requests');
      output.checks.push({operation,anonymous:unauth.status,learner:learner.status,foreignOrigin:foreign.status});
    }
    const saved=await send('save',{cookie:'editor'});
    assert.equal(saved.status,200);
    assert.equal(saved.json?.ok,true);
    const bytes=await readFile(join(host,'courses',saved.json.filename));
    assert.equal(hash(bytes),hash(original),'Stored course differs from source');
    output.checks.push({operation:'authorized-save',status:200,bytes:bytes.length,sha256:hash(bytes)});
    const traversal=await send('save',{cookie:'editor',filename:'../../unsafe.p2lrn'});
    assert.equal(traversal.status,200);
    assert.equal(traversal.json?.filename,'unsafe.p2lrn','Client path traversal was not normalized');
    output.checks.push({operation:'filename-sanitization',status:200,filename:traversal.json.filename});
    const markdown=Buffer.from('# Express Reader\n\nEste documento se importa mediante Studio.');
    const reader=await send('read',{cookie:'editor',bytes:markdown,
      filename:'lesson.md',mime:'text/markdown'});
    assert.equal(reader.status,200,'Express Reader must parse Markdown');
    assert.equal(reader.json?.source?.detectedType,'MARKDOWN');
    output.checks.push({operation:'authorized-reader',status:200,sourceType:'MARKDOWN'});
    const invalid=await send('import',{cookie:'editor',bytes:Buffer.from('invalid zip'),
      filename:'invalid.zip',mime:'application/zip'});
    output.checks.push({operation:'invalid-import',status:invalid.status,expectedStatus:422});
    if(invalid.status!==422)output.defects=[{code:'GENERATED_EXPRESS_IMPORT_INVALID_RESPONSE',status:invalid.status}];
    const chrome=await findChrome();
    const vis=await runChromePageGate(chrome,getOrigin()+'/',join(gate,'express-host-profile'),{
      timeoutMs:50000,screenshotName:'npm-express-host',
    });
    if(vis.status!=='PASS')throw Error('Express host Studio visual integration failed: '+
      JSON.stringify({status:vis.status,detail:vis.detail,errors:vis.runtimeExceptions}).slice(0,4500));
    const details=JSON.parse(vis.detail)?.detail;
    assert(details?.integrity,'Express browser did not validate persisted content');
    if(vis.mobile?.overflow>2)throw Error('Express browser mobile layout overflows');
    output.browser={status:'PASS',screenshot:vis.screenshot,mobileScreenshot:vis.mobileScreenshot,
      mobile:vis.mobile,filename:details.course,bytes:details.bytes,
      contentRoot:details.integrity,jsExceptions:vis.runtimeExceptions.length};
    output.status=output.defects?.length?'DEGRADED':'PASS';
  }catch(error){
    output.status='FAIL';
    output.error=String(error?.stack??error).slice(0,4000);
    process.exitCode=1;
  }finally{
    await new Promise(done=>server.close(done));
    process.chdir(prevCwd);
  }
  await writeFile(reportPath,JSON.stringify(output,null,2)+'\n');
  console.log('EXPRESS_HOST_E2E_REPORT='+JSON.stringify(output));
  if(output.status!=='PASS')process.exitCode=1;
}
main().catch(error=>{
  console.error('EXPRESS_HOST_E2E_FATAL='+String(error?.stack??error).slice(0,4000));
  process.exitCode=1;
});