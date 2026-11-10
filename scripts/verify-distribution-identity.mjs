import {createHash} from 'node:crypto';
import {readFile, readdir, stat} from 'node:fs/promises';
import {join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const playerPackage = JSON.parse(await readFile(join(root,'packages','player','package.json'),'utf8'));
const toolkitPackage = JSON.parse(await readFile(join(root,'packages','toolkit','package.json'),'utf8'));
const h5pPackage = JSON.parse(await readFile(join(root,'packages','h5p-libraries','package.json'),'utf8'));
const studioPackage = JSON.parse(await readFile(join(root,'packages','studio','package.json'),'utf8'));
const analyticsPackage = JSON.parse(await readFile(join(root,'packages','analytics','package.json'),'utf8'));
const version = playerPackage.version;

if (toolkitPackage.version !== version || h5pPackage.version !== version || studioPackage.version !== version || analyticsPackage.version !== version) {
  throw new Error(`Version mismatch: player=${version}, toolkit=${toolkitPackage.version}, h5p=${h5pPackage.version}, studio=${studioPackage.version}, analytics=${analyticsPackage.version}`);
}

const npmPlayer = join(root,'.npm-pack-gate','install','node_modules','@p2lrn','player','dist');
const npmH5p = join(root,'.npm-pack-gate','install','node_modules','@p2lrn','h5p-libraries','dist');
const cdnPlayer = join(root,'.netlify-cdn','player',version,'dist');
const cdnH5p = join(cdnPlayer,'runtime-host','h5p-libraries');
const npmStudio = join(root,'.npm-pack-gate','install','node_modules','@p2lrn','studio','dist');
const cdnStudio = join(root,'.netlify-cdn','studio',version,'dist');
const npmAnalytics = join(root,'.npm-pack-gate','install','node_modules','@p2lrn','analytics','dist');
const cdnAnalytics = join(root,'.netlify-cdn','analytics',version,'dist');

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    const full = join(dir,entry.name);
    if (entry.isDirectory()) out.push(...await walk(full,base));
    else if (entry.isFile()) out.push(relative(base,full).replaceAll('\\','/'));
  }
  return out.sort();
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function compareTrees(leftRoot,rightRoot,{ignorePrefix=null,ignorePaths=[]}={}) {
  let left = await walk(leftRoot);
  let right = await walk(rightRoot);
  if (ignorePrefix) {
    left = left.filter((path)=>!path.startsWith(ignorePrefix));
    right = right.filter((path)=>!path.startsWith(ignorePrefix));
  }
  const ignored=new Set(ignorePaths);
  if(ignored.size){
    left=left.filter((path)=>!ignored.has(path));
    right=right.filter((path)=>!ignored.has(path));
  }
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    const leftSet=new Set(left),rightSet=new Set(right);
    const missingRight=left.filter((path)=>!rightSet.has(path));
    const missingLeft=right.filter((path)=>!leftSet.has(path));
    throw new Error(`Distribution file set mismatch. Missing from right: ${missingRight.slice(0,20).join(', ')}; missing from left: ${missingLeft.slice(0,20).join(', ')}`);
  }
  const mismatches=[];
  for (const rel of left) {
    if ((await sha256(join(leftRoot,...rel.split('/')))) !== (await sha256(join(rightRoot,...rel.split('/'))))) {
      mismatches.push(rel);
      if (mismatches.length >= 20) break;
    }
  }
  if (mismatches.length) throw new Error(`Distribution byte mismatch: ${mismatches.join(', ')}`);
  return left.length;
}

await stat(npmPlayer);
await stat(npmH5p);
await stat(cdnPlayer);
await stat(cdnH5p);
await stat(npmStudio);
await stat(cdnStudio);
await stat(npmAnalytics);
await stat(cdnAnalytics);

const playerRelease=JSON.parse(await readFile(join(cdnPlayer,'release.json'),'utf8'));
const cdnHtmlMirrors=playerRelease.files.filter((file)=>file.path.endsWith('.html')).map((file)=>file.path+'.raw').sort();
if(cdnHtmlMirrors.length<3)throw new Error('CDN release lacks the expected runtime HTML mirrors.');
for(const mirror of cdnHtmlMirrors){
  const html=mirror.slice(0,-'.raw'.length);
  const [htmlHash,mirrorHash]=await Promise.all([sha256(join(cdnPlayer,...html.split('/'))),sha256(join(cdnPlayer,...mirror.split('/')))]);
  if(htmlHash!==mirrorHash)throw new Error('CDN raw HTML mirror differs from its release HTML: '+mirror);
}
const playerFiles = await compareTrees(npmPlayer, cdnPlayer, {
  ignorePrefix:'runtime-host/h5p-libraries/',
  ignorePaths:cdnHtmlMirrors,
});
const h5pFiles = await compareTrees(npmH5p, cdnH5p);
const studioFiles = await compareTrees(npmStudio, cdnStudio);
const analyticsFiles = await compareTrees(npmAnalytics, cdnAnalytics);

const parityManifest=JSON.parse(await readFile(join(root,'.netlify-cdn','distribution-parity.json'),'utf8'));
if(parityManifest.version!==version||parityManifest.toolkit?.version!==toolkitPackage.version)
  throw new Error('CDN parity inventory version mismatch.');
