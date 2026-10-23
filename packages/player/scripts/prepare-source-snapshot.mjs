import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const playerRoot = resolve(here, '..');
const repoRoot = resolve(playerRoot, '..', '..');
const toolkitRoot = join(repoRoot, 'packages', 'toolkit');
const defaultOutput = join(playerRoot, 'source');

async function copyTree(from, to) {
  await mkdir(dirname(to), {recursive:true});
  await cp(from, to, {recursive:true, force:true});
}

async function listSnapshotFiles(rootDir) {
  const out = [];
  async function walk(dir) {
    for (const entry of await readdir(dir,{withFileTypes:true})) {
      const full = join(dir,entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const data = await readFile(full);
        out.push({
          path:relative(rootDir,full).replaceAll('\\','/'),
          bytes:data.byteLength,
          sha256:'sha256:' + createHash('sha256').update(data).digest('hex'),
        });
      }
    }
  }
  await walk(rootDir);
  return out.sort((a,b)=>a.path.localeCompare(b.path,'en'));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}

export async function cleanPlayerSourceSnapshot({output = defaultOutput} = {}) {
  await rm(output, {recursive:true, force:true});
}

export async function preparePlayerSourceSnapshot({output = defaultOutput} = {}) {
  await cleanPlayerSourceSnapshot({output});
  await mkdir(output, {recursive:true});

  for (const [from,to] of [
    [join(playerRoot,'src'), join(output,'packages','player','src')],
    [join(playerRoot,'scripts'), join(output,'packages','player','scripts')],
    [join(playerRoot,'server'), join(output,'packages','player','server')],
    [join(playerRoot,'schemas'), join(output,'packages','player','schemas')],
    [join(playerRoot,'types'), join(output,'packages','player','types')],
    [join(toolkitRoot,'web'), join(output,'packages','toolkit','web')],
    [join(toolkitRoot,'web-sdk-src'), join(output,'packages','toolkit','web-sdk-src')],
    [join(toolkitRoot,'web-build'), join(output,'packages','toolkit','web-build')],
  ]) {
    await copyTree(from,to);
  }

  for (const [from,to] of [
    [join(playerRoot,'package.json'), join(output,'packages','player','package.json')],
    [join(playerRoot,'LICENSE'), join(output,'packages','player','LICENSE')],
    [join(playerRoot,'NOTICE.md'), join(output,'packages','player','NOTICE.md')],
    [join(playerRoot,'THIRD_PARTY_NOTICES.md'), join(output,'packages','player','THIRD_PARTY_NOTICES.md')],
    [join(toolkitRoot,'package.json'), join(output,'packages','toolkit','package.json')],
    [join(toolkitRoot,'LICENSE'), join(output,'packages','toolkit','LICENSE')],
    [join(toolkitRoot,'NOTICE.md'), join(output,'packages','toolkit','NOTICE.md')],
    [join(repoRoot,'LICENSE'), join(output,'LICENSE')],
    [join(repoRoot,'NOTICE.md'), join(output,'NOTICE.md')],
  ]) {
    await mkdir(dirname(to), {recursive:true});
    await cp(from,to,{force:true});
  }

  const playerPackage = JSON.parse(await readFile(join(playerRoot,'package.json'),'utf8'));
  const toolkitPackage = JSON.parse(await readFile(join(toolkitRoot,'package.json'),'utf8'));
  const sourceRef =
    process.env.P2LRN_SOURCE_REF ??
    process.env.GITHUB_SHA ??
    process.env.COMMIT_REF ??
    null;

  const files = await listSnapshotFiles(output);
  const manifest = {
    schema:'https://p2lrn.org/schema/source-snapshot/1',
    version:'1',
    license:{
      id:'P2LRN-NCSL-1.0',
      name:'P2LRN Non-Commercial Source License 1.0',
      file:'LICENSE',
      notice:'NOTICE.md',
    },
    playerPackage:'@p2lrn/player',
    playerVersion:playerPackage.version,
    toolkitPackage:'@p2lrn/toolkit',
    toolkitVersion:toolkitPackage.version,
    sourceRef,
    reconstruct:{
      workingDirectory:'.',
      command:'node packages/player/scripts/build-dist.mjs',
      output:'packages/player/dist',
      note:'Third-party runtime dependencies are fetched at the exact versions and integrity hashes pinned by build-dist.mjs.',
    },
    files,
  };
  await writeFile(join(output,'SOURCE-MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');

  const links = files
    .map((item)=>'<li><a href="' + item.path.split('/').map(encodeURIComponent).join('/') + '">' + escapeHtml(item.path) + '</a> <small>' + item.bytes + ' bytes</small></li>')
    .join('\n');
  const indexHtml = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>P2LRN Corresponding Source ' +
    escapeHtml(playerPackage.version) +
    '</title></head><body><main><h1>P2LRN Corresponding Source</h1><p>Player ' +
    escapeHtml(playerPackage.version) +
    ' · Toolkit ' + escapeHtml(toolkitPackage.version) +
    '</p><p><a href="SOURCE-MANIFEST.json">SOURCE-MANIFEST.json</a> · <a href="LICENSE">LICENSE</a> · <a href="NOTICE.md">NOTICE.md</a></p><ul>' +
    links +
    '</ul></main></body></html>\n';
  await writeFile(join(output,'index.html'),indexHtml);
  return {output, manifest};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--clean')) {
    await cleanPlayerSourceSnapshot();
    const message=JSON.stringify({ok:true,cleaned:defaultOutput},null,2)+'\n';
    if (process.env.npm_config_json === 'true') process.stderr.write(message); else process.stdout.write(message);
  } else {
    const result = await preparePlayerSourceSnapshot();
    const message=JSON.stringify({ok:true,output:result.output,sourceRef:result.manifest.sourceRef},null,2)+'\n';
    if (process.env.npm_config_json === 'true') process.stderr.write(message); else process.stdout.write(message);
  }
}
