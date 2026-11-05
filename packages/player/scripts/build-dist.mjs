import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, extname, join, relative, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {
  H5P_STANDALONE_VERSION,
  THREE_VERSION,
  RAPIER3D_VERSION,
  installWebRuntimeAssets,
} from '../../toolkit/web-build/runtime-assets.mjs';
export {H5P_STANDALONE_VERSION, THREE_VERSION, RAPIER3D_VERSION} from '../../toolkit/web-build/runtime-assets.mjs';

const EXCLUDED = new Set(['app.js', 'index.html', 'style.css']);
const LOCAL_REF = /(?:from\s+|import\()(['"])(\.{1,2}\/[^'"]+)\1|new URL\((['"])(\.{1,2}\/[^'"]+)\3\s*,\s*import\.meta\.url\)/g;

const here = dirname(fileURLToPath(import.meta.url));
const playerRoot = resolve(here, '..');
const repoRoot = resolve(playerRoot, '..', '..');
const toolkitRoot = join(repoRoot, 'packages', 'toolkit');
const packagedToolkitRoot = join(playerRoot, 'source', 'packages', 'toolkit');

async function directoryExists(path) {
  try { return (await stat(path)).isDirectory(); }
  catch { return false; }
}

async function resolveToolkitSourceRoot() {
  if (await directoryExists(join(toolkitRoot,'web'))) return toolkitRoot;
  if (await directoryExists(join(packagedToolkitRoot,'web'))) return packagedToolkitRoot;
  throw new Error('P2LRN Player source snapshot is missing toolkit/web and toolkit/web-sdk-src.');
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function sha(data, algorithm, encoding) {
  return createHash(algorithm).update(data).digest(encoding);
}

export async function copyCanonicalRuntime(dist) {
  const canonicalToolkitRoot = await resolveToolkitSourceRoot();
  const web = join(canonicalToolkitRoot, 'web');
  const sdk = join(canonicalToolkitRoot, 'web-sdk-src');
  for (const source of (await walk(web)).sort()) {
    const rel = relative(web, source).replaceAll('\\','/');
    const parts = rel.split('/');
    const name = parts.at(-1);
    if ((parts.length === 1 && EXCLUDED.has(name)) || EXCLUDED.has(parts[0])) continue;
    const extension = extname(source);
    const allowed = ['.js','.css'].includes(extension) || (parts[0] === 'runtime-host' && extension === '.html');
    if (!allowed) continue;
    const target = join(dist, ...rel.split('/'));
    await mkdir(dirname(target), {recursive:true});
    await cp(source, target);
  }
  // Generate a classic, self-contained bootstrap: sandboxed opaque frames cannot
  // import ESM modules reliably when third-party hosts omit CORS headers.
  // This source is copied into the Player npm runtime and deployed unchanged on CDN.
  const {startH5PRuntime} = await import(pathToFileURL(join(web,'h5p-runtime-shell.js')).href);
  const standalone = '(' + startH5PRuntime.toString() + ')();\n';
  await writeFile(join(dist,'runtime-host','h5p-opaque.js'),standalone,'utf8');
  for (const name of ['p2lrn.js','p2lrn.esm.js','p2rln.js','p2rln.esm.js']) {
    await cp(join(sdk, name), join(dist, name));
  }
}

export async function validateLocalReferences(dist) {
  const missing = [];
  for (const source of (await walk(dist)).filter((path)=>path.endsWith('.js')).sort()) {
    const text = await readFile(source, 'utf8');
    LOCAL_REF.lastIndex = 0;
    let match;
    while ((match = LOCAL_REF.exec(text))) {
      const raw = match[2] || match[4];
      if (!raw) continue;
      const clean = raw.split('?',1)[0].split('#',1)[0];
      const target = resolve(dirname(source), clean);
      const rel = relative(resolve(dist), target);
      if (rel.startsWith('..') || resolve(target) === resolve(dist)) {
        missing.push(`${relative(dist,source)} -> unsafe ${raw}`);
        continue;
      }
      try {
        const info = await stat(target);
        if (!info.isFile() && !(raw.endsWith('/') && info.isDirectory())) missing.push(`${relative(dist,source)} -> missing ${raw}`);
      } catch {
        missing.push(`${relative(dist,source)} -> missing ${raw}`);
      }
    }
  }
  if (missing.length) throw new Error('Player distribution has unresolved local references:\n' + missing.join('\n'));
}

export async function writeRelease(dist, playerVersion, toolkitVersion) {
  const files = [];
  for (const path of (await walk(dist)).filter((path)=>!path.endsWith('release.json')).sort()) {
    const data = await readFile(path);
    files.push({
      path:relative(dist,path).replaceAll('\\','/'),
      bytes:data.byteLength,
      sha256:'sha256:' + sha(data,'sha256','hex'),
      sri:'sha384-' + sha(data,'sha384','base64'),
    });
  }
  let sourceManifest = null;
  try {
    sourceManifest = JSON.parse(await readFile(join(playerRoot,'source','SOURCE-MANIFEST.json'),'utf8'));
  } catch {}
  const sourceRef = sourceManifest?.sourceRef ?? process.env.GITHUB_SHA ?? process.env.COMMIT_REF ?? null;
  const release = {
    schema:'https://p2lrn.org/schema/web-sdk-release/1',
    version:'1',
    license:{
      id:'P2LRN-NCSL-1.0',
      name:'P2LRN Non-Commercial Source License 1.0',
      file:'LICENSE',
      notice:'NOTICE.md',
    },
    source:{
      correspondingSource:'../source/',
      manifest:'../source/SOURCE-MANIFEST.json',
      sourceRef,
    },
    webSdkVersion:playerVersion,
    toolkitVersion,
    coreVersion:'0.4.0',
    h5pStandaloneVersion:H5P_STANDALONE_VERSION,
    threeVersion:THREE_VERSION,
    rapier3dVersion:RAPIER3D_VERSION,
    h5pLibrariesPackage:'@p2lrn/h5p-libraries',
    entrypoints:{classic:'p2lrn.js',module:'p2lrn.esm.js',serviceWorker:'p2lrn-sw.js'},
    files,
  };
  await writeFile(join(dist,'release.json'), JSON.stringify(release,null,2)+'\n');
  return release;
}

export async function buildPlayerDistribution({output = join(playerRoot, 'dist')} = {}) {
  const playerPackage = JSON.parse(await readFile(join(playerRoot,'package.json'),'utf8'));
  const toolkitPackage = JSON.parse(await readFile(join(toolkitRoot,'package.json'),'utf8'));
  await rm(output,{recursive:true,force:true});
  await mkdir(output,{recursive:true});
  await copyCanonicalRuntime(output);
  await installWebRuntimeAssets(output);
  await cp(join(playerRoot,'LICENSE'),join(output,'LICENSE'));
  await cp(join(playerRoot,'NOTICE.md'),join(output,'NOTICE.md'));
  await validateLocalReferences(output);

  const playerSource = await readFile(join(output,'p2lrn-player.js'),'utf8');
  const loaderSource = await readFile(join(output,'p2lrn.js'),'utf8');
  const runtimeVersion = /P2LRN_WEB_SDK_VERSION\s*=\s*'([^']+)'/u.exec(playerSource)?.[1];
  const runtimeToolkitVersion = /P2LRN_TOOLKIT_VERSION\s*=\s*'([^']+)'/u.exec(playerSource)?.[1];
  const loaderVersion = /const version\s*=\s*'([^']+)'/u.exec(loaderSource)?.[1];
  if (runtimeVersion !== playerPackage.version || loaderVersion !== playerPackage.version) {
    throw new Error(`Player version mismatch: package=${playerPackage.version}, runtime=${runtimeVersion}, loader=${loaderVersion}`);
  }
  if (runtimeToolkitVersion !== toolkitPackage.version) {
    throw new Error(`Toolkit version mismatch: package=${toolkitPackage.version}, runtime=${runtimeToolkitVersion}`);
  }

  const release = await writeRelease(output, playerPackage.version, toolkitPackage.version);
  return {output, release};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildPlayerDistribution();
  const message=JSON.stringify({output:result.output,version:result.release.webSdkVersion,files:result.release.files.length},null,2)+'\n';
  if (process.env.npm_config_json === 'true') process.stderr.write(message);
  else process.stdout.write(message);
}
