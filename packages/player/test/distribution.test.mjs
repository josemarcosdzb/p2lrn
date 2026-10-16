import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const DIST=join(ROOT,'dist');
const PACKAGES=resolve(ROOT,'..');
const TOOLKIT_WEB=join(PACKAGES,'toolkit','web');
const sha256=(data)=>'sha256:'+createHash('sha256').update(data).digest('hex');
const sri384=(data)=>'sha384-'+createHash('sha384').update(data).digest('base64');
function walk(root){const out=[];for(const name of readdirSync(root)){const p=join(root,name),s=statSync(p);if(s.isDirectory())out.push(...walk(p));else if(s.isFile())out.push(p);}return out;}
function run(command,args,{cwd=ROOT,env=process.env}={}){return spawnSync(command,args,{cwd,env,text:true,encoding:'utf8'});}
function node(script,args=[],cwd=ROOT){return run(process.execPath,['--input-type=module','-e',script,...args],{cwd});}

// Gates recovered from the Alpha15 distribution suite, now owned by the Node package.
test('release manifest authenticates the exact distributed runtime tree',()=>{
  const release=JSON.parse(readFileSync(join(DIST,'release.json'),'utf8'));
  assert.equal(release.schema,'https://p2lrn.org/schema/web-sdk-release/1');
  assert.equal(release.version,'1');
  assert.equal(release.webSdkVersion,'0.5.0-alpha.1');
  const declared=new Map(release.files.map((x)=>[x.path,x]));
  const actual=walk(DIST).filter((p)=>p!==join(DIST,'release.json'));
  assert.deepEqual(new Set(declared.keys()),new Set(actual.map((p)=>relative(DIST,p).replaceAll('\\','/'))));
  for(const file of actual){const rel=relative(DIST,file).replaceAll('\\','/'),data=readFileSync(file),entry=declared.get(rel);assert.equal(entry.bytes,data.byteLength,rel);assert.equal(entry.sha256,sha256(data),rel);assert.equal(entry.sri,sri384(data),rel);}
});

test('distributed runtime is the canonical toolkit runtime and excludes Reader UI',()=>{
  for(const source of walk(TOOLKIT_WEB)){
    const rel=relative(TOOLKIT_WEB,source).replaceAll('\\','/');
    if(['app.js','index.html','style.css'].includes(rel)||rel.startsWith('app/')) continue;
    if(!['.js','.css','.html'].some((ext)=>rel.endsWith(ext))) continue;
    const target=join(DIST,...rel.split('/'));
    assert.ok(existsSync(target),rel);
    assert.deepEqual(readFileSync(target),readFileSync(source),rel);
  }
  for(const rel of ['app.js','index.html','style.css']) assert.equal(existsSync(join(DIST,rel)),false,rel);
});

test('Web SDK build is reproducible from the canonical toolkit runtime',()=>{
  const tmp=mkdtempSync(join(tmpdir(),'p2lrn-player-repro-'));
  try{
    const tool=join(PACKAGES,'toolkit','dist','tools','build-web-sdk.js'),a=join(tmp,'a'),b=join(tmp,'b');
    for(const out of [a,b]){const r=run(process.execPath,[tool,'--root',join(PACKAGES,'toolkit'),'--output',out],{cwd:resolve(PACKAGES,'..')});assert.equal(r.status,0,r.stderr||r.stdout);}
    const hashes=(root)=>Object.fromEntries(walk(root).sort().map((f)=>[relative(root,f).replaceAll('\\','/'),sha256(readFileSync(f))]));
    assert.deepEqual(hashes(a),hashes(b));
  }finally{rmSync(tmp,{recursive:true,force:true});}
});

