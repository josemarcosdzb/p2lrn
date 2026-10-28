import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {promisify} from 'node:util';
import {join, resolve} from 'node:path';
import {buildPlayerDistribution, H5P_STANDALONE_VERSION, THREE_VERSION, RAPIER3D_VERSION} from '../../packages/player/scripts/build-dist.mjs';
import {cleanPlayerSourceSnapshot, preparePlayerSourceSnapshot} from '../../packages/player/scripts/prepare-source-snapshot.mjs';
import {buildH5pLibraries, LUMI_H5P_LIBRARY_COMMIT} from '../../packages/h5p-libraries/scripts/build.mjs';

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

// Mutable development channel.
await cp(versionedDist, join(outputRoot, 'player', 'current', 'dist'), {
  recursive:true,
  force:true,
});
await cp(versionedSource, join(outputRoot, 'player', 'current', 'source'), {
  recursive:true,
  force:true,
});

const index = {
  schema:'https://p2lrn.org/schema/cdn-index/1',
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
    serviceWorker:`/player/${version}/dist/${playerBuild.release.entrypoints.serviceWorker}`,
    release:`/player/${version}/dist/release.json`,
  },
  studio:{
    version,
    versionedBasePath:`/studio/${version}/dist/`,
    currentBasePath:'/studio/current/dist/',
    classic:`/studio/${version}/dist/p2lrn-studio.js`,
    module:`/studio/${version}/dist/p2lrn-studio.esm.js`,
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
const executablePackageCsp = "default-src 'none'; script-src 'self' 'unsafe-inline' blob:; style-src 'self' blob: 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob: data:; font-src 'self' blob: data:; connect-src 'self'; frame-src 'self' blob: data: about:; worker-src 'self' blob:; base-uri 'none'; object-src 'none'; form-action 'none'";
for (const channel of [version, 'current']) {
  for (const host of ['h5p.html', 'scorm.html', 'package.html']) {
    const csp = host === 'h5p.html' ? runtimeCsp : executablePackageCsp;
    headers += [
      `/player/${channel}/dist/runtime-host/${host}`,
      `  Content-Security-Policy: ${csp}`,
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
  sharedH5pLibraryCount:h5pManifest.libraryCount,
  h5pStandaloneVersion:H5P_STANDALONE_VERSION,
}, null, 2));