const parityInputs=[
  {name:'player',root:npmPlayer,exclude:path=>path.startsWith('runtime-host/h5p-libraries/')||path.endsWith('.html.raw')},
  {name:'h5p-libraries',root:npmH5p,exclude:()=>false},
  {name:'studio',root:npmStudio,exclude:()=>false},
  {name:'analytics',root:npmAnalytics,exclude:()=>false},
];
for(const item of parityInputs){
  const component=parityManifest.components?.[item.name];
  if(!component||component.package!=='@p2lrn/'+item.name||component.version!==version)
    throw new Error('Missing or incorrect CDN parity component: '+item.name);
  const npmFiles=(await walk(item.root)).filter(path=>!item.exclude(path));
  const inventoryFiles=component.files?.map(row=>row.path).sort();
  if(!Array.isArray(inventoryFiles)||component.fileCount!==inventoryFiles.length||
     JSON.stringify(npmFiles)!==JSON.stringify(inventoryFiles))
    throw new Error('CDN parity manifest does not enumerate all npm files: '+item.name);
  for(const row of component.files){
    const file=join(item.root,...row.path.split('/'));
    const bytes=await readFile(file);
    const actual='sha256:'+createHash('sha256').update(bytes).digest('hex');
    if(bytes.length!==row.bytes||actual!==row.sha256)
      throw new Error('CDN parity manifest differs from npm artifact: '+item.name+'/'+row.path);
  }
}
// Verify corresponding source in BOTH distribution channels as well as dist/.
// Node-only Toolkit/Studio/Analytics APIs cannot execute from a static CDN,
// but their published sources must be mirrored without omissions.
const npmModules=join(root,'.npm-pack-gate','install','node_modules','@p2lrn');
const cdnRoot=join(root,'.netlify-cdn');
const playerSourceFiles=await compareTrees(
  join(npmModules,'player','source'),
  join(cdnRoot,'player',version,'source'));
await compareTrees(
  join(npmModules,'player','source'),
  join(cdnRoot,'player','current','source'));
const sourceFilesCompared={player:playerSourceFiles};
for(const name of ['toolkit','studio','analytics']){
  const packageRoot=join(npmModules,name);
  const packageJson=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));
  const cdnSource=join(cdnRoot,name,version,'source');
  const manifest=JSON.parse(await readFile(join(cdnSource,'SOURCE-MANIFEST.json'),'utf8'));
  if(manifest.package!=='@p2lrn/'+name||manifest.packageVersion!==version)
    throw new Error('Corresponding Source version/package mismatch: '+name);
  const declared=new Set();
  for(const raw of [...new Set(['package.json',...(packageJson.files??[])])]){
    const part=String(raw).replace(/\/+$/,'');
    if(part==='dist')continue;
    if(!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(part)||
       part.split('/').some(segment=>segment==='.'||segment==='..'))
      throw new Error('Invalid published path: '+name+'/'+part);
    const file=join(packageRoot,...part.split('/'));
    const info=await stat(file);
    if(info.isFile())declared.add(part);
    else if(info.isDirectory())
      for(const entry of await walk(file))declared.add(part+'/'+entry);
    else throw new Error('Unsupported npm source path: '+name+'/'+part);
  }
  const matched=new Set();
  for(const item of manifest.files??[]){
    const prefix='packages/'+name+'/';
    if(!item.path.startsWith(prefix))throw new Error('Unsafe source manifest path: '+item.path);
    const path=item.path.slice(prefix.length);
    if(!declared.has(path)||matched.has(path))
      throw new Error('CDN source manifest missing/duplicate npm source: '+name+'/'+path);
    const npmBytes=await readFile(join(packageRoot,...path.split('/')));
    const cdnBytes=await readFile(join(cdnSource,...item.path.split('/')));
    const digest='sha256:'+createHash('sha256').update(npmBytes).digest('hex');
    if(npmBytes.length!==item.bytes||digest!==item.sha256||!npmBytes.equals(cdnBytes))
      throw new Error('CDN/npm Corresponding Source bytes differ: '+name+'/'+path);
    matched.add(path);
  }
  if(declared.size!==matched.size)
    throw new Error('Corresponding Source coverage incomplete: '+name+' npm='+declared.size+' CDN='+matched.size);
  sourceFilesCompared[name]=matched.size;
  const currentSource=join(cdnRoot,name,'current','source');
  await compareTrees(cdnSource,currentSource);
}
const index = JSON.parse(await readFile(join(root,'.netlify-cdn','index.json'),'utf8'));
if(index.distributionParityManifest!=='/distribution-parity.json')throw new Error('CDN index lacks full parity inventory.');
if (index.player?.version !== version) throw new Error('CDN index Player version mismatch.');
if (index.generatedFrom?.toolkitVersion !== toolkitPackage.version) throw new Error('CDN index Toolkit version mismatch.');
if (index.h5p?.sharedLibraryPackageVersion !== h5pPackage.version) throw new Error('CDN index H5P package version mismatch.');
if (index.h5p?.sharedLibraryMode !== 'bundled-npm-artifact') throw new Error('CDN is not using the npm H5P artifact mode.');
if(index.studio?.version!==studioPackage.version) throw new Error('CDN index Studio version mismatch.');
if(index.analytics?.version!==analyticsPackage.version) throw new Error('CDN index Analytics version mismatch.');

// Verify byte-accurate SHA-384 hashes before treating the CDN as a verified distribution.
await import('./verify-cdn-sri.mjs');

console.log(JSON.stringify({
  ok:true,
  version,
  completeManifestFilesCompared:Object.fromEntries(parityInputs.map(item=>[item.name,parityManifest.components[item.name].fileCount])),
  sourceFilesCompared,
  playerFilesCompared:playerFiles,
  cdnHtmlMirrors,
  h5pFilesCompared:h5pFiles,
  studioFilesCompared:studioFiles,
  analyticsFilesCompared:analyticsFiles,
  h5pLibraryCount:index.h5p.sharedLibraryCount,
  mode:index.h5p.sharedLibraryMode,
},null,2));
