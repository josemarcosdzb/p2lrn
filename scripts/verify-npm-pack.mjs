import {execFile} from 'node:child_process';
import {access, mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const work = join(root, '.npm-pack-gate');
const packs = join(work, 'packs');
const installRoot = join(work, 'install');
const node = process.execPath;

async function resolveNpmInvocation(args) {
  if (process.platform !== 'win32') return {command:'npm', args};
  const candidates=[
    process.env.npm_execpath,
    join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const info=await stat(candidate);
      if (info.isFile()) return {command:process.execPath, args:[candidate,...args]};
    } catch {}
  }
  throw new Error('Unable to locate npm-cli.js for safe Windows execution.');
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}
async function assertFile(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size < 1) throw new Error(`Expected non-empty file: ${path}`);
}

const FORBIDDEN_INSTALL_SCRIPTS = ['preinstall','install','postinstall'];
const SENSITIVE_TARBALL_PATH = /(^|\/)(?:\.env(?:\.|$)|\.npmrc$|\.git(?:\/|$)|node_modules(?:\/|$)|id_rsa$|id_ed25519$|[^/]+\.(?:pem|p12|pfx|key|crt))$/iu;

function assertManifestInstallSafety(pkg, label) {
  for (const name of FORBIDDEN_INSTALL_SCRIPTS) {
    if (pkg.scripts?.[name]) throw new Error(`${label} must not execute ${name} during consumer installation.`);
  }
  for (const [group, entries] of Object.entries({
    dependencies:pkg.dependencies ?? {},
    optionalDependencies:pkg.optionalDependencies ?? {},
  })) {
    for (const [name, spec] of Object.entries(entries)) {
      const value=String(spec);
      if (/^(?:https?:|git(?:\+|:)|file:|link:|github:|\*|latest$)/iu.test(value)) {
        throw new Error(`${label} has unsafe/unpinned ${group} entry ${name}=${value}`);
      }
    }
  }
}

function assertPackedFileSafety(packResult, label) {
  for (const file of packResult.files ?? []) {
    const path=String(file.path ?? '').replaceAll('\\','/');
    if (SENSITIVE_TARBALL_PATH.test(path)) throw new Error(`${label} tarball contains sensitive path: ${path}`);
  }
}

async function pack(directory) {
  const invocation=await resolveNpmInvocation(['pack','--json','--pack-destination',packs]);
  const {stdout} = await execFileAsync(
    invocation.command,
    invocation.args,
    {cwd:join(root, directory), maxBuffer:32*1024*1024},
  );
  const match = /\[\s*\{[\s\S]*\}\s*\]\s*$/u.exec(String(stdout));
  if (!match) throw new Error(`npm pack did not emit a JSON result for ${directory}:\n${stdout}`);
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0]?.filename) {
    throw new Error(`Unexpected npm pack output for ${directory}`);
  }
  assertPackedFileSafety(parsed[0], directory);
  return join(packs, parsed[0].filename);
}
async function run(command, args, options = {}) {
  const result = await execFileAsync(command, args, {
    cwd:options.cwd ?? root,
    maxBuffer:32*1024*1024,
    env:{...process.env, ...(options.env ?? {})},
  });
  return result.stdout;
}
async function runNpm(args, options = {}) {
  const invocation=await resolveNpmInvocation(args);
  const result = await execFileAsync(invocation.command, invocation.args, {
    cwd:options.cwd ?? root,
    maxBuffer:32*1024*1024,
    env:{...process.env, ...(options.env ?? {})},
  });
  return result.stdout;
}

await rm(work, {recursive:true, force:true});
await mkdir(packs, {recursive:true});
await mkdir(installRoot, {recursive:true});

const toolkitPackage = JSON.parse(await readFile(join(root,'packages/toolkit/package.json'),'utf8'));
const playerPackage = JSON.parse(await readFile(join(root,'packages/player/package.json'),'utf8'));
const h5pPackage = JSON.parse(await readFile(join(root,'packages/h5p-libraries/package.json'),'utf8'));
if (toolkitPackage.version !== playerPackage.version || h5pPackage.version !== playerPackage.version) {
  throw new Error(`npm package versions differ: player=${playerPackage.version}, toolkit=${toolkitPackage.version}, h5p=${h5pPackage.version}`);
}
assertManifestInstallSafety(toolkitPackage,'@p2lrn/toolkit');
assertManifestInstallSafety(playerPackage,'@p2lrn/player');
assertManifestInstallSafety(h5pPackage,'@p2lrn/h5p-libraries');

await runNpm(['install','--ignore-scripts','--no-audit','--no-fund'], {cwd:join(root,'packages/toolkit')});

const toolkitTgz = await pack('packages/toolkit');
const h5pTgz = await pack('packages/h5p-libraries');
const playerTgz = await pack('packages/player');

await runNpm(['init','-y'], {cwd:installRoot});
await runNpm(
  ['install','--ignore-scripts','--no-audit','--no-fund', toolkitTgz, h5pTgz, playerTgz],
  {cwd:installRoot},
);
await runNpm(['audit','--omit=dev','--audit-level=high'], {cwd:installRoot});

const toolkitRoot = join(installRoot,'node_modules','@p2lrn','toolkit');
const playerRoot = join(installRoot,'node_modules','@p2lrn','player');
const h5pRoot = join(installRoot,'node_modules','@p2lrn','h5p-libraries');

