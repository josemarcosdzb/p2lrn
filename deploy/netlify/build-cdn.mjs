import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';

const root = resolve(process.cwd());
const playerRoot = join(root, 'packages', 'player');
const playerDist = join(playerRoot, 'dist');
const playerPackageJsonPath = join(playerRoot, 'package.json');
const releaseJsonPath = join(playerDist, 'release.json');
const outputRoot = join(root, '.netlify-cdn');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function sha256(path) {
  const bytes = await readFile(path);
  return createHash('sha256').update(bytes).digest('hex');
}

async function validateRelease(playerPackage, release) {
  if (!release?.webSdkVersion) throw new Error('release.json: missing webSdkVersion');
  if (release.webSdkVersion !== playerPackage.version) {
    throw new Error(
      `Version mismatch: package.json=${playerPackage.version}, release.json=${release.webSdkVersion}`,
    );
  }

  for (const entry of release.files ?? []) {
    if (!entry?.path || !entry?.sha256 || !Number.isInteger(entry?.bytes)) {
      throw new Error(`release.json: invalid entry ${JSON.stringify(entry)}`);
    }

    const absolute = join(playerDist, entry.path);
    const info = await stat(absolute);
    if (!info.isFile()) throw new Error(`Not a file: ${entry.path}`);
    if (info.size !== entry.bytes) {
      throw new Error(`Size mismatch for ${entry.path}: expected ${entry.bytes}, got ${info.size}`);
    }

    const actual = await sha256(absolute);
    const expected = String(entry.sha256).replace(/^sha256:/, '');
    if (actual !== expected) {
      throw new Error(`SHA-256 mismatch for ${entry.path}`);
    }
  }
}

async function copyIfPresent(from, to) {
  try {
    const info = await stat(from);
    if (!info.isDirectory()) return false;
  } catch {
    return false;
  }
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to, { recursive: true, force: true });
  return true;
}

const playerPackage = await readJson(playerPackageJsonPath);
const release = await readJson(releaseJsonPath);

await validateRelease(playerPackage, release);

await rm(outputRoot, { recursive: true, force: true });

const version = playerPackage.version;
const versionedPlayerRoot = join(outputRoot, 'player', version);
await mkdir(versionedPlayerRoot, { recursive: true });
await cp(playerDist, join(versionedPlayerRoot, 'dist'), { recursive: true, force: true });

// Optional public .p2lrn objects can be staged here. The directory is
// intentionally separate from canonical examples and from the SDK runtime.
const packagesCopied = await copyIfPresent(
  join(root, 'deploy', 'netlify', 'packages'),
  join(outputRoot, 'packages'),
);

const index = {
  schema: 'https://p2lrn.org/schema/cdn-index/1',
  generatedFrom: 'packages/player/dist/release.json',
  player: {
    version,
    basePath: posix.join('/player', version, 'dist') + '/',
    classic: posix.join('/player', version, 'dist', release.entrypoints.classic),
    module: posix.join('/player', version, 'dist', release.entrypoints.module),
    serviceWorker: posix.join('/player', version, 'dist', release.entrypoints.serviceWorker),
    release: posix.join('/player', version, 'dist', 'release.json'),
  },
  packagesPath: packagesCopied ? '/packages/' : null,
};

const headers = `/player/*
  Access-Control-Allow-Origin: *
  Cross-Origin-Resource-Policy: cross-origin
  Cache-Control: public, max-age=31536000, immutable
  Netlify-CDN-Cache-Control: public, s-maxage=31536000, immutable
  X-Content-Type-Options: nosniff

/packages/*
  Access-Control-Allow-Origin: *
  Access-Control-Expose-Headers: Accept-Ranges, Content-Length, Content-Range, ETag, Last-Modified
  Cross-Origin-Resource-Policy: cross-origin
  Cache-Control: public, max-age=31536000, immutable
  Netlify-CDN-Cache-Control: public, s-maxage=31536000, immutable
  Content-Type: application/vnd.p2lrn+zip
  X-Content-Type-Options: nosniff

/index.json
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=300, must-revalidate
  X-Content-Type-Options: nosniff

/health.json
  Access-Control-Allow-Origin: *
  Cache-Control: no-store
  X-Content-Type-Options: nosniff
`;

const landingPage = `<!doctype html>
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
    <p><a href="/index.json">Distribution index</a></p>
    <p><a href="/player/${version}/dist/release.json">Player release manifest</a></p>
  </main>
</body>
</html>
`;

await writeFile(join(outputRoot, '_headers'), headers);
await writeFile(join(outputRoot, 'index.html'), landingPage);
await writeFile(join(outputRoot, 'index.json'), JSON.stringify(index, null, 2) + '\n');
await writeFile(
  join(outputRoot, 'health.json'),
  JSON.stringify({ ok: true, playerVersion: version }, null, 2) + '\n',
);

console.log(`P2LRN CDN tree ready: player ${version}`);
console.log(`Drag this folder into Netlify Drop: ${outputRoot}`);