test('ESM package registers canonical and Alpha15 custom elements and public API',()=>{
  const entry=pathToFileURL(join(DIST,'p2lrn.esm.js')).href;
  const script=`
    globalThis.HTMLElement=class {
      constructor(){this._attrs=new Map();this.isConnected=false;}
      attachShadow(){this.shadowRoot={replaceChildren(){},querySelector(){return null},insertBefore(){}};return this.shadowRoot;}
      setAttribute(n,v){this._attrs.set(n,String(v));} getAttribute(n){return this._attrs.has(n)?this._attrs.get(n):null;} removeAttribute(n){this._attrs.delete(n);}
    };
    const registry=new Map();
    globalThis.customElements={get:(n)=>registry.get(n),define:(n,v)=>{if(registry.has(n))throw new Error('duplicate '+n);registry.set(n,v);}};
    const mod=await import(${JSON.stringify(entry)}+'?element-contract=1');
    if(mod.version!=='0.5.0-alpha.1')process.exit(2);
    if(globalThis.P2LRN?.version!==mod.version)process.exit(3);
    if(registry.get('p2lrn-player')!==mod.P2LRNPlayerElement)process.exit(4);
    const legacy=registry.get('p2rln-player');
    if(!legacy||legacy.p2rlnVersion!==mod.version||legacy===mod.P2LRNPlayerElement)process.exit(5);
    if(typeof mod.mountP2LRN!=='function'||mod.renderers().length<10||mod.components().length<2)process.exit(6);
    const el=new mod.P2LRNPlayerElement();
    if(typeof el.reload!=='function')process.exit(7);
  `;
  const r=node(script);assert.equal(r.status,0,r.stderr||r.stdout);
});

test('classic loader derives its module URL and exposes one reusable ready promise',()=>{
  const loader=pathToFileURL(join(DIST,'p2lrn.js')).href;
  const script=`
    globalThis.document={currentScript:{src:process.argv[1]}};
    globalThis.HTMLElement=class {};
    const registry=new Map();globalThis.customElements={get:(n)=>registry.get(n),define:(n,v)=>registry.set(n,v)};
    await import(process.argv[1]+'?loader-contract=1');
    const first=globalThis.P2LRNReady;const api=await first;
    const state=globalThis.__P2LRN_CDN_LOADER__;
    if(api.version!=='0.5.0-alpha.1'||!state||state.version!==api.version)process.exit(2);
    if(state.moduleUrl!==new URL('./p2lrn.esm.js',process.argv[1]).href)process.exit(3);
    await import(process.argv[1]+'?loader-contract=2');
    if(globalThis.P2LRNReady!==first)process.exit(4);
  `;
  const r=node(script,[loader]);assert.equal(r.status,0,r.stderr||r.stdout);
});

test('different runtime version is rejected explicitly',()=>{
  const entry=pathToFileURL(join(DIST,'p2lrn.esm.js')).href;
  const script=`globalThis.P2LRN=Object.freeze({version:'9.9.9'});try{await import(${JSON.stringify(entry)}+'?conflict=1');process.exit(2)}catch(e){if(e.code!=='P2LRN_VERSION_CONFLICT'){console.error(e);process.exit(3)}}`;
  const r=node(script);assert.equal(r.status,0,r.stderr||r.stdout);
});

test('npm dry pack contains only public player payload',()=>{
  const r=run('npm',['pack','--json','--dry-run','.']);assert.equal(r.status,0,r.stderr||r.stdout);const meta=JSON.parse(r.stdout)[0],paths=new Set(meta.files.map((x)=>x.path));
  for(const p of ['dist/p2lrn.js','dist/p2lrn.esm.js','dist/p2lrn-player.js','dist/p2lrn-sw.js','dist/runtime-host/scorm.html','dist/runtime-host/scorm-host.js','server/runtime-host.mjs','types/index.d.ts','types/server.d.ts','schemas/web-sdk-release.schema.json']) assert.ok(paths.has(p),p);
  assert.equal([...paths].some((p)=>p.startsWith('test/')||p.startsWith('src/')),false);
});

test('packed player installs offline and imports by package name',()=>{
  const tmp=mkdtempSync(join(tmpdir(),'p2lrn-player-pack-'));
  try{
    const packed=run('npm',['pack',ROOT,'--pack-destination',tmp,'--json'],{cwd:tmp});assert.equal(packed.status,0,packed.stderr||packed.stdout);const tar=join(tmp,JSON.parse(packed.stdout)[0].filename),app=join(tmp,'app');mkdirSync(app);writeFileSync(join(app,'package.json'),'{"type":"module"}\n');
    const installed=run('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund',tar],{cwd:app});assert.equal(installed.status,0,installed.stderr||installed.stdout);
    const probe=`globalThis.HTMLElement=class {};const r=new Map();globalThis.customElements={get:n=>r.get(n),define:(n,v)=>r.set(n,v)};const m=await import('@p2lrn/player');if(m.version!=='0.5.0-alpha.1'||!r.get('p2lrn-player')||!r.get('p2rln-player'))process.exit(2);`;
    const loaded=node(probe,[],app);assert.equal(loaded.status,0,loaded.stderr||loaded.stdout);
    const serverProbe=`import {startP2LRNRuntimeHost} from '@p2lrn/player/server';const h=await startP2LRNRuntimeHost({basePath:'/runtime',allowedParentOrigins:['https://app.example.invalid']});try{const r=await fetch(h.baseUrl+'health');const j=await r.json();if(r.status!==200||j.runtime!=='p2lrn-runtime')process.exit(2);}finally{await h.close();}`;
    const serverLoaded=node(serverProbe,[],app);assert.equal(serverLoaded.status,0,serverLoaded.stderr||serverLoaded.stdout);
  } finally {rmSync(tmp,{recursive:true,force:true});}
});


