import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {cp, mkdir, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, extname, join, relative, resolve} from 'node:path';

const root = resolve(process.cwd());
const outputRoot = join(root, '.netlify-cdn');
const toolkitWeb = join(root, 'packages', 'toolkit', 'web');
const sdkSource = join(root, 'packages', 'toolkit', 'web-sdk-src');
const playerPackagePath = join(root, 'packages', 'player', 'package.json');
const toolkitPackagePath = join(root, 'packages', 'toolkit', 'package.json');
const compatibilityVersion = '0.5.0-alpha.1';
const H5P_STANDALONE_VERSION = '3.8.2';
const LUMI_H5P_LIBRARY_COMMIT = '236912f8e3c07a6b5c7ece4930b98fec2b6d3f6a';
const execFileAsync = promisify(execFile);

const EXCLUDED_ROOT = new Set(['app.js', 'index.html', 'style.css']);
const SDK_ENTRYPOINTS = ['p2lrn.js', 'p2lrn.esm.js', 'p2rln.js', 'p2rln.esm.js'];
const LOCAL_REF = /(?:from\s+|import\()(['"])(\.{1,2}\/[^'"]+)\1|new URL\((['"])(\.{1,2}\/[^'"]+)\3\s*,\s*import\.meta\.url\)/g;

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

function sha(data, algorithm, encoding) {
  return createHash(algorithm).update(data).digest(encoding);
}

async function copyCanonicalRuntime(dist) {
  await mkdir(dist, {recursive: true});

  for (const source of (await walk(toolkitWeb)).sort()) {
    const rel = relative(toolkitWeb, source).split('\\').join('/');
    const parts = rel.split('/');
    const name = parts.at(-1);
    if (parts.length === 1 && EXCLUDED_ROOT.has(name)) continue;

    const extension = extname(source);
    const allowed =
      extension === '.js' ||
      extension === '.css' ||
      (parts[0] === 'runtime-host' && extension === '.html');
    if (!allowed) continue;

    const target = join(dist, rel);
    await mkdir(dirname(target), {recursive: true});
    await cp(source, target);
  }

  for (const name of SDK_ENTRYPOINTS) {
    await cp(join(sdkSource, name), join(dist, name));
  }
}

async function installH5pRuntimeAssets(dist) {
  const vendorRoot = join(root, '.netlify-vendor', 'h5p-standalone');
  await rm(vendorRoot, {recursive: true, force: true});
  await mkdir(vendorRoot, {recursive: true});

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const {stdout = ''} = await execFileAsync(
    npm,
    ['pack', `h5p-standalone@${H5P_STANDALONE_VERSION}`, '--ignore-scripts', '--silent', '--pack-destination', vendorRoot],
    {cwd: root, maxBuffer: 4 * 1024 * 1024},
  );
  let archiveName = String(stdout).trim().split(/\r?\n/u).filter(Boolean).at(-1);
  if (!archiveName) {
    archiveName = (await readdir(vendorRoot)).find((name) => name.endsWith('.tgz'));
  }
  if (!archiveName) throw new Error('npm pack did not produce an h5p-standalone archive.');

  const archive = join(vendorRoot, archiveName);
  await execFileAsync('tar', ['-xzf', archive, '-C', vendorRoot], {cwd: root, maxBuffer: 4 * 1024 * 1024});

  const packageRoot = join(vendorRoot, 'package');
  const assetsRoot = join(dist, 'runtime-host', 'assets');
  await mkdir(join(assetsRoot, 'styles'), {recursive: true});

  const required = [
    ['dist/main.bundle.js', 'main.bundle.js'],
    ['dist/frame.bundle.js', 'frame.bundle.js'],
    ['dist/styles/h5p.css', 'styles/h5p.css'],
  ];
  for (const [sourceRel, targetRel] of required) {
    const source = join(packageRoot, ...sourceRel.split('/'));
    const target = join(assetsRoot, ...targetRel.split('/'));
    const info = await stat(source);
    if (!info.isFile() || info.size < 1) throw new Error(`Missing H5P runtime asset: ${sourceRel}`);
    await mkdir(dirname(target), {recursive: true});
    await cp(source, target);
  }

  const packageJson = await readJson(join(packageRoot, 'package.json'));
  if (packageJson.version !== H5P_STANDALONE_VERSION) {
    throw new Error(`Unexpected h5p-standalone version: ${packageJson.version}`);
  }
  await writeFile(
    join(assetsRoot, 'h5p-standalone.json'),
    JSON.stringify({name:'h5p-standalone', version:H5P_STANDALONE_VERSION}, null, 2) + '\n',
  );
}


async function installSharedH5pLibraries(dist) {
  const vendorRoot = join(root, '.netlify-vendor', 'lumi-h5p-libraries');
  await rm(vendorRoot, {recursive: true, force: true});
  await mkdir(vendorRoot, {recursive: true});

  const archive = join(vendorRoot, 'lumi-h5p-libraries.tar.gz');
  const url = `https://codeload.github.com/Lumieducation/Lumi/tar.gz/${LUMI_H5P_LIBRARY_COMMIT}`;
  const response = await fetch(url, {redirect: 'follow'});
  if (!response.ok) {
    throw new Error(`Unable to download pinned Lumi H5P library corpus (${response.status}).`);
  }
  await writeFile(archive, new Uint8Array(await response.arrayBuffer()));
  await execFileAsync('tar', ['-xzf', archive, '-C', vendorRoot], {cwd: root, maxBuffer: 8 * 1024 * 1024});

  const extracted = (await readdir(vendorRoot, {withFileTypes: true}))
    .find((entry) => entry.isDirectory() && entry.name.startsWith('Lumi-'));
  if (!extracted) throw new Error('Pinned Lumi archive did not contain an extracted repository directory.');

  const sourceRoot = join(vendorRoot, extracted.name, 'assets', 'h5p', 'libraries');
  const targetRoot = join(dist, 'runtime-host', 'h5p-libraries');
  const sourceInfo = await stat(sourceRoot);
  if (!sourceInfo.isDirectory()) throw new Error('Pinned Lumi archive does not contain assets/h5p/libraries.');

  await cp(sourceRoot, targetRoot, {recursive: true, force: true});

  const catalog = [];
  for (const entry of (await readdir(targetRoot, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const libraryJsonPath = join(targetRoot, entry.name, 'library.json');
    let metadata;
    try {
      metadata = await readJson(libraryJsonPath);
    } catch {
      continue;
    }
    const machineName = String(metadata.machineName ?? '').trim();
    const majorVersion = Number(metadata.majorVersion);
    const minorVersion = Number(metadata.minorVersion);
    const patchVersion = Number(metadata.patchVersion ?? 0);
    if (!machineName || !Number.isInteger(majorVersion) || !Number.isInteger(minorVersion)) continue;

    const expectedFolder = `${machineName}-${majorVersion}.${minorVersion}`;
    if (entry.name !== expectedFolder) {
      throw new Error(`H5P library folder/version mismatch: ${entry.name} != ${expectedFolder}`);
    }

    for (const asset of [
      ...(Array.isArray(metadata.preloadedJs) ? metadata.preloadedJs : []),
      ...(Array.isArray(metadata.preloadedCss) ? metadata.preloadedCss : []),
    ]) {
      const rel = String(asset?.path ?? '');
      if (!rel || rel.startsWith('/') || rel.includes('..') || rel.includes('\\\\')) {
        throw new Error(`Unsafe H5P preloaded asset path in ${entry.name}: ${rel}`);
      }
      const assetInfo = await stat(join(targetRoot, entry.name, ...rel.split('/')));
      if (!assetInfo.isFile()) throw new Error(`Missing H5P preloaded asset: ${entry.name}/${rel}`);
    }

    catalog.push({
      folder: entry.name,
      machineName,
      majorVersion,
      minorVersion,
      patchVersion,
      runnable: Number(metadata.runnable ?? 0) === 1,
    });
  }

  if (catalog.length < 100) {
    throw new Error(`Pinned H5P library corpus is unexpectedly small (${catalog.length} libraries).`);
  }
  for (const required of ['H5P.Crossword-0.5', 'H5P.BranchingScenario-1.8', 'H5P.Question-1.5', 'H5P.JoubelUI-1.3', 'H5P.Image-1.1', 'FontAwesome-4.5']) {
    if (!catalog.some((entry) => entry.folder === required)) {
      throw new Error(`Required shared H5P library is missing from the pinned corpus: ${required}`);
    }
  }

  await writeFile(
    join(targetRoot, 'index.json'),
    JSON.stringify({
      schema: 'https://p2lrn.org/schema/h5p-library-catalog/1',
      source: {
        repository: 'Lumieducation/Lumi',
        commit: LUMI_H5P_LIBRARY_COMMIT,
      },
      libraries: catalog,
    }, null, 2) + '\n',
  );
  return catalog.length;
}

async function assertVersionAlignment(dist, version) {
  const player = await readFile(join(dist, 'p2lrn-player.js'), 'utf8');
  const loader = await readFile(join(dist, 'p2lrn.js'), 'utf8');

  const runtimeVersion = player.match(/P2LRN_WEB_SDK_VERSION\s*=\s*['"]([^'"]+)['"]/u)?.[1];
  const loaderVersion = loader.match(/const\s+version\s*=\s*['"]([^'"]+)['"]/u)?.[1];

  if (runtimeVersion !== version) {
    throw new Error(`Player version mismatch: package.json=${version}, runtime=${runtimeVersion ?? 'missing'}`);
  }
  if (loaderVersion !== version) {
    throw new Error(`Loader version mismatch: package.json=${version}, loader=${loaderVersion ?? 'missing'}`);
  }
}

async function validateLocalReferences(dist) {
  const missing = [];

  for (const source of (await walk(dist)).filter((path) => path.endsWith('.js')).sort()) {
    const text = await readFile(source, 'utf8');
    LOCAL_REF.lastIndex = 0;
    let match;
    while ((match = LOCAL_REF.exec(text))) {
      const raw = match[2] || match[4];
      if (!raw) continue;
      const path = raw.split('?', 1)[0].split('#', 1)[0];
      const target = resolve(dirname(source), path);
      const rel = relative(resolve(dist), target);
      if (rel.startsWith('..') || resolve(target) === resolve(dist)) {
        missing.push(`${relative(dist, source)} -> unsafe ${raw}`);
        continue;
      }
      try {
        const info = await stat(target);
        if (!info.isFile() && !(raw.endsWith('/') && info.isDirectory())) missing.push(`${relative(dist, source)} -> missing ${raw}`);
      } catch {
        missing.push(`${relative(dist, source)} -> missing ${raw}`);
      }
    }
  }

  if (missing.length) {
    throw new Error('Generated Web SDK has unresolved local references:\n' + missing.join('\n'));
  }
}

async function writeRelease(dist, {version, toolkitVersion}) {
  const files = [];

  for (const path of (await walk(dist)).filter((p) => !p.endsWith('release.json')).sort()) {
    const data = await readFile(path);
    files.push({
      path: relative(dist, path).split('\\').join('/'),
      bytes: data.byteLength,
      sha256: 'sha256:' + sha(data, 'sha256', 'hex'),
      sri: 'sha384-' + sha(data, 'sha384', 'base64'),
    });
  }

  const release = {
    schema: 'https://p2lrn.org/schema/web-sdk-release/1',
    version: '1',
    webSdkVersion: version,
    toolkitVersion,
    coreVersion: '0.4.0',
    entrypoints: {
      classic: 'p2lrn.js',
      module: 'p2lrn.esm.js',
      serviceWorker: 'p2lrn-sw.js',
    },
    files,
  };

  await writeFile(join(dist, 'release.json'), JSON.stringify(release, null, 2) + '\n');
  return release;
}

async function copyIfPresent(from, to) {
  try {
    const info = await stat(from);
    if (!info.isDirectory()) return false;
  } catch {
    return false;
  }
  await mkdir(dirname(to), {recursive: true});
  await cp(from, to, {recursive: true, force: true});
  return true;
}

function headerBlock(path, cacheControl, edgeCacheControl) {
  return [
    path,
    '  Access-Control-Allow-Origin: *',
    '  Cross-Origin-Resource-Policy: cross-origin',
    `  Cache-Control: ${cacheControl}`,
    `  Netlify-CDN-Cache-Control: ${edgeCacheControl}`,
    '  X-Content-Type-Options: nosniff',
    '',
  ].join('\n');
}

const playerPackage = await readJson(playerPackagePath);
const toolkitPackage = await readJson(toolkitPackagePath);
const version = playerPackage.version;

await rm(outputRoot, {recursive: true, force: true});

const versionedDist = join(outputRoot, 'player', version, 'dist');
await copyCanonicalRuntime(versionedDist);
await installH5pRuntimeAssets(versionedDist);
const sharedH5pLibraryCount = await installSharedH5pLibraries(versionedDist);
await assertVersionAlignment(versionedDist, version);
await validateLocalReferences(versionedDist);
const release = await writeRelease(versionedDist, {
  version,
  toolkitVersion: toolkitPackage.version,
});

// Stable development channel: always points at the runtime built from current main.
await cp(versionedDist, join(outputRoot, 'player', 'current', 'dist'), {
  recursive: true,
  force: true,
});

// Backward-compatible URL already used by existing integrations.
// This is deliberately mutable and therefore MUST NOT use immutable caching.
if (version !== compatibilityVersion) {
  await cp(versionedDist, join(outputRoot, 'player', compatibilityVersion, 'dist'), {
    recursive: true,
    force: true,
  });
}

const packagesCopied = await copyIfPresent(
  join(root, 'deploy', 'netlify', 'packages'),
  join(outputRoot, 'packages'),
);

const index = {
  schema: 'https://p2lrn.org/schema/cdn-index/1',
  generatedFrom: 'packages/toolkit/web + packages/toolkit/web-sdk-src',
  player: {
    version,
    versionedBasePath: `/player/${version}/dist/`,
    currentBasePath: '/player/current/dist/',
    compatibilityBasePath: `/player/${compatibilityVersion}/dist/`,
    classic: `/player/${version}/dist/${release.entrypoints.classic}`,
    module: `/player/${version}/dist/${release.entrypoints.module}`,
    serviceWorker: `/player/${version}/dist/${release.entrypoints.serviceWorker}`,
    release: `/player/${version}/dist/release.json`,
  },
  packagesPath: packagesCopied ? '/packages/' : null,
};

await writeFile(join(outputRoot, 'index.json'), JSON.stringify(index, null, 2) + '\n');
await writeFile(
  join(outputRoot, 'health.json'),
  JSON.stringify({ok: true, playerVersion: version}, null, 2) + '\n',
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
headers += headerBlock(
  '/player/current/*',
  'public, max-age=0, must-revalidate',
  'public, s-maxage=60, must-revalidate',
);
if (version !== compatibilityVersion) {
  headers += headerBlock(
    `/player/${compatibilityVersion}/*`,
    'public, max-age=0, must-revalidate',
    'public, s-maxage=60, must-revalidate',
  );
}
headers += [
  `/player/${version}/dist/runtime-host/h5p.html`,
  "  Content-Security-Policy: default-src 'none'; script-src 'self' blob:; style-src 'self' blob: 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob: data:; font-src 'self' blob: data:; connect-src 'self'; frame-src 'self' blob: data: about:; worker-src 'self' blob:; base-uri 'none'; object-src 'none'; form-action 'none'",
  '',
  '/player/current/dist/runtime-host/h5p.html',
  "  Content-Security-Policy: default-src 'none'; script-src 'self' blob:; style-src 'self' blob: 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob: data:; font-src 'self' blob: data:; connect-src 'self'; frame-src 'self' blob: data: about:; worker-src 'self' blob:; base-uri 'none'; object-src 'none'; form-action 'none'",
  '',
  `/player/${compatibilityVersion}/dist/runtime-host/h5p.html`,
  "  Content-Security-Policy: default-src 'none'; script-src 'self' blob:; style-src 'self' blob: 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob: data:; font-src 'self' blob: data:; connect-src 'self'; frame-src 'self' blob: data: about:; worker-src 'self' blob:; base-uri 'none'; object-src 'none'; form-action 'none'",
  '',
].join('\n');

headers += [
  '/packages/*',
  '  Access-Control-Allow-Origin: *',
  '  Access-Control-Expose-Headers: Accept-Ranges, Content-Length, Content-Range, ETag, Last-Modified',
  '  Cross-Origin-Resource-Policy: cross-origin',
  '  Cache-Control: public, max-age=31536000, immutable',
  '  Netlify-CDN-Cache-Control: public, s-maxage=31536000, immutable',
  '  X-Content-Type-Options: nosniff',
  '',
  '/index.json',
  '  Access-Control-Allow-Origin: *',
  '  Cache-Control: public, max-age=0, must-revalidate',
  '',
  '/health.json',
  '  Access-Control-Allow-Origin: *',
  '  Cache-Control: no-store',
  '',
].join('\n');

await writeFile(join(outputRoot, '_headers'), headers);

console.log(JSON.stringify({
  ok: true,
  output: outputRoot,
  playerVersion: version,
  compatibilityVersion,
  files: release.files.length,
  packagesCopied,
  h5pStandaloneVersion: H5P_STANDALONE_VERSION,
  sharedH5pLibraryCount,
  sharedH5pLibrarySourceCommit: LUMI_H5P_LIBRARY_COMMIT,
}, null, 2));
