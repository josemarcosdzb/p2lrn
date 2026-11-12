import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {promisify} from 'node:util';
import {join, relative, resolve} from 'node:path';
import {buildPlayerDistribution, H5P_STANDALONE_VERSION, THREE_VERSION, RAPIER3D_VERSION} from '../../packages/player/scripts/build-dist.mjs';
import {cleanPlayerSourceSnapshot, preparePlayerSourceSnapshot} from '../../packages/player/scripts/prepare-source-snapshot.mjs';
import {buildH5pLibraries, LUMI_H5P_LIBRARY_COMMIT} from '../../packages/h5p-libraries/scripts/build.mjs';
import {publishPackageCorrespondingSource,verifyPackageCorrespondingSource} from './corresponding-source.mjs';

const execFileAsync=promisify(execFile);
const root = resolve(process.cwd());
const outputRoot = join(root, '.netlify-cdn');
const playerPackagePath = join(root, 'packages', 'player', 'package.json');
const toolkitPackagePath = join(root, 'packages', 'toolkit', 'package.json');
const h5pPackagePath = join(root, 'packages', 'h5p-libraries', 'package.json');
const studioPackagePath = join(root, 'packages', 'studio', 'package.json');
const analyticsPackagePath = join(root, 'packages', 'analytics', 'package.json');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function headerBlock(path, cacheControl, edgeCacheControl) {
  return [
    path,
    '  Access-Control-Allow-Origin: *',
    '  Cross-Origin-Resource-Policy: cross-origin',
    `  Cache-Control: ${cacheControl}`,
    `  Netlify-CDN-Cache-Control: ${edgeCacheControl}`,
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: no-referrer',
    '',
  ].join('\n');
}

const playerPackage = await readJson(playerPackagePath);
const toolkitPackage = await readJson(toolkitPackagePath);
const h5pPackage = await readJson(h5pPackagePath);
const studioPackage = await readJson(studioPackagePath);
const analyticsPackage = await readJson(analyticsPackagePath);
const version = playerPackage.version;

if (toolkitPackage.version !== version || h5pPackage.version !== version || studioPackage.version !== version || analyticsPackage.version !== version) {
  throw new Error(
    `P2LRN npm versions must align before CDN build: player=${version}, toolkit=${toolkitPackage.version}, h5p-libraries=${h5pPackage.version}, studio=${studioPackage.version}, analytics=${analyticsPackage.version}`,
  );
}

await rm(outputRoot, {recursive:true, force:true});

const versionedDist = join(outputRoot, 'player', version, 'dist');
const versionedSource = join(outputRoot, 'player', version, 'source');
const preparedSource = await preparePlayerSourceSnapshot();
const playerBuild = await buildPlayerDistribution({output:versionedDist});
await cp(preparedSource.output, versionedSource, {recursive:true, force:true});
await cp(join(root,'LICENSE'), join(outputRoot,'LICENSE'), {force:true});
await cp(join(root,'NOTICE.md'), join(outputRoot,'NOTICE.md'), {force:true});

await execFileAsync(process.execPath,[join(root,'packages','studio','scripts','build-dist.mjs')],{cwd:root,maxBuffer:4*1024*1024});
const studioPackageDist=join(root,'packages','studio','dist');
await cp(studioPackageDist,join(outputRoot,'studio',version,'dist'),{recursive:true,force:true});
await cp(studioPackageDist,join(outputRoot,'studio','current','dist'),{recursive:true,force:true});

await execFileAsync(process.execPath,[join(root,'packages','analytics','scripts','build-dist.mjs')],{cwd:root,maxBuffer:4*1024*1024});
const analyticsPackageDist=join(root,'packages','analytics','dist');
await cp(analyticsPackageDist,join(outputRoot,'analytics',version,'dist'),{recursive:true,force:true});
await cp(analyticsPackageDist,join(outputRoot,'analytics','current','dist'),{recursive:true,force:true});

// The Toolkit npm prepack creates the icon; create the identical icon for
// CDN corresponding-source snapshots before collecting files.
await execFileAsync(process.execPath,[join(root,'scripts','build-windows-icon.mjs')],{cwd:root,maxBuffer:4*1024*1024});