test('public TypeScript declarations compile for canonical and legacy HTML elements',(t)=>{
  const check=run('tsc',['--version']);if(check.status!==0){t.skip('tsc unavailable');return;}
  const tmp=mkdtempSync(join(tmpdir(),'p2lrn-player-types-'));
  try{
    const moduleDir=join(tmp,'node_modules','@p2lrn','player');mkdirSync(dirname(moduleDir),{recursive:true});cpSync(ROOT,moduleDir,{recursive:true});
    const source=join(tmp,'probe.ts');writeFileSync(source,`import P2LRN,{createHostAdapter,mountP2LRN,version} from '@p2lrn/player';
const player=document.createElement('p2lrn-player');
player.setAttribute('src','/course.p2lrn'); player.setAttribute('node','urn:uuid:11111111-1111-4111-8111-111111111111');
player.adapter=createHostAdapter({saveState:async()=>{}});
void mountP2LRN(player,{src:'/course.p2lrn'});
const legacy=document.createElement('p2rln-player'); legacy.setAttribute('src','/legacy.p2rln');
const v:'0.5.0-alpha.1'=version; void P2LRN; void v;
`);
    const r=run('tsc',['--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','--lib','ES2022,DOM',source],{cwd:tmp});assert.equal(r.status,0,r.stderr||r.stdout);
  }finally{rmSync(tmp,{recursive:true,force:true});}
});

test('copy-sw CLI copies the exact canonical service worker',()=>{
  const tmp=mkdtempSync(join(tmpdir(),'p2lrn-player-sw-'));try{const r=run(process.execPath,[join(ROOT,'bin/p2lrn-copy-sw.mjs'),tmp]);assert.equal(r.status,0,r.stderr||r.stdout);assert.deepEqual(readFileSync(join(tmp,'p2lrn-sw.js')),readFileSync(join(DIST,'p2lrn-sw.js')));}finally{rmSync(tmp,{recursive:true,force:true});}
});

test('runtime host export starts and serves restrictive SCORM shell',async()=>{
  const {startP2LRNRuntimeHost}=await import(pathToFileURL(join(ROOT,'server/runtime-host.mjs')).href+'?host-gate=1');const host=await startP2LRNRuntimeHost({basePath:'/runtime',allowedParentOrigins:['https://app.example.invalid']});
  try{const health=await fetch(host.baseUrl+'health'),info=await health.json();assert.equal(health.status,200);assert.equal(info.runtime,'p2lrn-runtime');const page=await fetch(host.baseUrl+'scorm/');assert.equal(page.status,200);assert.match(await page.text(),/scorm-host\.js/);const csp=page.headers.get('content-security-policy')??'';assert.match(csp,/connect-src 'none'/);assert.match(csp,/frame-ancestors https:\/\/app\.example\.invalid/);}finally{await host.close();}
});

test('all distributed JavaScript passes Node syntax check',()=>{const failures=[];for(const file of walk(DIST).filter((p)=>p.endsWith('.js'))){const r=run(process.execPath,['--check',file]);if(r.status)failures.push(relative(ROOT,file)+': '+r.stderr);}assert.deepEqual(failures,[]);});

test('automatic runtime default is URL-resolved without a compile-time directory import', async()=>{
  for(const name of ['h5p-auto-runtime.js','runtime-host-config.js']){
    const content=readFileSync(join(DIST,name),'utf8');
    assert.doesNotMatch(content,/new\s+URL\(\s*['\"]\.\/runtime-host\/['\"]\s*,\s*import\.meta\.url\s*\)/u);
    assert.match(content,/new\s+URL\(\s*['\"]\.\/runtime-host\/['\"]\s*,\s*moduleHref\s*\)/u);
  }
  const base=pathToFileURL(join(DIST,'runtime-host-config.js')).href;
  const config=await import(base+'?turbopack-path-contract=1');
  assert.equal(config.getRuntimeHostConfig().baseUrl,new URL('./runtime-host/',base).href);
});
