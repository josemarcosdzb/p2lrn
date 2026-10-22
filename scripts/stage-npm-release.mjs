import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFile,mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const execFileAsync=promisify(execFile);
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const names=['h5p-libraries','toolkit','player','studio'];
const dryRun=process.argv.includes('--dry-run');
const targetTag='next';
const registry='https://registry.npmjs.org';
const repo=process.env.GITHUB_REPOSITORY||'josemarcosfrodo/p2lrn';
const profile=process.env.USERPROFILE??process.env.HOME;
if(!profile)throw Error('Release candidate staging needs USERPROFILE or HOME');
const packages=await Promise.all(names.map(async name=>JSON.parse(await readFile(join(root,'packages',name,'package.json'),'utf8'))));
const version=packages[0].version;
assert(packages.every(pkg=>pkg.version===version),'Four release versions differ');
assert.match(version,/^\d+\.\d+\.\d+-[0-9A-Za-z.-]+$/u,'Candidate must be a prerelease, not stable latest');
assert.equal(packages[2].peerDependencies?.['@p2lrn/h5p-libraries'],version);
assert.equal(packages[3].dependencies?.['@p2lrn/toolkit'],version);
assert.equal(packages[3].peerDependencies?.['@p2lrn/player'],version);
const {stdout:localSha}=await execFileAsync('git',['rev-parse','HEAD'],{cwd:root});
const commit=localSha.trim();
assert.match(commit,/^[a-f0-9]{40}$/u);
if(process.env.GITHUB_SHA&&process.env.GITHUB_SHA!==commit)throw Error('GitHub checkout SHA mismatch; refusing to stage');
const out=join(profile,'Downloads','p2lrn-npm-release',version,commit);
const filenames=names.map(name=>'p2lrn-'+name+'-'+version+'.tgz');
const expectedPacks=filenames.map(file=>join(root,'.npm-pack-gate','packs',file));
for(const path of expectedPacks)assert((await stat(path)).isFile(),'Missing built npm tarball '+path);
async function request(url,extraHeaders={}){
  const headers={'Accept':'application/vnd.github+json','User-Agent':'p2lrn-npm-release-gate',...extraHeaders};
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(30000),redirect:'error'});
  return response;
}
async function remoteHead(){
  const token=process.env.GITHUB_TOKEN;
  const headers=token?{'Authorization':'Bearer '+token}:{};
  const response=await request('https://api.github.com/repos/'+repo+'/branches/main',headers);
  if(!response.ok)throw Error('Cannot verify main HEAD before staging (HTTP '+response.status+')');
  const branch=await response.json();
  const sha=branch?.commit?.sha;
  assert.match(sha??'',/^[a-f0-9]{40}$/u);
  return sha;
}
const actualHead=await remoteHead();
if(actualHead!==commit)throw Error('main advanced to '+actualHead+' during CI. This release candidate was built from '+commit+'. Re-run on new main.');
const registryItems=[];
for(const pkg of packages){
  const url=registry+'/'+encodeURIComponent(pkg.name)+'/'+encodeURIComponent(version);
  const response=await fetch(url,{method:'GET',headers:{'Accept':'application/json'},signal:AbortSignal.timeout(20000)});
  if(response.status===404)registryItems.push({name:pkg.name,status:'not-published'});
  else if(response.ok)registryItems.push({name:pkg.name,status:'published'});
  else throw Error('Unable to determine registry status of '+pkg.name+': HTTP '+response.status);
}
const published=registryItems.filter(entry=>entry.status==='published');
if(published.length===4){
  console.log('NPM_RELEASE_STAGE_SKIPPED='+JSON.stringify({version,reason:'already-published',releaseCommit:commit}));
  process.exit(0);
}
if(published.length!==0)throw Error('Partial package publication already exists. Refusing an incomplete release candidate: '+JSON.stringify(registryItems));
const checks=[];
for(let i=0;i<expectedPacks.length;i++){
  const bytes=await readFile(expectedPacks[i]);
  assert(bytes.length>100,'Empty npm tarball: '+filenames[i]);
  checks.push({name:packages[i].name,filename:filenames[i],bytes:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex'),
    sha512:createHash('sha512').update(bytes).digest('hex')});
}
if(await remoteHead()!==commit)throw Error('main moved while staging; refusing stale artifacts');
if(dryRun){
  console.log('NPM_RELEASE_STAGE_DRY_RUN='+JSON.stringify({commit,version,tag:targetTag,registryItems,files:checks,destination:out}));
  process.exit(0);
}
await mkdir(out,{recursive:true});
for(const check of checks)await copyFile(join(root,'.npm-pack-gate','packs',check.filename),join(out,check.filename));
const manifest={
  schema:'https://p2lrn.org/schema/npm-release-candidate/1',version,tag:targetTag,
  status:'STAGED_NOT_PUBLISHED',sourceRepository:repo,sourceCommit:commit,
  assembledAt:new Date().toISOString(),
  packages:checks,publicRegistryBeforeStaging:registryItems,
  validatedBy:'Full CI source tests, package tarball install/browser, npm/CDN byte identity',
  warning:'Re-run the release gate if main changes; do not publish stale tarballs.',
};
await writeFile(join(out,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const commands=[
  '# Paquetes listos para publicacion manual. Este archivo NO se ejecuta en CI.',
  '# Solo ejecutar despues de revisar el SHA, aprobar esta entrega y autenticar npm.',
  '$ErrorActionPreference = "Stop"',
  '$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot "release-manifest.json") -Raw | ConvertFrom-Json',
  'if ($manifest.status -ne "STAGED_NOT_PUBLISHED") { throw "No hay una candidata valida" }',
  'if ($manifest.tag -ne "next") { throw "Esta entrega no puede publicarse como latest" }',
  'foreach ($p in $manifest.packages) {',
  '  $file = Join-Path $PSScriptRoot $p.filename',
  '  $sum = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()',
  '  if ($sum -ne $p.sha256) { throw ("Hash distinto: " + $p.filename) }',
  '}',
  'Write-Host ("Origen validado: " + $manifest.sourceCommit)',
  'Write-Host ("Version: " + $manifest.version + " bajo next")',
  '$repo = $manifest.sourceRepository',
  '$h = @{ "Accept" = "application/vnd.github+json"; "User-Agent" = "p2lrn-release-gate" }',
  'if ($env:GITHUB_TOKEN) { $h.Authorization = "Bearer $env:GITHUB_TOKEN" }',
  '$branch = Invoke-RestMethod -Uri ("https://api.github.com/repos/" + $repo + "/branches/main") -Headers $h',
  'if ($branch.commit.sha -ne $manifest.sourceCommit) { throw "main ha cambiado. Reconstruye los paquetes antes de publicar." }',
  'foreach ($p in $manifest.packages) {',
  '  $existing = npm view ($p.name + "@" + $manifest.version) version --json 2>$null',
  '  if ($LASTEXITCODE -eq 0) { throw ("La version ya existe en npm: " + $p.name) }',
  '}',
  'npm whoami',
  'if ($LASTEXITCODE -ne 0) { throw "Autentica npm antes de publicar" }',
  'foreach ($p in $manifest.packages) {',
  '  Write-Host ("Publicando " + $p.name)',
  '  npm publish (Join-Path $PSScriptRoot $p.filename) --access public --tag next',
  '  if ($LASTEXITCODE -ne 0) { throw ("Error publicando " + $p.name) }',
  '  npm view ($p.name + "@" + $manifest.version) version',
  '  if ($LASTEXITCODE -ne 0) { throw ("No se pudo verificar el paquete " + $p.name) }',
  '}',
  'Write-Host "Se publicaron los cuatro paquetes en npm bajo next. Ejecuta la validacion limpia del registro."',
];
await writeFile(join(out,'publicar-next.ps1'),commands.join('\r\n')+'\r\n');
if(await remoteHead()!==commit)throw Error('main changed after staging. Reject this candidate and re-run CI.');
console.log('NPM_RELEASE_STAGED='+JSON.stringify({version,tag:targetTag,commit,directory:out,files:checks.map(x=>x.filename),status:manifest.status}));
