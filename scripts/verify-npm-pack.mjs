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

await rm(work, {recursive:true, force:true, maxRetries:5, retryDelay:250});
await mkdir(packs, {recursive:true});
await mkdir(installRoot, {recursive:true});

const toolkitPackage = JSON.parse(await readFile(join(root,'packages/toolkit/package.json'),'utf8'));
const playerPackage = JSON.parse(await readFile(join(root,'packages/player/package.json'),'utf8'));
const h5pPackage = JSON.parse(await readFile(join(root,'packages/h5p-libraries/package.json'),'utf8'));
const studioPackage = JSON.parse(await readFile(join(root,'packages/studio/package.json'),'utf8'));
if (toolkitPackage.version !== playerPackage.version || h5pPackage.version !== playerPackage.version || studioPackage.version !== playerPackage.version) {
  throw new Error(`npm package versions differ: player=${playerPackage.version}, toolkit=${toolkitPackage.version}, h5p=${h5pPackage.version}, studio=${studioPackage.version}`);
}
assertManifestInstallSafety(toolkitPackage,'@p2lrn/toolkit');
assertManifestInstallSafety(playerPackage,'@p2lrn/player');
assertManifestInstallSafety(h5pPackage,'@p2lrn/h5p-libraries');
assertManifestInstallSafety(studioPackage,'@p2lrn/studio');

await runNpm(['install','--ignore-scripts','--no-audit','--no-fund'], {cwd:join(root,'packages/toolkit')});

const toolkitTgz = await pack('packages/toolkit');
const h5pTgz = await pack('packages/h5p-libraries');
const playerTgz = await pack('packages/player');
const studioTgz = await pack('packages/studio');

await runNpm(['init','-y'], {cwd:installRoot});
await runNpm(
  ['install','--ignore-scripts','--no-audit','--no-fund', toolkitTgz, h5pTgz, playerTgz, studioTgz],
  {cwd:installRoot},
);
await runNpm(['audit','--omit=dev','--audit-level=high'], {cwd:installRoot});

const toolkitRoot = join(installRoot,'node_modules','@p2lrn','toolkit');
const playerRoot = join(installRoot,'node_modules','@p2lrn','player');
const h5pRoot = join(installRoot,'node_modules','@p2lrn','h5p-libraries');
const studioRoot = join(installRoot,'node_modules','@p2lrn','studio');

for (const path of [
  join(playerRoot,'source','SOURCE-MANIFEST.json'),
  join(playerRoot,'source','packages','player','scripts','build-dist.mjs'),
  join(playerRoot,'source','packages','toolkit','web','p2lrn-player.js'),
  join(playerRoot,'source','packages','toolkit','web-sdk-src','p2lrn.js'),
  join(toolkitRoot,'src','index.ts'),
  join(toolkitRoot,'tsconfig.json'),
  join(toolkitRoot,'web-build','runtime-assets.mjs'),
  join(h5pRoot,'THIRD_PARTY_NOTICES.md'),
]) {
  await assertFile(path);
}
const packedSourceManifest = JSON.parse(await readFile(join(playerRoot,'source','SOURCE-MANIFEST.json'),'utf8'));
if (packedSourceManifest?.license?.id !== 'P2LRN-NCSL-1.0') {
  throw new Error('Packed Player source snapshot does not declare P2LRN-NCSL-1.0.');
}
if (!Array.isArray(packedSourceManifest?.files) || packedSourceManifest.files.length < 1) {
  throw new Error('Packed Player source snapshot does not enumerate Corresponding Source files.');
}
for (const requiredSource of [
  'packages/player/scripts/build-dist.mjs',
  'packages/toolkit/web/p2lrn-player.js',
  'packages/toolkit/web-sdk-src/p2lrn.js',
  'packages/toolkit/web-build/runtime-assets.mjs',
]) {
  if (!packedSourceManifest.files.some((item)=>item?.path === requiredSource && typeof item?.sha256 === 'string')) {
    throw new Error('Packed Player source manifest is missing required source entry: ' + requiredSource);
  }
}
await assertFile(join(playerRoot,'source','index.html'));

const rootLicenseText = await readFile(join(root,'LICENSE'),'utf8');
const rootNoticeText = await readFile(join(root,'NOTICE.md'),'utf8');

