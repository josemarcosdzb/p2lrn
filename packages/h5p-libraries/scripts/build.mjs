import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
export const LUMI_H5P_LIBRARY_COMMIT = '236912f8e3c07a6b5c7ece4930b98fec2b6d3f6a';
export const EXPECTED_LIBRARY_COUNT = 144;
const REQUIRED = [
  'H5P.Crossword-0.5',
  'H5P.BranchingScenario-1.8',
  'H5P.Question-1.5',
  'H5P.JoubelUI-1.3',
  'H5P.Image-1.1',
  'FontAwesome-4.5',
];

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full, base));
    else if (entry.isFile()) out.push({path:full, relative:full.slice(base.length + 1).replaceAll('\\','/')});
  }
  return out;
}

export async function buildH5pLibraries({output = join(packageRoot, 'dist')} = {}) {
  const work = join(packageRoot, '.build-h5p-libraries');
  await rm(work, {recursive:true, force:true});
  await rm(output, {recursive:true, force:true});
  await mkdir(work, {recursive:true});
  await mkdir(output, {recursive:true});

  const archive = join(work, 'lumi.tar.gz');
  const url = `https://codeload.github.com/Lumieducation/Lumi/tar.gz/${LUMI_H5P_LIBRARY_COMMIT}`;
  const response = await fetch(url, {redirect:'follow'});
  if (!response.ok) throw new Error(`Unable to download pinned H5P corpus: HTTP ${response.status}`);
  await writeFile(archive, new Uint8Array(await response.arrayBuffer()));
  await execFileAsync('tar', ['-xzf', archive, '-C', work], {maxBuffer:8*1024*1024});

  const extracted = (await readdir(work, {withFileTypes:true}))
    .find((entry) => entry.isDirectory() && entry.name.startsWith('Lumi-'));
  if (!extracted) throw new Error('Pinned Lumi archive did not extract as expected.');

  const source = join(work, extracted.name, 'assets', 'h5p', 'libraries');
  if (!(await stat(source)).isDirectory()) throw new Error('Pinned source has no assets/h5p/libraries directory.');
  await cp(source, output, {recursive:true, force:true});

  const catalog = [];
  for (const entry of (await readdir(output, {withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    let metadata;
    try {
      metadata = JSON.parse(await readFile(join(output, entry.name, 'library.json'), 'utf8'));
    } catch {
      continue;
    }
    const machineName = String(metadata.machineName ?? '').trim();
    const majorVersion = Number(metadata.majorVersion);
    const minorVersion = Number(metadata.minorVersion);
    const patchVersion = Number(metadata.patchVersion ?? 0);
    if (!machineName || !Number.isInteger(majorVersion) || !Number.isInteger(minorVersion)) continue;
    const folder = `${machineName}-${majorVersion}.${minorVersion}`;
    if (folder !== entry.name) throw new Error(`H5P folder/version mismatch: ${entry.name} != ${folder}`);
    catalog.push({
      folder,
      machineName,
      majorVersion,
      minorVersion,
      patchVersion,
      runnable:Number(metadata.runnable ?? 0) === 1,
      license:metadata.license ?? null,
    });
  }

  if (catalog.length !== EXPECTED_LIBRARY_COUNT) {
    throw new Error(`Pinned H5P corpus changed: expected ${EXPECTED_LIBRARY_COUNT}, got ${catalog.length}`);
  }
  for (const required of REQUIRED) {
    if (!catalog.some((entry) => entry.folder === required)) throw new Error(`Required H5P library missing: ${required}`);
  }

  const files = await walk(output);
  let bytes = 0;
  for (const file of files) bytes += (await stat(file.path)).size;
  const manifest = {
    schema:'https://p2lrn.org/schema/h5p-library-catalog/1',
    packageVersion:'0.5.0-alpha.9',
    source:{
      repository:'Lumieducation/Lumi',
      commit:LUMI_H5P_LIBRARY_COMMIT,
      basePath:'assets/h5p/libraries',
    },
    libraryCount:catalog.length,
    fileCount:files.length,
    bytes,
    catalogSha256:'sha256:' + sha256(Buffer.from(JSON.stringify(catalog))),
    libraries:catalog,
  };
  await writeFile(join(output, 'index.json'), JSON.stringify(manifest, null, 2) + '\n');
  await rm(work, {recursive:true, force:true});
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await buildH5pLibraries();
  console.log(JSON.stringify({libraryCount:manifest.libraryCount,fileCount:manifest.fileCount,bytes:manifest.bytes}, null, 2));
}
