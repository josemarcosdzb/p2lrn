import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, extname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
export const H5P_STANDALONE_VERSION = '3.8.2';
export const H5P_STANDALONE_INTEGRITY = 'sha512-r7eQtTzBk/dbaQZ+tA9XD5FeSmyMxlypRZXudiheCnC8zAT0/zNgUvO4MZtZaznwfYVo98o7do5uxLTUQrxxwg==';
export const THREE_VERSION = '0.186.1';
export const THREE_INTEGRITY = 'sha512-blFeqb49wRCSGUGj7gtpfnSGHy2lwDk94RhUmS1c/hTby70kvChbWpkJ4Pm1390LqzzvTmzgXKHPEafJwCb8jA==';
export const RAPIER3D_VERSION = '0.21.0';
export const RAPIER3D_INTEGRITY = 'sha512-tCl1HPGwOhn5aCQbgqWbOH+Nx/5fnr3IPAnzQuR7zIhC/raqi2yxC6LhvZqjdI2El5hQgY5RDAwDrAjAi2FdPA==';
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

async function copyCanonicalRuntime(dist) {
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
  for (const name of ['p2lrn.js','p2lrn.esm.js','p2rln.js','p2rln.esm.js']) {
    await cp(join(sdk, name), join(dist, name));
  }
}

async function installH5pStandalone(dist) {
  const work = join(playerRoot, '.build-h5p-standalone');
  await rm(work, {recursive:true, force:true});
  await mkdir(work, {recursive:true});
  let npmCommand='npm';
  let npmArgs=['pack', `h5p-standalone@${H5P_STANDALONE_VERSION}`, '--ignore-scripts', '--silent', '--pack-destination', work];
  if (process.platform === 'win32') {
    const candidates=[
      process.env.npm_execpath,
      join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js'),
    ].filter(Boolean);
    let npmCli=null;
    for (const candidate of candidates) {
      try {
        if ((await stat(candidate)).isFile()) { npmCli=candidate; break; }
      } catch {}
    }
    if (!npmCli) throw new Error('Unable to locate npm-cli.js for safe Windows execution.');
    npmCommand=process.execPath;
    npmArgs=[npmCli,...npmArgs];
  }
  await execFileAsync(
    npmCommand,
    npmArgs,
    {cwd:playerRoot, maxBuffer:4*1024*1024},
  );
  const archives = (await readdir(work)).filter((name)=>name.endsWith('.tgz'));
  if (archives.length !== 1) {
    throw new Error(`npm pack produced ${archives.length} h5p-standalone archives; expected exactly one.`);
  }
  const [archiveName] = archives;
  const archivePath = join(work, archiveName);
  const archiveBytes = await readFile(archivePath);
  const actualIntegrity = 'sha512-' + createHash('sha512').update(archiveBytes).digest('base64');
  if (actualIntegrity !== H5P_STANDALONE_INTEGRITY) {
    throw new Error(`h5p-standalone tarball integrity mismatch: expected ${H5P_STANDALONE_INTEGRITY}, got ${actualIntegrity}`);
  }
  await execFileAsync('tar', ['-xzf', archivePath, '-C', work], {maxBuffer:4*1024*1024});
  const sourceRoot = join(work, 'package');
  const metadata = JSON.parse(await readFile(join(sourceRoot, 'package.json'), 'utf8'));
  if (metadata.version !== H5P_STANDALONE_VERSION) throw new Error(`Unexpected h5p-standalone version: ${metadata.version}`);

  const assetsRoot = join(dist, 'runtime-host', 'assets');
  await mkdir(join(assetsRoot, 'styles'), {recursive:true});
  for (const [from,to] of [
    ['dist/main.bundle.js','main.bundle.js'],
    ['dist/frame.bundle.js','frame.bundle.js'],
    ['dist/styles/h5p.css','styles/h5p.css'],
  ]) {
    const source = join(sourceRoot, ...from.split('/'));
    if (!(await stat(source)).isFile()) throw new Error(`Missing h5p-standalone asset: ${from}`);
    const target = join(assetsRoot, ...to.split('/'));
    await mkdir(dirname(target), {recursive:true});
    await cp(source, target);
  }
  await cp(join(sourceRoot, 'LICENSE'), join(assetsRoot, 'LICENSE.h5p-standalone.txt'));
  await writeFile(
    join(assetsRoot, 'h5p-standalone.json'),
    JSON.stringify({name:'h5p-standalone',version:H5P_STANDALONE_VERSION,license:'MIT'}, null, 2) + '\n',
  );
  await rm(work, {recursive:true, force:true});
}

