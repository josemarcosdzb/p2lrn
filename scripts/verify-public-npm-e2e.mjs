import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {access, mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const execFileAsync=promisify(execFile);
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const gate=join(root,'.npm-pack-gate');
const install=join(gate,'install');
const cache=join(gate,'public-registry-cache');
const copiedRuntime=join(gate,'copied-runtime');
const registry='https://registry.npmjs.org';
const packages=['h5p-libraries','toolkit','player','studio'];
const output=join(gate,'public-npm-report.json');

async function npmCommand() {
  if(process.platform!=='win32')return ['npm',[]];
  const candidates=[
    process.env.npm_execpath,
    join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js'),
  ].filter(Boolean);
  for(const candidate of candidates){
    try{if((await stat(candidate)).isFile())return [process.execPath,[candidate]];}catch{}
  }
  throw new Error('Could not locate npm-cli.js for reliable Windows invocation.');
}

async function execute(command,args,{cwd=install,maxBuffer=16*1024*1024}={}){
  const result=await execFileAsync(command,args,{cwd,maxBuffer,timeout:300000});
  return result.stdout;
}

async function runNpm(args) {
  const [command,prefix]=await npmCommand();
  const stdout=await execute(command,[...prefix,...args]);
  console.log('NPM',args[0],stdout.slice(-3000));
  return stdout;
}

async function requireFile(relative){
  const file=join(install,'node_modules','@p2lrn',...relative.split('/'));
  const info=await stat(file);
  assert(info.isFile()&&info.size>0,'Expected non-empty published file: '+file);
}

async function verify(){
  const manifests=await Promise.all(packages.map(async name=>
    JSON.parse(await readFile(join(root,'packages',name,'package.json'),'utf8'))
  ));
  const versions=[...new Set(manifests.map(pkg=>pkg.version))];
  assert.equal(versions.length,1,'Release versions are not aligned');
  const version=versions[0];
  assert.match(version,/^\d+\.\d+\.\d+-[0-9A-Za-z.-]+$/u,'Public npm release gate expects an exact prerelease version');

  // No packed local archives or reused modules/caches are allowed in this gate.
  await rm(gate,{recursive:true,force:true,maxRetries:3,retryDelay:250});
  await mkdir(install,{recursive:true});
  await writeFile(join(install,'package.json'),JSON.stringify({
    name:'p2lrn-public-registry-e2e',
    version:'1.0.0',
    private:true,
    type:'module',
  },null,2)+'\n');

  await runNpm([
    'install',
    '--ignore-scripts','--no-audit','--no-fund','--save-exact',
    '--registry='+registry,'--cache='+cache,'--prefer-online',
    ...packages.map(name=>'@p2lrn/'+name+'@'+version),
  ]);
  await runNpm(['ls','--depth=0']);

  const lock=JSON.parse(await readFile(join(install,'package-lock.json'),'utf8'));
  const proof=[];
  for(const name of packages){
    const qualified='@p2lrn/'+name;
    const entry=lock.packages?.['node_modules/'+qualified];
    assert(entry,'Missing lockfile entry for '+qualified);
    assert.equal(entry.version,version,'Wrong npm version for '+qualified);
    assert(typeof entry.resolved==='string','No published tarball URL for '+qualified);
    const url=new URL(entry.resolved);
    assert.equal(url.protocol,'https:','Insecure npm download for '+qualified);
    assert.equal(url.hostname,'registry.npmjs.org','Non-public npm source for '+qualified);
    assert.equal(url.port,'','Unexpected registry port for '+qualified);
    assert(!url.username&&!url.password,'Unexpected registry credentials for '+qualified);
    assert(/^sha(512|384|256)-[A-Za-z0-9+/=]+$/.test(String(entry.integrity??'')),
      'Missing public tarball integrity for '+qualified);
    const installed=JSON.parse(await readFile(join(install,'node_modules','@p2lrn',name,'package.json'),'utf8'));
    assert.equal(installed.name,qualified);
    assert.equal(installed.version,version);
    proof.push({name:qualified,version,resolved:url.href,integrity:entry.integrity});
    console.log('PUBLIC_NPM_PACKAGE_VERIFIED',qualified+'@'+version,url.href);
  }

  for(const filename of [
    'toolkit/dist/cli/main.js',
    'toolkit/dist/cli/document-reader.js',
    'toolkit/dist/document-reader/index.js',
    'studio/dist/p2lrn-studio.js',
    'studio/dist/p2lrn-studio.esm.js',
    'studio/server/index.mjs',
    'player/dist/p2lrn.js',
    'player/dist/runtime-host/h5p.html',
    'player/dist/runtime-host/scorm.html',
    'player/bin/p2lrn-copy-runtime.mjs',
    'h5p-libraries/dist/index.json',
    'h5p-libraries/dist/H5P.Crossword-0.5/library.json',
  ])await requireFile(filename);

  const scope=join(install,'node_modules','@p2lrn');
  await execute(process.execPath,[join(scope,'toolkit','dist','cli','main.js'),'--help']);
  const markdown=join(gate,'reader-smoke.md');
  await writeFile(markdown,'# Documento npm\n\nTexto desde el registro publico.\n');
  const readerStdout=await execute(process.execPath,[
    join(scope,'toolkit','dist','cli','document-reader.js'),markdown,'--pretty',
  ]);
  const reader=JSON.parse(readerStdout);
  assert.equal(reader?.source?.detectedType,'MARKDOWN','Published Reader could not parse Markdown');
  assert(reader?.blocks?.some(block=>String(block?.text||'').includes('Documento npm')),
    'Published Reader did not return the expected content');

  await mkdir(copiedRuntime,{recursive:true});
  await execute(process.execPath,[
    join(scope,'player','bin','p2lrn-copy-runtime.mjs'),copiedRuntime,
  ]);
  for(const filename of [
    'p2lrn.js',
    'runtime-host/h5p.html',
    'runtime-host/scorm.html',
    'runtime-host/h5p-libraries/H5P.Crossword-0.5/library.json',
    'runtime-host/h5p-libraries/H5P.BranchingScenario-1.8/library.json',
  ]){
    const file=join(copiedRuntime,...filename.split('/'));
    await access(file);
    assert((await stat(file)).size>0,'Empty published runtime asset: '+filename);
  }

  const report={
    status:'PASS',
    scope:'public-npm-installation-and-runtime-smoke-only',
    browserE2E:'NOT_RUN_BY_THIS_SCRIPT',
    version,registry,
    runId:process.env.GITHUB_RUN_ID||null,
    checkedAt:new Date().toISOString(),
    packages:proof,
    reader:'PASS',
    copiedRuntime:'PASS',
  };
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log('PUBLIC_NPM_INSTALL_AND_RUNTIME=PASS');
  console.log('PUBLIC_NPM_REPORT='+output);
}

try{await verify();}
catch(error){
  console.error('PUBLIC_NPM_INSTALL_AND_RUNTIME=FAIL',error);
  try{
    await mkdir(gate,{recursive:true});
    await writeFile(output,JSON.stringify({
      status:'FAIL',checkedAt:new Date().toISOString(),
      error:String(error?.stack||error),
    },null,2)+'\n');
  }catch{}
  process.exitCode=1;
}
