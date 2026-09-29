import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const version = String(process.argv[2] ?? '').trim();
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
  console.error('Usage: node scripts/set-version.mjs <semver>');
  process.exit(2);
}

async function updateJson(relative, mutate) {
  const path = resolve(root, relative);
  const value = JSON.parse(await readFile(path, 'utf8'));
  mutate(value);
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
}

async function replace(relative, pattern, replacement, label) {
  const path = resolve(root, relative);
  const before = await readFile(path, 'utf8');
  const after = before.replace(pattern, replacement);
  if (after === before) throw new Error(`Version marker not found in ${relative}: ${label}`);
  await writeFile(path, after);
}

await updateJson('packages/player/package.json', (pkg) => {
  pkg.version = version;
  if (pkg.peerDependencies?.['@p2lrn/h5p-libraries']) pkg.peerDependencies['@p2lrn/h5p-libraries'] = version;
});
await updateJson('packages/toolkit/package.json', (pkg) => { pkg.version = version; });
await updateJson('packages/h5p-libraries/package.json', (pkg) => { pkg.version = version; });
await updateJson('packages/toolkit/config/capabilities.json', (value) => { value.product.version = version; });

await replace(
  'packages/toolkit/web/p2lrn-player.js',
  /export const P2LRN_WEB_SDK_VERSION = '[^']+';/u,
  `export const P2LRN_WEB_SDK_VERSION = '${version}';`,
  'P2LRN_WEB_SDK_VERSION',
);
await replace(
  'packages/toolkit/web/p2lrn-player.js',
  /export const P2LRN_TOOLKIT_VERSION = '[^']+';/u,
  `export const P2LRN_TOOLKIT_VERSION = '${version}';`,
  'P2LRN_TOOLKIT_VERSION',
);
await replace(
  'packages/toolkit/web-sdk-src/p2lrn.js',
  /const version = '[^']+';/u,
  `const version = '${version}';`,
  'loader version',
);
await replace(
  'packages/toolkit/src/tools/build-web-sdk.ts',
  /webSdkVersion:'[^']+'/u,
  `webSdkVersion:'${version}'`,
  'webSdkVersion',
);
await replace(
  'packages/toolkit/src/tools/build-web-sdk.ts',
  /toolkitVersion:'[^']+'/u,
  `toolkitVersion:'${version}'`,
  'toolkitVersion',
);
await replace(
  'packages/h5p-libraries/scripts/build.mjs',
  /packageVersion:'[^']+'/u,
  `packageVersion:'${version}'`,
  'H5P packageVersion',
);
await replace(
  'packages/toolkit/test/toolkit.test.mjs',
  /assert\.equal\(capabilities\.product\.version,'[^']+'\);/u,
  `assert.equal(capabilities.product.version,'${version}');`,
  'capabilities test version',
);

for (const relative of ['README.md','packages/player/README.md','PUBLISHING.md']) {
  const path = resolve(root, relative);
  const before = await readFile(path, 'utf8');
  const after = before.replaceAll(/0\.5\.0-alpha\.\d+/gu, version);
  await writeFile(path, after);
}

console.log(JSON.stringify({
  ok:true,
  version,
  aligned:[
    '@p2lrn/player',
    '@p2lrn/toolkit',
    '@p2lrn/h5p-libraries',
    'browser runtime',
    'CDN loader',
    'release metadata',
    'capabilities',
    'documentation',
  ],
}, null, 2));