async function npmPackExact(spec, work, expectedIntegrity) {
  await mkdir(work, {recursive:true});
  let npmCommand='npm';
  let npmArgs=['pack', spec, '--ignore-scripts', '--silent', '--pack-destination', work];
  if (process.platform === 'win32') {
    const candidates=[
      process.env.npm_execpath,
      join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js'),
    ].filter(Boolean);
    let npmCli=null;
    for (const candidate of candidates) {
      try {
        if ((await stat(candidate)).isFile()) { npmCli=candidate; break; }
      } catch {}
    }
    if (!npmCli) throw new Error('Unable to locate npm-cli.js for safe Windows execution.');
    npmCommand=process.execPath;
    npmArgs=[npmCli,...npmArgs];
  }
  await execFileAsync(npmCommand,npmArgs,{cwd:playerRoot,maxBuffer:4*1024*1024});
  const archives=(await readdir(work)).filter((name)=>name.endsWith('.tgz'));
  if (archives.length !== 1) throw new Error(`npm pack produced ${archives.length} archives for ${spec}; expected exactly one.`);
  const archivePath=join(work,archives[0]);
  const bytes=await readFile(archivePath);
  const actual='sha512-'+createHash('sha512').update(bytes).digest('base64');
  if (actual !== expectedIntegrity) throw new Error(`${spec} tarball integrity mismatch: expected ${expectedIntegrity}, got ${actual}`);
  await execFileAsync('tar',['-xzf',archivePath,'-C',work],{maxBuffer:4*1024*1024});
  return join(work,'package');
}

async function installGame3dRuntime(dist) {
  const work=join(playerRoot,'.build-game3d-runtime');
  await rm(work,{recursive:true,force:true});
  await mkdir(work,{recursive:true});
  const threeRoot=await npmPackExact(`three@${THREE_VERSION}`,join(work,'three'),THREE_INTEGRITY);
  const rapierRoot=await npmPackExact(`@dimforge/rapier3d-compat@${RAPIER3D_VERSION}`,join(work,'rapier'),RAPIER3D_INTEGRITY);
  const vendor=join(dist,'vendor');
  await mkdir(vendor,{recursive:true});
  await cp(join(threeRoot,'build','three.module.js'),join(vendor,'three.module.js'));
  await cp(join(threeRoot,'build','three.core.js'),join(vendor,'three.core.js'));
  await cp(join(threeRoot,'LICENSE'),join(vendor,'LICENSE.three.txt'));
  await cp(join(rapierRoot,'dist','rapier.mjs'),join(vendor,'rapier3d.mjs'));
  await cp(join(rapierRoot,'LICENSE'),join(vendor,'LICENSE.rapier3d.txt'));
  await writeFile(
    join(vendor,'game-3d-runtime.json'),
    JSON.stringify({
      three:{name:'three',version:THREE_VERSION,license:'MIT'},
      physics:{name:'@dimforge/rapier3d-compat',version:RAPIER3D_VERSION,license:'Apache-2.0'},
    },null,2)+'\n',
  );
  await rm(work,{recursive:true,force:true});
}

async function validateLocalReferences(dist) {
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

async function writeRelease(dist, playerVersion, toolkitVersion) {
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
  await installH5pStandalone(output);
  await installGame3dRuntime(output);
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
  console.log(JSON.stringify({output:result.output,version:result.release.webSdkVersion,files:result.release.files.length},null,2));
}
