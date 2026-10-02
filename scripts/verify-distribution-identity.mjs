import {createHash} from 'node:crypto';
import {readFile, readdir, stat} from 'node:fs/promises';
import {join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const playerPackage = JSON.parse(await readFile(join(root,'packages','player','package.json'),'utf8'));
const toolkitPackage = JSON.parse(await readFile(join(root,'packages','toolkit','package.json'),'utf8'));
const h5pPackage = JSON.parse(await readFile(join(root,'packages','h5p-libraries','package.json'),'utf8'));
const studioPackage = JSON.parse(await readFile(join(root,'packages','studio','package.json'),'utf8'));
const version = playerPackage.version;

if (toolkitPackage.version !== version || h5pPackage.version !== version || studioPackage.version !== version) {
  throw new Error(`Version mismatch: player=${version}, toolkit=${toolkitPackage.version}, h5p=${h5pPackage.version}, studio=${studioPackage.version}`);
}

const npmPlayer = join(root,'.npm-pack-gate','install','node_modules','@p2lrn','player','dist');
const npmH5p = join(root,'.npm-pack-gate','install','node_modules','@p2lrn','h5p-libraries','dist');
const cdnPlayer = join(root,'.netlify-cdn','player',version,'dist');
const cdnH5p = join(cdnPlayer,'runtime-host','h5p-libraries');
const npmStudio = join(root,'.npm-pack-gate','install','node_modules','@p2lrn','studio','dist');
const cdnStudio = join(root,'.netlify-cdn','studio',version,'dist');

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    const full = join(dir,entry.name);
    if (entry.isDirectory()) out.push(...await walk(full,base));
    else if (entry.isFile()) out.push(relative(base,full).replaceAll('\\','/'));
  }
  return out.sort();
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function compareTrees(leftRoot,rightRoot,{ignorePrefix=null}={}) {
  let left = await walk(leftRoot);
  let right = await walk(rightRoot);
  if (ignorePrefix) {
    left = left.filter((path)=>!path.startsWith(ignorePrefix));
    right = right.filter((path)=>!path.startsWith(ignorePrefix));
  }
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    const leftSet=new Set(left),rightSet=new Set(right);
    const missingRight=left.filter((path)=>!rightSet.has(path));
    const missingLeft=right.filter((path)=>!leftSet.has(path));
    throw new Error(`Distribution file set mismatch. Missing from right: ${missingRight.slice(0,20).join(', ')}; missing from left: ${missingLeft.slice(0,20).join(', ')}`);
  }
  const mismatches=[];
  for (const rel of left) {
    if ((await sha256(join(leftRoot,...rel.split('/')))) !== (await sha256(join(rightRoot,...rel.split('/'))))) {
      mismatches.push(rel);
      if (mismatches.length >= 20) break;
    }
  }
  if (mismatches.length) throw new Error(`Distribution byte mismatch: ${mismatches.join(', ')}`);
  return left.length;
}

await stat(npmPlayer);
await stat(npmH5p);
await stat(cdnPlayer);
await stat(cdnH5p);
await stat(npmStudio);
await stat(cdnStudio);

const playerFiles = await compareTrees(npmPlayer, cdnPlayer, {ignorePrefix:'runtime-host/h5p-libraries/'});
const h5pFiles = await compareTrees(npmH5p, cdnH5p);
const studioFiles = await compareTrees(npmStudio, cdnStudio);

const index = JSON.parse(await readFile(join(root,'.netlify-cdn','index.json'),'utf8'));
if (index.player?.version !== version) throw new Error('CDN index Player version mismatch.');
if (index.generatedFrom?.toolkitVersion !== toolkitPackage.version) throw new Error('CDN index Toolkit version mismatch.');
if (index.h5p?.sharedLibraryPackageVersion !== h5pPackage.version) throw new Error('CDN index H5P package version mismatch.');
if (index.h5p?.sharedLibraryMode !== 'bundled-npm-artifact') throw new Error('CDN is not using the npm H5P artifact mode.');
if(index.studio?.version!==studioPackage.version) throw new Error('CDN index Studio version mismatch.');

console.log(JSON.stringify({
  ok:true,
  version,
  playerFilesCompared:playerFiles,
  h5pFilesCompared:h5pFiles,
  studioFilesCompared:studioFiles,
  h5pLibraryCount:index.h5p.sharedLibraryCount,
  mode:index.h5p.sharedLibraryMode,
},null,2));
