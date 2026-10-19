import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const nodeModules=join(root,'.npm-pack-gate','install','node_modules','@p2lrn');
const origin=(process.env.P2LRN_PUBLIC_ORIGIN||'https://p2lrn.netlify.app').replace(/\/+$/,'');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const output=join(root,'.npm-pack-gate','public-npm-cdn-report.json');
const pairs=[
  ['Player classic','player','dist/p2lrn.js','/player/current/dist/p2lrn.js'],
  ['Player ESM','player','dist/p2lrn.esm.js','/player/current/dist/p2lrn.esm.js'],
  ['SCORM runtime host','player','dist/runtime-host/scorm.html','/player/current/dist/runtime-host/scorm.html'],
  ['H5P runtime host','player','dist/runtime-host/h5p.html','/player/current/dist/runtime-host/h5p.html'],
  ['H5P JS runtime','player','dist/runtime-host/assets/frame.bundle.js','/player/current/dist/runtime-host/assets/frame.bundle.js'],
  ['Studio classic','studio','dist/p2lrn-studio.js','/studio/current/dist/p2lrn-studio.js'],
  ['Studio ESM','studio','dist/p2lrn-studio.esm.js','/studio/current/dist/p2lrn-studio.esm.js'],
  ['H5P shared catalog','h5p-libraries','dist/index.json','/player/current/dist/runtime-host/h5p-libraries/index.json'],
  ['H5P Crossword library','h5p-libraries','dist/H5P.Crossword-0.5/library.json','/player/current/dist/runtime-host/h5p-libraries/H5P.Crossword-0.5/library.json'],
];
const report={
  kind:'installed-npm-vs-live-public-cdn',
  site:origin,
  startedAt:new Date().toISOString(),
  npmInstallSource:'Independent empty project with installed @p2lrn/*.tgz archives',
  comparisons:[],
  publicPackages:[],
  errors:[]
};
async function get(path){
  const u=new URL(path,origin);
  const response=await fetch(u,{signal:AbortSignal.timeout(30000),headers:{'Cache-Control':'no-cache'}});
  if(!response.ok)throw new Error('Public CDN HTTP '+response.status+' at '+u.href);
  return Buffer.from(await response.arrayBuffer());
}
async function check(){
  const namespaces=['toolkit','h5p-libraries','player','studio'];
  const packages=[];
  for(const name of namespaces){
    const pkg=JSON.parse(await readFile(join(nodeModules,name,'package.json'),'utf8'));
    assert.equal(pkg.name,'@p2lrn/'+name,'Installed package name mismatch');
    packages.push(pkg);
  }
  const version=packages[0].version;
  for(const pkg of packages)assert.equal(pkg.version,version,'Installed package versions differ');
  report.version=version;
  const index=JSON.parse((await get('/index.json')).toString('utf8'));
  assert.equal(index.player.version,version,'Public CDN Player version differs from installed npm');
  assert.equal(index.studio.version,version,'Public CDN Studio version differs from installed npm');
  assert.equal(index.h5p.sharedLibraryPackageVersion,version,'Public CDN H5P version differs from installed npm');

  for(const [title,name,rel,path] of pairs){
    const local=await readFile(join(nodeModules,name,...rel.split('/')));
    const remote=await get(path);
    const a=sha(local),b=sha(remote);
    const result={title,package:'@p2lrn/'+name,path,bytes:local.length,npmSha256:a,cdnSha256:b,identical:local.equals(remote)};
    report.comparisons.push(result);
    console.log('NPM_PUBLIC_CDN_BYTES',JSON.stringify(result));
    assert.equal(a,b,'Public CDN is NOT byte-identical to installed npm: '+title);
  }

  // Validate real packages served by the public CDN using toolkit loaded ONLY
  // from the installed npm package, never from monorepo source modules.
  const toolkitZip=await import(pathToFileURL(join(nodeModules,'toolkit','dist','core','zip.js')).href);
  assert.equal(typeof toolkitZip.ZipArchive?.open,'function','Installed npm Toolkit ZIP API missing');
  for(const path of [
    '/examples/canonical/creator-course.p2lrn',
    '/examples/canonical/external/scorm12-real.p2lrn',
    '/examples/canonical/external/h5p-crossword.p2lrn'
  ]){
    const remote=await get(path);
    const zip=toolkitZip.ZipArchive.open(new Uint8Array(remote));
    const manifest=JSON.parse(new TextDecoder().decode(zip.read('META-INF/manifest.json')));
    assert.equal(manifest.format,'P2LRN','Installed npm toolkit rejected real CDN P2LRN');
    assert.match(manifest.integrity?.contentRoot||'',/^sha256:[a-f0-9]{64}$/i);
    const item={path,bytes:remote.length,sha256:sha(remote),packageId:manifest.packageId,contentRoot:manifest.integrity.contentRoot};
    report.publicPackages.push(item);
    console.log('NPM_TOOLKIT_OPENED_PUBLIC_PACKAGE',JSON.stringify(item));
  }

  const registry=JSON.parse(await readFile(join(root,'.npm-registry-report.json'),'utf8'));
  report.publicRegistry={status:registry.status,readyForCleanRegistryInstall:registry.readyForCleanRegistryInstall,items:registry.items.map(x=>({name:x.name,version:x.version,status:x.status}))};
  console.log('NPM_PUBLIC_REGISTRY',JSON.stringify(report.publicRegistry));
  if(!registry.readyForCleanRegistryInstall)console.log('NPM_NOT_PUBLISHED_PUBLIC_REGISTRY_INSTALL_NOT_CLAIMED');
}
try{
  await check();
  report.status='PASS';
}catch(e){
  report.status='FAIL';
  report.errors.push(String(e?.stack||e));
  process.exitCode=1;
}finally{
  report.finishedAt=new Date().toISOString();
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log('NPM_PUBLIC_CDN_INTEROP_REPORT',JSON.stringify({status:report.status,version:report.version,compared:report.comparisons.length,packages:report.publicPackages.length,reportPath:output,errors:report.errors}));
}
