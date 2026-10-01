import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {buildPlayerDistribution, H5P_STANDALONE_VERSION, THREE_VERSION, RAPIER3D_VERSION} from '../../packages/player/scripts/build-dist.mjs';
import {buildH5pLibraries, LUMI_H5P_LIBRARY_COMMIT} from '../../packages/h5p-libraries/scripts/build.mjs';

const root = resolve(process.cwd());
const outputRoot = join(root, '.netlify-cdn');
const playerPackagePath = join(root, 'packages', 'player', 'package.json');
const toolkitPackagePath = join(root, 'packages', 'toolkit', 'package.json');
const h5pPackagePath = join(root, 'packages', 'h5p-libraries', 'package.json');

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
const version = playerPackage.version;

if (toolkitPackage.version !== version || h5pPackage.version !== version) {
  throw new Error(
    `P2LRN npm versions must align before CDN build: player=${version}, toolkit=${toolkitPackage.version}, h5p-libraries=${h5pPackage.version}`,
  );
}

await rm(outputRoot, {recursive:true, force:true});

const versionedDist = join(outputRoot, 'player', version, 'dist');
const playerBuild = await buildPlayerDistribution({output:versionedDist});

const h5pPackageDist = join(root, 'packages', 'h5p-libraries', 'dist');
const h5pManifest = await buildH5pLibraries({output:h5pPackageDist});
await cp(
  h5pPackageDist,
  join(versionedDist, 'runtime-host', 'h5p-libraries'),
  {recursive:true, force:true},
);

// Mutable development channel.
await cp(versionedDist, join(outputRoot, 'player', 'current', 'dist'), {
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
  game3d:{
    renderer:'three',
    threeVersion:THREE_VERSION,
    physics:'rapier3d',
    rapier3dVersion:RAPIER3D_VERSION,
    vendorBasePath:`/player/${version}/dist/vendor/`,
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
await writeFile(
  join(outputRoot, 'health.json'),
  JSON.stringify({
    ok:true,
    playerVersion:version,
    toolkitVersion:toolkitPackage.version,
    h5pLibrariesVersion:h5pPackage.version,
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
  playerFiles:playerBuild.release.files.length,
  sharedH5pLibraryCount:h5pManifest.libraryCount,
  h5pStandaloneVersion:H5P_STANDALONE_VERSION,
}, null, 2));
