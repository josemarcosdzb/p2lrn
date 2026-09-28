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

// Optional public .p2lrn objects can be committed/staged here. The directory is
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

await writeFile(join(outputRoot, 'index.json'), JSON.stringify(index, null, 2) + '\n');
await writeFile(
  join(outputRoot, 'health.json'),
  JSON.stringify({ ok: true, playerVersion: version }, null, 2) + '\n',
);

console.log(`P2LRN CDN tree ready: player ${version}`);
console.log(`Publish directory: ${outputRoot}`);