// Publish inspectable, version-matched corresponding source for every first-party
// npm/CDN component. Player already has its own full source snapshot above.
const correspondingSource={};
for(const name of ['toolkit','studio','analytics']){
  const result=await publishPackageCorrespondingSource({
    root,outputRoot,name,version,sourceRef:preparedSource.manifest.sourceRef,
  });
  const checked=await verifyPackageCorrespondingSource({outputRoot,name,version});
  await cp(result.targetRoot,join(outputRoot,name,'current','source'),{recursive:true,force:true});
  correspondingSource[name]={
    package:'@p2lrn/'+name,
    manifest:'/'+name+'/'+version+'/source/SOURCE-MANIFEST.json',
    verifiedFiles:checked.fileCount,
  };
}

const h5pPackageDist = join(root, 'packages', 'h5p-libraries', 'dist');
const h5pManifest = await buildH5pLibraries({output:h5pPackageDist});
await cp(
  h5pPackageDist,
  join(versionedDist, 'runtime-host', 'h5p-libraries'),
  {recursive:true, force:true},
);

// Netlify and site post-processing may modify responses served as text/html.
// Offline packaging requires the exact preprocessed bytes listed in release.json.
// Publish these byte-identical sidecars under a non-HTML extension; keep the
// original .html files for normal Player iframe navigation.
const offlineHtmlMirrors=playerBuild.release.files.filter(file=>file.path.endsWith('.html'));
if(offlineHtmlMirrors.length<3)throw new Error('Expected Player runtime HTML hosts are missing from release.json');
for(const file of offlineHtmlMirrors){
  if(!/^runtime-host\/[A-Za-z0-9/_-]+\.html$/.test(file.path))
    throw new Error('Invalid runtime HTML manifest path: '+file.path);
  const original=await readFile(join(versionedDist,file.path));
  const digest='sha256:'+createHash('sha256').update(original).digest('hex');
  if(original.length!==file.bytes||digest!==file.sha256)
    throw new Error('Player HTML release manifest does not match built bytes: '+file.path);
  await writeFile(join(versionedDist,file.path+'.raw'),original);
}

// SRI must be computed from the exact immutable versioned artifacts, never
// from /current/ (which changes on the next release).
const sri=async(file)=>'sha384-'+createHash('sha384').update(await readFile(file)).digest('base64');
const sriResources={
  [`/player/${version}/dist/${playerBuild.release.entrypoints.classic}`]:
    await sri(join(versionedDist,playerBuild.release.entrypoints.classic)),
  [`/player/${version}/dist/${playerBuild.release.entrypoints.module}`]:
    await sri(join(versionedDist,playerBuild.release.entrypoints.module)),
  [`/studio/${version}/dist/p2lrn-studio.js`]:
    await sri(join(outputRoot,'studio',version,'dist','p2lrn-studio.js')),
  [`/studio/${version}/dist/p2lrn-studio.esm.js`]:
    await sri(join(outputRoot,'studio',version,'dist','p2lrn-studio.esm.js')),
  [`/analytics/${version}/dist/p2lrn-analytics.js`]:
    await sri(join(outputRoot,'analytics',version,'dist','p2lrn-analytics.js')),
  [`/analytics/${version}/dist/p2lrn-analytics.esm.js`]:
    await sri(join(outputRoot,'analytics',version,'dist','p2lrn-analytics.esm.js')),
};
const sriIndex=Object.freeze({
  schema:'https://p2lrn.org/schema/cdn-sri/1',
  version,
  resources:sriResources,
});
await writeFile(join(outputRoot,'sri.json'),JSON.stringify(sriIndex,null,2)+'\n');

// Mutable development channel.
await cp(versionedDist, join(outputRoot, 'player', 'current', 'dist'), {
  recursive:true,
  force:true,
});
await cp(versionedSource, join(outputRoot, 'player', 'current', 'source'), {
  recursive:true,
  force:true,
});


/**
 * npm and the public CDN must expose the same *browser distributable* bytes.
 * Node-only Toolkit APIs, CLI commands and server adapters are not static web
 * assets; their package version and corresponding-source revisions remain
 * separately tracked. The full inventory covers every shipped browser asset,
 * not just the top-level Player/Studio/Analytics loaders.
 */
