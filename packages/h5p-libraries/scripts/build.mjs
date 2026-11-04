import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {applyPinnedH5pSecurityPatches} from './security-patches.mjs';

const execFileAsync = promisify(execFile);
export const LUMI_H5P_LIBRARY_COMMIT = '236912f8e3c07a6b5c7ece4930b98fec2b6d3f6a';
export const LUMI_H5P_ARCHIVE_SHA256 = '388ca78e78cf26fe428a973f008a2a4583052e3732cc5c92ae990e4edf57f9b5';
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
  // A complete, verified catalog is assembled on the output volume before
  // promotion. Windows can reject thousands of individual recursive copyFile()
  // calls under antivirus/file-indexer load. Move the extracted library directory
  // instead, preserving the previously published dist if anything fails.
  const destination = resolve(output);
  await mkdir(dirname(destination), {recursive:true});
  const work = await mkdtemp(join(dirname(destination), '.p2lrn-h5p-build-'));
  const previous = join(work, 'previous-dist');
  let previousMoved = false;
  try {
    const archive = join(work, 'lumi.tar.gz');
    const url = `https://codeload.github.com/Lumieducation/Lumi/tar.gz/${LUMI_H5P_LIBRARY_COMMIT}`;
    const response = await fetch(url, {redirect:'follow'});
    if (!response.ok) throw new Error(`Unable to download pinned H5P corpus: HTTP ${response.status}`);
    const archiveBytes = new Uint8Array(await response.arrayBuffer());
    const actualArchiveSha256 = sha256(archiveBytes);
    if (actualArchiveSha256 !== LUMI_H5P_ARCHIVE_SHA256) {
      throw new Error(`Pinned Lumi archive SHA-256 mismatch: expected ${LUMI_H5P_ARCHIVE_SHA256}, got ${actualArchiveSha256}`);
    }
    await writeFile(archive, archiveBytes);
    await execFileAsync('tar', ['-xzf', archive, '-C', work], {maxBuffer:8*1024*1024});

    const extracted = (await readdir(work, {withFileTypes:true}))
      .find((entry) => entry.isDirectory() && entry.name.startsWith('Lumi-'));
    if (!extracted) throw new Error('Pinned Lumi archive did not extract as expected.');

    const source = join(work, extracted.name, 'assets', 'h5p', 'libraries');
    if (!(await stat(source)).isDirectory()) throw new Error('Pinned source has no assets/h5p/libraries directory.');

    // Keep the verified Lumi source snapshot, but apply hash-locked security
    // fixes before publishing the derived library catalog.
    const securityPatches=await applyPinnedH5pSecurityPatches(source);
    const catalog = [];
    for (const entry of (await readdir(source, {withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      let metadata;
      try {
        metadata = JSON.parse(await readFile(join(source, entry.name, 'library.json'), 'utf8'));
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
      const libraryFiles = (await walk(join(source,entry.name)))
        .map((file)=>file.relative)
        .sort((a,b)=>a.localeCompare(b));
      catalog.push({
        folder,
        machineName,
        majorVersion,
        minorVersion,
        patchVersion,
        runnable:Number(metadata.runnable ?? 0) === 1,
        license:metadata.license ?? null,
        files:libraryFiles,
      });
    }

    if (catalog.length !== EXPECTED_LIBRARY_COUNT) {
      throw new Error(`Pinned H5P corpus changed: expected ${EXPECTED_LIBRARY_COUNT}, got ${catalog.length}`);
    }
    for (const required of REQUIRED) {
      if (!catalog.some((entry) => entry.folder === required)) throw new Error(`Required H5P library missing: ${required}`);
    }

    const files = await walk(source);
    let bytes = 0;
    for (const file of files) bytes += (await stat(file.path)).size;
    const manifest = {
      schema:'https://p2lrn.org/schema/h5p-library-catalog/1',
      packageVersion:'0.5.0-alpha.12',
      source:{
        repository:'Lumieducation/Lumi',
        commit:LUMI_H5P_LIBRARY_COMMIT,
        basePath:'assets/h5p/libraries',
      },
      libraryCount:catalog.length,
      fileCount:files.length,
      bytes,
      catalogSha256:'sha256:' + sha256(Buffer.from(JSON.stringify(catalog))),
      securityPatches,
      libraries:catalog,
    };
    await writeFile(join(source, 'index.json'), JSON.stringify(manifest, null, 2) + '\n');

    // On the same volume, a rename moves the entire verified tree without
    // per-file copying; a failed promotion restores the original catalog.
    let oldStat;
    try { oldStat = await stat(destination); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (oldStat && !oldStat.isDirectory()) throw new Error('H5P output path exists and is not a directory.');
    if (oldStat) {
      await rename(destination, previous);
      previousMoved = true;
    }
    try {
      await rename(source, destination);
    } catch (error) {
      if (previousMoved) {
        try {
          await rename(previous, destination);
          previousMoved = false;
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError],
            `H5P catalog promotion failed; previous catalog is retained at ${previous}`);
        }
      }
      throw error;
    }
    if (previousMoved) {
      await rm(previous, {recursive:true,force:true,maxRetries:5,retryDelay:250});
      previousMoved = false;
    }
    return manifest;
  } finally {
    if (!previousMoved) {
      try { await rm(work, {recursive:true,force:true,maxRetries:5,retryDelay:250}); }
      catch (cleanupError) { console.warn('H5P build scratch cleanup deferred:', cleanupError.message); }
    } else {
      console.error('H5P previous catalog preserved for manual recovery at:', previous);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await buildH5pLibraries();
  console.log(JSON.stringify({libraryCount:manifest.libraryCount,fileCount:manifest.fileCount,bytes:manifest.bytes}, null, 2));
}