for (const packageRoot of [toolkitRoot, playerRoot, studioRoot]) {
  await assertFile(join(packageRoot,'LICENSE'));
  await assertFile(join(packageRoot,'NOTICE.md'));

  const packedLicense = await readFile(join(packageRoot,'LICENSE'),'utf8');
  const packedNotice = await readFile(join(packageRoot,'NOTICE.md'),'utf8');

  if (packedLicense !== rootLicenseText) {
    throw new Error(`Packed first-party LICENSE differs from root LICENSE: ${packageRoot}`);
  }
  if (packedNotice !== rootNoticeText) {
    throw new Error(`Packed first-party NOTICE.md differs from root NOTICE.md: ${packageRoot}`);
  }
}

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
  join(studioRoot,'dist','p2lrn-studio.js'),
  join(studioRoot,'dist','p2lrn-studio.esm.js'),
  join(studioRoot,'dist','runtime','authoring-document.js'),
  join(studioRoot,'dist','runtime','package-export.js'),
  join(studioRoot,'dist','native-composite-core.js'),
  join(studioRoot,'dist','component-registry.js'),
  join(studioRoot,'dist','identifiers.js'),
  join(studioRoot,'dist','renderer-registry.js'),
  join(studioRoot,'dist','fill-blanks-core.js'),
  join(studioRoot,'dist','capability-broker.js'),
  join(studioRoot,'server','index.mjs'),
  join(studioRoot,'bin','p2lrn-studio.mjs'),
  join(studioRoot,'templates','next-route.ts'),
  join(studioRoot,'templates','next-reader-route.ts'),
  join(studioRoot,'templates','next-import-route.ts'),
  join(studioRoot,'templates','generic-contract.md'),
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
await run(node, ['--check', join(studioRoot,'dist','p2lrn-studio.esm.js')]);
await run(node, ['--check', join(studioRoot,'server','index.mjs')]);
await run(node, ['--check', join(studioRoot,'bin','p2lrn-studio.mjs')]);
await run(node, [join(toolkitRoot,'dist','cli','main.js'),'--help']);
await run(node, [join(toolkitRoot,'dist','tools','multipart.js'),'--help']);
await run(node, [join(toolkitRoot,'dist','cli','document-reader.js'),'--help']);

const studioCliSmoke=join(work,'p2lrn-studio-cli-smoke');
await mkdir(studioCliSmoke,{recursive:true});
const studioCliOutput=await run(node,[join(studioRoot,'bin','p2lrn-studio.mjs'),'setup','next','--cwd',studioCliSmoke]);
const studioCliJson=JSON.parse(studioCliOutput);
if(studioCliJson.target!=='next')throw new Error('Installed @p2lrn/studio CLI did not run setup next.');
await assertFile(join(studioCliSmoke,'app','api','p2lrn','studio','save','route.ts'));
await assertFile(join(studioCliSmoke,'app','api','p2lrn','studio','read','route.ts'));
await assertFile(join(studioCliSmoke,'app','api','p2lrn','studio','import','route.ts'));
await stat(join(studioCliSmoke,'course'));

const studioReaderSmoke=join(installRoot,'studio-reader-smoke.mjs');
await writeFile(studioReaderSmoke,[
  "import {readP2LRNStudioDocument} from '@p2lrn/studio/server';",
  "const data=new TextEncoder().encode('Documento de prueba\\nContenido importado');",
  "const result=await readP2LRNStudioDocument(data,{filename:'prueba.txt',mediaType:'text/plain'});",
  "if(result.source?.detectedType!=='TXT'||!result.blocks?.length)throw new Error('Studio Reader helper failed');",
  "console.log(JSON.stringify({ok:true,type:result.source.detectedType,blocks:result.blocks.length}));",
  '',
].join('\n'));
await run(node,[studioReaderSmoke],{cwd:installRoot});

const studioExternalSmoke=join(installRoot,'studio-external-smoke.mjs');
const canonicalH5p=join(root,'examples','canonical','external','h5p-crossword.p2lrn');
await writeFile(studioExternalSmoke,[
  "import {readFile} from 'node:fs/promises';",
  "import {ZipArchive} from '@p2lrn/toolkit/core';",
  "import {convertP2LRNStudioExternalPackage} from '@p2lrn/studio/server';",
  `const wrapper=new Uint8Array(await readFile(${JSON.stringify(canonicalH5p)}));`,
  "const zip=ZipArchive.open(wrapper);",
  "const manifest=JSON.parse(new TextDecoder().decode(zip.read('META-INF/manifest.json')));",
  "const graph=JSON.parse(new TextDecoder().decode(zip.read(manifest.graph.path)));",
  "const resource=graph.entities.find((e)=>e.type==='resource'&&e.representations?.some((r)=>r.profile==='https://p2lrn.org/profile/h5p'));",
  "const rep=resource?.representations?.find((r)=>r.profile==='https://p2lrn.org/profile/h5p'&&r.location?.type==='embedded');",
  "if(!rep)throw new Error('Canonical H5P wrapper has no embedded H5P representation');",
  "const raw=zip.read(rep.location.path);",
  "const result=await convertP2LRNStudioExternalPackage(raw,{filename:'smoke.h5p'});",
  "if(result.report?.detectedFormat!=='h5p'||result.bytes.byteLength<1)throw new Error('Studio external H5P conversion failed');",
  "console.log(JSON.stringify({ok:true,format:result.report.detectedFormat,bytes:result.bytes.byteLength}));",
  '',
].join('\n'));
await run(node,[studioExternalSmoke],{cwd:installRoot});

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
    studio:studioTgz,
  },
  installed:{
    toolkit:true,
    player:true,
    h5pLibraries:true,
    studio:true,
    documentReaderSubpath:'@p2lrn/toolkit/document-reader',
  },
  h5pLibraryCount:catalog.libraryCount,
  copiedRuntime,
  copiedH5p,
  nonDestructiveCopyGate:true,
}, null, 2));