async function enumerateDistributionFiles(directory, base = directory) {
  const files=[];
  const entries=(await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'));
  for(const entry of entries){
    const full=join(directory,entry.name);
    if(entry.isSymbolicLink())throw new Error('Distribution symlinks are forbidden: '+full);
    if(entry.isDirectory())files.push(...await enumerateDistributionFiles(full,base));
    else if(entry.isFile())files.push(relative(base,full).replaceAll('\\','/'));
    else throw new Error('Unsupported distribution entry: '+full);
  }
  return files;
}
const parityRoots=[
  {name:'player',package:'@p2lrn/player',root:versionedDist,base:`/player/${version}/dist/`,current:'/player/current/dist/',
    exclude:path=>path.endsWith('.html.raw')||path.startsWith('runtime-host/h5p-libraries/')},
  {name:'h5p-libraries',package:'@p2lrn/h5p-libraries',
    root:join(versionedDist,'runtime-host','h5p-libraries'),
    base:`/player/${version}/dist/runtime-host/h5p-libraries/`,
    current:'/player/current/dist/runtime-host/h5p-libraries/',exclude:()=>false},
  {name:'studio',package:'@p2lrn/studio',root:join(outputRoot,'studio',version,'dist'),
    base:`/studio/${version}/dist/`,current:'/studio/current/dist/',exclude:()=>false},
  {name:'analytics',package:'@p2lrn/analytics',root:join(outputRoot,'analytics',version,'dist'),
    base:`/analytics/${version}/dist/`,current:'/analytics/current/dist/',exclude:()=>false},
];
const distributionParity={
  schema:'https://p2lrn.org/schema/distribution-parity/1',
  version,
  toolkit:{package:'@p2lrn/toolkit',version:toolkitPackage.version},
  components:{},
};
for(const item of parityRoots){
  const files=[];
  for(const path of (await enumerateDistributionFiles(item.root)).filter(path=>!item.exclude(path))){
    const bytes=await readFile(join(item.root,...path.split('/')));
    files.push({
      path,
      bytes:bytes.length,
      sha256:'sha256:'+createHash('sha256').update(bytes).digest('hex'),
    });
  }
  if(!files.length)throw new Error('Empty npm/CDN distribution inventory: '+item.name);
  distributionParity.components[item.name]={
    package:item.package,version,versionedBasePath:item.base,currentBasePath:item.current,
    fileCount:files.length,files,
  };
}
await writeFile(join(outputRoot,'distribution-parity.json'),JSON.stringify(distributionParity,null,2)+'\n');

const index = {
  schema:'https://p2lrn.org/schema/cdn-index/1',
  distributionParityManifest:'/distribution-parity.json',
  generatedFrom:{
    playerPackage:'@p2lrn/player',
    playerVersion:version,
    toolkitPackage:'@p2lrn/toolkit',
    toolkitVersion:toolkitPackage.version,
    h5pLibrariesPackage:'@p2lrn/h5p-libraries',
    h5pLibrariesVersion:h5pPackage.version,
    studioPackage:'@p2lrn/studio',
    studioVersion:studioPackage.version,
    analyticsPackage:'@p2lrn/analytics',
    analyticsVersion:analyticsPackage.version,
  },
  license:{
    id:'P2LRN-NCSL-1.0',
    name:'P2LRN Non-Commercial Source License 1.0',
    url:'/LICENSE',
    notice:'/NOTICE.md',
  },
  correspondingSource,
  sriManifest:'/sri.json',
  source:{
    sourceRef:preparedSource.manifest.sourceRef,
    versionedBasePath:`/player/${version}/source/`,
    currentBasePath:'/player/current/source/',
    manifest:`/player/${version}/source/SOURCE-MANIFEST.json`,
  },
  player:{
    version,
    versionedBasePath:`/player/${version}/dist/`,
    currentBasePath:'/player/current/dist/',
    classic:`/player/${version}/dist/${playerBuild.release.entrypoints.classic}`,
    module:`/player/${version}/dist/${playerBuild.release.entrypoints.module}`,
    integrity:{
      classic:sriResources[`/player/${version}/dist/${playerBuild.release.entrypoints.classic}`],
      module:sriResources[`/player/${version}/dist/${playerBuild.release.entrypoints.module}`],
    },
    serviceWorker:`/player/${version}/dist/${playerBuild.release.entrypoints.serviceWorker}`,
    release:`/player/${version}/dist/release.json`,
  },
  studio:{
    version,
    versionedBasePath:`/studio/${version}/dist/`,
    currentBasePath:'/studio/current/dist/',
    classic:`/studio/${version}/dist/p2lrn-studio.js`,
    module:`/studio/${version}/dist/p2lrn-studio.esm.js`,
    integrity:{
      classic:sriResources[`/studio/${version}/dist/p2lrn-studio.js`],
      module:sriResources[`/studio/${version}/dist/p2lrn-studio.esm.js`],
    },
    npmPackage:'@p2lrn/studio',
    defaultCoursePath:'course',
  },
  game3d:{
    renderer:'three',
    threeVersion:THREE_VERSION,
    physics:'rapier3d',
    rapier3dVersion:RAPIER3D_VERSION,
    vendorBasePath:`/player/${version}/dist/vendor/`,
  },
  analytics:{
    version:analyticsPackage.version,
    npmPackage:'@p2lrn/analytics',
    versionedBasePath:`/analytics/${version}/dist/`,
    currentBasePath:'/analytics/current/dist/',
    classic:`/analytics/${version}/dist/p2lrn-analytics.js`,
    module:`/analytics/${version}/dist/p2lrn-analytics.esm.js`,
    integrity:{
      classic:sriResources[`/analytics/${version}/dist/p2lrn-analytics.js`],
      module:sriResources[`/analytics/${version}/dist/p2lrn-analytics.esm.js`],
    },
    model:`/analytics/${version}/dist/model.js`,
    release:`/analytics/${version}/dist/release.json`,
  },
  h5p:{
    standaloneVersion:H5P_STANDALONE_VERSION,
    sharedLibraryPackage:'@p2lrn/h5p-libraries',
    sharedLibraryPackageVersion:h5pPackage.version,
    sharedLibraryCount:h5pManifest.libraryCount,
    sharedLibraryMode:'bundled-npm-artifact',
    sourceRepository:'Lumieducation/Lumi',
    sourceCommit:LUMI_H5P_LIBRARY_COMMIT,
    versionedBasePath:`/player/${version}/dist/runtime-host/h5p-libraries/`,
    currentBasePath:'/player/current/dist/runtime-host/h5p-libraries/',
    catalog:'/player/current/dist/runtime-host/h5p-libraries/index.json',
  },
};

await writeFile(join(outputRoot, 'index.json'), JSON.stringify(index, null, 2) + '\n');
await cleanPlayerSourceSnapshot();
await writeFile(
  join(outputRoot, 'health.json'),
  JSON.stringify({
    ok:true,
    playerVersion:version,
    toolkitVersion:toolkitPackage.version,
    h5pLibrariesVersion:h5pPackage.version,
    studioVersion:studioPackage.version,
    threeVersion:THREE_VERSION,
    rapier3dVersion:RAPIER3D_VERSION,
  }, null, 2) + '\n',
);
await writeFile(
  join(outputRoot, 'index.html'),
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>P2LRN CDN</title>
  <meta name="robots" content="noindex">
</head>
<body>
  <main>
    <h1>P2LRN CDN</h1>
    <p>Player version: ${version}</p>
    <p><a href="/player/${version}/dist/release.json">release.json</a></p>
    <p><a href="/player/${version}/dist/runtime-host/h5p-libraries/index.json">H5P library catalog</a></p>
    <p><a href="/index.json">distribution index</a></p>
  </main>
</body>
</html>
`,
);

let headers = '';
headers += headerBlock(
  `/player/${version}/*`,
  'public, max-age=31536000, immutable',
  'public, s-maxage=31536000, immutable',
);
headers += headerBlock('/player/current/*', 'no-store', 'no-store');
headers += headerBlock(`/studio/${version}/*`,'public, max-age=31536000, immutable','public, s-maxage=31536000, immutable');
headers += headerBlock('/studio/current/*','no-store','no-store');
headers += headerBlock(`/analytics/${version}/*`,'public, max-age=31536000, immutable','public, s-maxage=31536000, immutable');
headers += headerBlock('/analytics/current/*','no-store','no-store');

const runtimeCsp = "default-src 'none'; script-src 'self' blob:; style-src 'self' blob: 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob: data:; font-src 'self' blob: data:; connect-src 'self'; frame-src 'self' blob: data: about:; worker-src 'self' blob:; base-uri 'none'; object-src 'none'; form-action 'none'";
 // This exception is exclusive to the sandboxed opaque-origin H5P frame.
 // H5P EmbeddedJS requires eval; the embedding app and all other runtimes
 // retain their strict CSP without unsafe-eval.
const opaqueH5pCsp = "default-src 'none'; script-src 'self' blob: 'unsafe-eval'; style-src 'unsafe-inline' blob:; img-src blob: data:; font-src blob: data:; media-src blob: data:; connect-src blob:; frame-src about: blob:; object-src 'none'; form-action 'none'; base-uri 'none'";
const executablePackageCsp = "default-src 'none'; script-src 'self' 'unsafe-inline' blob:; style-src 'self' blob: 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob: data:; font-src 'self' blob: data:; connect-src 'self'; frame-src 'self' blob: data: about:; worker-src 'self' blob:; base-uri 'none'; object-src 'none'; form-action 'none'";
const opaquePackageCsp = "default-src 'none'; script-src 'self' blob: 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline' blob:; img-src blob: data:; media-src blob: data:; font-src blob: data:; connect-src blob:; frame-src blob: data: about:; object-src 'none'; form-action 'none'; base-uri 'none'";
for (const channel of [version, 'current']) {
  for (const host of ['h5p.html', 'h5p-opaque.html', 'scorm.html', 'package.html', 'package-opaque.html']) {
    const csp = host === 'h5p-opaque.html' ? opaqueH5pCsp : host === 'package-opaque.html' ? opaquePackageCsp : host === 'h5p.html' ? runtimeCsp : executablePackageCsp;
    headers += [
      `/player/${channel}/dist/runtime-host/${host}`,
      `  Content-Security-Policy: ${csp}`,
      '',
    ].join('\n');
    headers += [
      `/player/${channel}/dist/runtime-host/${host}.raw`,
      '  Content-Type: application/octet-stream',
      '  Access-Control-Allow-Origin: *',
      '  X-Content-Type-Options: nosniff',
      '',
    ].join('\n');
  }
}

headers += [
  '/index.json',
  '  Access-Control-Allow-Origin: *',
  '  Cache-Control: public, max-age=0, must-revalidate',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: no-referrer',
  '',
  '/sri.json',
  '  Access-Control-Allow-Origin: *',
  '  Cache-Control: public, max-age=0, must-revalidate',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: no-referrer',
  '',
  '/distribution-parity.json',
  '  Access-Control-Allow-Origin: *',
  '  Cache-Control: no-store',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: no-referrer',
  '',
  '/health.json',
  '  Access-Control-Allow-Origin: *',
  '  Cache-Control: no-store',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: no-referrer',
  '',
].join('\n');

await writeFile(join(outputRoot, '_headers'), headers);
await writeFile(join(outputRoot, '_redirects'), '');

console.log(JSON.stringify({
  ok:true,
  output:outputRoot,
  playerVersion:version,
  toolkitVersion:toolkitPackage.version,
  h5pLibrariesVersion:h5pPackage.version,
  studioVersion:studioPackage.version,
  analyticsVersion:analyticsPackage.version,
  playerFiles:playerBuild.release.files.length,
  parityInventoryFiles:Object.fromEntries(Object.entries(distributionParity.components).map(([key,value])=>[key,value.fileCount])),
  sharedH5pLibraryCount:h5pManifest.libraryCount,
  h5pStandaloneVersion:H5P_STANDALONE_VERSION,
}, null, 2));
