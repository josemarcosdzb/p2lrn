import {execFile} from 'node:child_process';
import {access, mkdir, readFile, rm, stat} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const work = join(root, '.npm-pack-gate');
const packs = join(work, 'packs');
const installRoot = join(work, 'install');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmExecOptions = process.platform === 'win32' ? {shell:true} : {};
const node = process.execPath;

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}
async function assertFile(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size < 1) throw new Error(`Expected non-empty file: ${path}`);
}
async function pack(directory) {
  const {stdout} = await execFileAsync(
    npm,
    ['pack', '--json', '--pack-destination', packs],
    {cwd:join(root, directory), maxBuffer:32*1024*1024, ...npmExecOptions},
  );
  const match = /\[\s*\{[\s\S]*\}\s*\]\s*$/u.exec(String(stdout));
  if (!match) throw new Error(`npm pack did not emit a JSON result for ${directory}:\n${stdout}`);
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0]?.filename) {
    throw new Error(`Unexpected npm pack output for ${directory}`);
  }
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
  const result = await execFileAsync(npm, args, {
    cwd:options.cwd ?? root,
    maxBuffer:32*1024*1024,
    ...npmExecOptions,
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
const documentReaderPackage = JSON.parse(await readFile(join(root,'packages/document-reader/package.json'),'utf8'));
if (toolkitPackage.version !== playerPackage.version || h5pPackage.version !== playerPackage.version || documentReaderPackage.version !== playerPackage.version) {
  throw new Error(`npm package versions differ: player=${playerPackage.version}, toolkit=${toolkitPackage.version}, h5p=${h5pPackage.version}, documentReader=${documentReaderPackage.version}`);
}

const toolkitTgz = await pack('packages/toolkit');
const h5pTgz = await pack('packages/h5p-libraries');
const playerTgz = await pack('packages/player');
const documentReaderTgz = await pack('packages/document-reader');

await runNpm(['init','-y'], {cwd:installRoot});
await runNpm(
  ['install','--ignore-scripts','--no-audit','--no-fund', toolkitTgz, h5pTgz, playerTgz, documentReaderTgz],
  {cwd:installRoot},
);

const toolkitRoot = join(installRoot,'node_modules','@p2lrn','toolkit');
const playerRoot = join(installRoot,'node_modules','@p2lrn','player');
const h5pRoot = join(installRoot,'node_modules','@p2lrn','h5p-libraries');
const documentReaderRoot = join(installRoot,'node_modules','@p2lrn','document-reader');

for (const path of [
  join(toolkitRoot,'dist','cli','main.js'),
  join(toolkitRoot,'dist','cli','document-reader.js'),
  join(toolkitRoot,'dist','document-reader','index.js'),
  join(toolkitRoot,'dist','document-reader','reader.js'),
  join(toolkitRoot,'dist','document-reader','docx.js'),
  join(toolkitRoot,'dist','document-reader','pptx.js'),
  join(toolkitRoot,'dist','document-reader','pdf.js'),
  join(toolkitRoot,'dist','tools','multipart.js'),
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
  join(documentReaderRoot,'dist','index.js'),
  join(documentReaderRoot,'dist','cli.js'),
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
await run(node, [join(toolkitRoot,'dist','cli','document-reader.js'),'--help']);
await run(node, [join(toolkitRoot,'dist','tools','multipart.js'),'--help']);
await run(node, [join(documentReaderRoot,'dist','cli.js')]).catch((error) => {
  const stderr = String(error?.stderr ?? '');
  if (!stderr.includes('Usage: p2lrn-document-reader')) throw error;
});
const documentReaderEntry = pathToFileURL(join(documentReaderRoot,'dist','index.js')).href;
await run(node, ['--input-type=module','-e', `import {P2LRNDocumentReader} from ${JSON.stringify(documentReaderEntry)}; const r=await new P2LRNDocumentReader({pdf:false}).read({name:'smoke.txt',mimeType:'text/plain',buffer:Buffer.from('uno\\ndos')}); if(r.blocks.length!==2||r.origin.detectedType!=='TXT') process.exit(9);`]);

const copiedRuntime = join(work,'copied-runtime');
await run(node, [join(playerRoot,'bin','p2lrn-copy-runtime.mjs'), copiedRuntime], {cwd:installRoot});
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
    documentReader:documentReaderTgz,
  },
  installed:{
    toolkit:true,
    player:true,
    h5pLibraries:true,
    documentReader:true,
  },
  h5pLibraryCount:catalog.libraryCount,
  copiedRuntime,
}, null, 2));