for (const path of [
  join(toolkitRoot,'dist','cli','main.js'),
  join(toolkitRoot,'dist','tools','multipart.js'),
  join(toolkitRoot,'dist','document-reader','index.js'),
  join(toolkitRoot,'dist','cli','document-reader.js'),
  join(playerRoot,'dist','p2lrn.js'),
  join(playerRoot,'dist','p2lrn.esm.js'),
  join(playerRoot,'dist','runtime-host','h5p.html'),
  join(playerRoot,'dist','runtime-host','h5p-host.js'),
  join(playerRoot,'dist','runtime-host','scorm.html'),
  join(playerRoot,'dist','runtime-host','package.html'),
  join(playerRoot,'dist','runtime-host','assets','main.bundle.js'),
  join(playerRoot,'dist','runtime-host','assets','frame.bundle.js'),
  join(playerRoot,'dist','runtime-host','assets','styles','h5p.css'),
  join(playerRoot,'dist','runtime-host','assets','LICENSE.h5p-standalone.txt'),
  join(h5pRoot,'dist','index.json'),
  join(h5pRoot,'dist','H5P.Crossword-0.5','library.json'),
  join(h5pRoot,'dist','H5P.BranchingScenario-1.8','library.json'),
]) {
  await assertFile(path);
}

const release = JSON.parse(await readFile(join(playerRoot,'dist','release.json'),'utf8'));
if (release.webSdkVersion !== playerPackage.version || release.toolkitVersion !== toolkitPackage.version) {
  throw new Error('Packed Player release.json has inconsistent versions.');
}
if (release.h5pStandaloneVersion !== '3.8.2') throw new Error('Packed Player has unexpected h5p-standalone version.');

const catalog = JSON.parse(await readFile(join(h5pRoot,'dist','index.json'),'utf8'));
if (catalog.packageVersion !== h5pPackage.version || catalog.libraryCount !== 144) {
  throw new Error(`Packed H5P catalog mismatch: version=${catalog.packageVersion}, count=${catalog.libraryCount}`);
}

await run(node, ['--check', join(playerRoot,'dist','p2lrn.js')]);
await run(node, ['--check', join(playerRoot,'dist','runtime-host','h5p-host.js')]);
await run(node, [join(toolkitRoot,'dist','cli','main.js'),'--help']);
await run(node, [join(toolkitRoot,'dist','tools','multipart.js'),'--help']);
await run(node, [join(toolkitRoot,'dist','cli','document-reader.js'),'--help']);

const documentReaderSmoke = join(work,'reader-smoke.md');
await writeFile(documentReaderSmoke, '# Reader npm smoke\n\nTexto desde tarball npm.\n');
const readerOutput = await run(node, [join(toolkitRoot,'dist','cli','document-reader.js'), documentReaderSmoke, '--pretty']);
const readerJson = JSON.parse(readerOutput);
if (readerJson?.source?.detectedType !== 'MARKDOWN') {
  throw new Error('Installed p2lrn-document-reader did not detect Markdown correctly.');
}
if (!Array.isArray(readerJson?.blocks) || !readerJson.blocks.some((block) => block?.text === 'Reader npm smoke')) {
  throw new Error('Installed p2lrn-document-reader did not emit the expected Markdown title block.');
}
await run(
  node,
  [
    '--input-type=module',
    '-e',
    "import {LightweightDocumentReader} from '@p2lrn/toolkit/document-reader'; const r=await new LightweightDocumentReader().read({name:'smoke.md',data:new TextEncoder().encode('# Titulo npm\\n\\nParrafo')}); if(r.source.detectedType!=='MARKDOWN'||!r.blocks.some(b=>b.text==='Titulo npm')) process.exit(9);"
  ],
  {cwd:installRoot},
);

const copiedRuntime = join(work,'copied-runtime');
await mkdir(copiedRuntime,{recursive:true});
const runtimeSentinel = join(copiedRuntime,'user-owned-sentinel.txt');
await writeFile(runtimeSentinel,'must survive p2lrn-copy-runtime\n');
await run(node, [join(playerRoot,'bin','p2lrn-copy-runtime.mjs'), copiedRuntime], {cwd:installRoot});
await assertFile(runtimeSentinel);

const copiedH5p = join(work,'copied-h5p-libraries');
await mkdir(copiedH5p,{recursive:true});
const h5pSentinel = join(copiedH5p,'user-owned-sentinel.txt');
await writeFile(h5pSentinel,'must survive p2lrn-copy-h5p-libraries\n');
await run(node, [join(h5pRoot,'bin','p2lrn-copy-h5p-libraries.mjs'), copiedH5p], {cwd:installRoot});
await assertFile(h5pSentinel);
await assertFile(join(copiedH5p,'H5P.Crossword-0.5','library.json'));

for (const path of [
  join(copiedRuntime,'p2lrn.js'),
  join(copiedRuntime,'runtime-host','h5p.html'),
  join(copiedRuntime,'runtime-host','assets','frame.bundle.js'),
  join(copiedRuntime,'runtime-host','h5p-libraries','H5P.Crossword-0.5','library.json'),
  join(copiedRuntime,'runtime-host','h5p-libraries','H5P.BranchingScenario-1.8','library.json'),
]) {
  await assertFile(path);
}

if (!(await exists(join(copiedRuntime,'runtime-host','h5p-libraries','index.json')))) {
  throw new Error('p2lrn-copy-runtime did not include the installed H5P library package.');
}

console.log(JSON.stringify({
  ok:true,
  version:playerPackage.version,
  tarballs:{
    toolkit:toolkitTgz,
    player:playerTgz,
    h5pLibraries:h5pTgz,
  },
  installed:{
    toolkit:true,
    player:true,
    h5pLibraries:true,
    documentReaderSubpath:'@p2lrn/toolkit/document-reader',
  },
  h5pLibraryCount:catalog.libraryCount,
  copiedRuntime,
  copiedH5p,
  nonDestructiveCopyGate:true,
}, null, 2));
