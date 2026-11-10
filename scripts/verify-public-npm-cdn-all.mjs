import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile,mkdir,stat} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const origin=(process.env.P2LRN_PUBLIC_ORIGIN||'https://p2lrn.org').replace(/\/+$/,'');
const modules=join(root,'.npm-pack-gate','install','node_modules','@p2lrn');
const reportPath=join(root,'.npm-pack-gate','public-npm-cdn-all-report.json');
const distributionNames=['player','h5p-libraries','studio','analytics'];
const sha=data=>'sha256:'+createHash('sha256').update(data).digest('hex');
const report={kind:'complete-bidirectional-public-npm-cdn-inventory',origin,status:'FAIL',startedAt:new Date().toISOString(),components:{},errors:[]};

async function request(path){
  const url=new URL(path,origin);
  assert.equal(url.origin,new URL(origin).origin,'Cross-origin request prohibited');
  const res=await fetch(url,{redirect:'error',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(40000)});
  assert.equal(res.status,200,'CDN resource unavailable: '+url.href+' status '+res.status);
  return Buffer.from(await res.arrayBuffer());
}
async function walk(dir,prefix=''){
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const name=prefix?prefix+'/'+entry.name:entry.name;
    if(entry.isSymbolicLink())throw Error('npm file symlinks are prohibited: '+name);
    if(entry.isDirectory())out.push(...await walk(join(dir,entry.name),name));
    else if(entry.isFile())out.push(name);
    else throw Error('Unsupported npm file: '+name);
  }
  return out.sort();
}
function safePath(p){
  assert(typeof p==='string'&&p.length>0&&p.length<1024,'Invalid manifest path');
  assert(!p.includes('\\')&&!p.startsWith('/')&&!p.split('/').some(x=>x===''||x==='.'||x==='..'),'Unsafe manifest path: '+p);
  return p;
}
async function check(){
  const installed={};
  for(const name of ['toolkit',...distributionNames]){
    installed[name]=JSON.parse(await readFile(join(modules,name,'package.json'),'utf8'));
    assert.equal(installed[name].name,'@p2lrn/'+name);
  }
  const version=installed.toolkit.version;
  assert(distributionNames.every(name=>installed[name].version===version),'Installed public npm versions differ');
  report.version=version;
  const registry=JSON.parse(await readFile(join(root,'.npm-pack-gate','public-npm-report.json'),'utf8'));
  assert.equal(registry.status,'PASS','Public npm registry provenance not verified');
  assert.equal(registry.version,version,'Provenance version differs');
  const index=JSON.parse((await request('/index.json')).toString('utf8'));
  assert.equal(index.distributionParityManifest,'/distribution-parity.json','CDN inventory not published');
  for(const path of ['player','studio','analytics']){
    assert.equal(index[path]?.version,version,'CDN '+path+' version differs from public npm');
  }
  assert.equal(index.h5p?.sharedLibraryPackageVersion,version);
  assert.equal(index.generatedFrom?.toolkitVersion,version);
  const manifest=JSON.parse((await request('/distribution-parity.json')).toString('utf8'));
  assert.equal(manifest.schema,'https://p2lrn.org/schema/distribution-parity/1');
  assert.equal(manifest.version,version,'Public manifest version differs from npm');
  assert.equal(manifest.toolkit?.version,version,'CDN Toolkit version differs');
  assert.deepEqual(Object.keys(manifest.components).sort(),[...distributionNames].sort(),'Missing or additional distributable components');
  const expectedBase={
    player:'/player/'+version+'/dist/',
    'h5p-libraries':'/player/'+version+'/dist/runtime-host/h5p-libraries/',
    studio:'/studio/'+version+'/dist/',
    analytics:'/analytics/'+version+'/dist/',
  };
  // Compare both directions: every npm file must be in the public manifest,
  // and every manifest file must exist in npm, with the same byte length/hash.
  for(const name of distributionNames){
    const component=manifest.components[name];
    assert.equal(component.package,'@p2lrn/'+name);
    assert.equal(component.version,version);
    assert.equal(component.versionedBasePath,expectedBase[name]);
    const expectedCurrent={
      player:'/player/current/dist/',
      'h5p-libraries':'/player/current/dist/runtime-host/h5p-libraries/',
      studio:'/studio/current/dist/',
      analytics:'/analytics/current/dist/',
    };
    assert.equal(component.currentBasePath,expectedCurrent[name],'Unexpected current CDN path');
    assert(Array.isArray(component.files)&&component.files.length>0,'Empty CDN inventory: '+name);
    assert.equal(component.fileCount,component.files.length,'CDN inventory count mismatch');
    const npmRoot=join(modules,name,'dist');
    const allNpm=await walk(npmRoot);
    // The H5P shared corpus is its own npm package, and the raw HTML sidecars
    // are CDN-only representations of exact runtime HTML bytes.
    const excluded=name==='player'?p=>p.startsWith('runtime-host/h5p-libraries/')||p.endsWith('.html.raw'):()=>false;
    const npmPaths=allNpm.filter(p=>!excluded(p));
    const expected=new Map();
    for(const row of component.files){
      safePath(row.path);
      assert(!expected.has(row.path),'Duplicate CDN manifest path: '+name+'/'+row.path);
      assert(Number.isSafeInteger(row.bytes)&&row.bytes>=0,'Invalid byte length');
      assert(/^sha256:[0-9a-f]{64}$/.test(row.sha256),'Invalid CDN checksum');
      expected.set(row.path,row);
    }
    const declared=[...expected.keys()].sort();
    assert.deepEqual(declared,npmPaths,'Bidirectional file list mismatch for '+name);
    const item={package:component.package,version,fileCount:declared.length,totalBytes:0,verifiedNpmBytes:0,verifiedCdnBytes:0,verifiedCurrentCdnBytes:0};
    report.components[name]=item;
    // All local bytes are validated before network transfer. This detects an
    // incorrect public manifest even if the CDN serves exactly that manifest.
    for(const path of declared){
      const bytes=await readFile(join(npmRoot,...path.split('/')));
      const row=expected.get(path);
      assert.equal(bytes.length,row.bytes,'npm byte size differs: '+name+'/'+path);
      assert.equal(sha(bytes),row.sha256,'npm hash differs: '+name+'/'+path);
      item.totalBytes+=row.bytes;
      item.verifiedNpmBytes++;
    }
    // End-to-end: download every resource, not a sample or merely the manifest.
    const concurrency=Math.max(1,Math.min(8,Number(process.env.P2LRN_PARITY_CONCURRENCY)||6));
    let next=0;
    await Promise.all(Array.from({length:Math.min(concurrency,declared.length)},async()=>{
      while(next<declared.length){
        const i=next++;
        const path=declared[i];
        const row=expected.get(path);
        const bytes=await request(component.versionedBasePath+path.split('/').map(encodeURIComponent).join('/'));
        assert.equal(bytes.length,row.bytes,'CDN byte length differs: '+name+'/'+path);
        assert.equal(sha(bytes),row.sha256,'CDN checksum differs: '+name+'/'+path);
        item.verifiedCdnBytes++;
        // Mutable /current/ must agree with the exact public npm release too.
        // A newer or stale current deployment is a failed release parity gate.
        const current=await request(component.currentBasePath+path.split('/').map(encodeURIComponent).join('/'));
        assert.equal(current.length,row.bytes,'CDN current byte length differs: '+name+'/'+path);
        assert.equal(sha(current),row.sha256,'CDN current checksum differs: '+name+'/'+path);
        item.verifiedCurrentCdnBytes++;
      }
    }));
    console.log('P2LRN_FULL_DISTRIBUTION_PARITY',JSON.stringify(item));
  }
}
try{
  await check();
  report.status='PASS';
}catch(error){
  report.errors.push(String(error?.stack||error));
  process.exitCode=1;
}finally{
  report.finishedAt=new Date().toISOString();
  await mkdir(dirname(reportPath),{recursive:true});
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log('P2LRN_FULL_PUBLIC_NPM_CDN_PARITY',JSON.stringify({status:report.status,version:report.version,components:report.components,errors:report.errors,reportPath}));
}
