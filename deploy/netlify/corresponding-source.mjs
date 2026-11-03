import {createHash} from 'node:crypto';
import {cp, lstat, mkdir, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import {dirname, join, relative, resolve, sep} from 'node:path';

const SOURCE_DIRS=Object.freeze({
  toolkit:['src','config','web','web-sdk-src','web-build'],
  studio:['src','scripts','server','types','templates'],
  analytics:['src','scripts','types'],
});
const SOURCE_FILES=['package.json','README.md','LICENSE','NOTICE.md'];
const BLOCKED_NAME=/(?:^|\/)(?:node_modules|\.git|\.env(?:\..*)?|\.npmrc|dist|\.netlify-cdn)(?:\/|$)|\.(?:p12|pfx|pem|key)$/i;
const sha256=buffer=>'sha256:'+createHash('sha256').update(buffer).digest('hex');

async function scanFiles(directory,base=directory){
  const found=[];
  for(const item of await readdir(directory,{withFileTypes:true})){
    const path=join(directory,item.name);
    const rel=relative(base,path).replaceAll('\\','/');
    if(BLOCKED_NAME.test(rel))throw new Error('Unsafe path in source snapshot: '+rel);
    if(item.isSymbolicLink())throw new Error('Unexpected symlink in source snapshot: '+rel);
    if(item.isDirectory())found.push(...await scanFiles(path,base));
    else if(item.isFile())found.push(path);
    else throw new Error('Unexpected source entry: '+rel);
  }
  return found;
}
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

export async function publishPackageCorrespondingSource({root,outputRoot,name,version,sourceRef=null}){
  if(!Object.hasOwn(SOURCE_DIRS,name))throw new Error('Unsupported source package: '+name);
  if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))throw new Error('Invalid version');
  const packageRoot=resolve(root,'packages',name);
  const targetRoot=resolve(outputRoot,name,version,'source');
  if(!targetRoot.startsWith(resolve(outputRoot)+sep))throw new Error('Unsafe output path');
  const packageManifest=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));
  if(packageManifest.version!==version||packageManifest.license!=='SEE LICENSE IN LICENSE')
    throw new Error('Version or license mismatch in '+name);
  const sourceFiles=[...SOURCE_FILES];
  if(name==='toolkit')sourceFiles.push('tsconfig.json');
  const allowlist=[...SOURCE_DIRS[name],...sourceFiles];
  for(const part of allowlist){
    const source=join(packageRoot,part);
    const info=await lstat(source);
    if(info.isSymbolicLink())throw new Error('Symlink in source input: '+source);
    if(info.isDirectory())await scanFiles(source);
    else if(!info.isFile())throw new Error('Invalid source input: '+source);
    const destination=join(targetRoot,'packages',name,part);
    await mkdir(dirname(destination),{recursive:true});
    await cp(source,destination,{recursive:true,force:true});
  }
  for(const legal of ['LICENSE','NOTICE.md']){
    const original=await readFile(join(root,legal));
    const local=await readFile(join(packageRoot,legal));
    if(!original.equals(local))throw new Error(name+' '+legal+' differs from authoritative repository copy');
    await writeFile(join(targetRoot,legal),original);
  }
  const tracked=await scanFiles(join(targetRoot,'packages',name),targetRoot);
  const files=[];
  for(const filename of tracked.sort((a,b)=>a.localeCompare(b,'en'))){
    const bytes=await readFile(filename);
    files.push({path:relative(targetRoot,filename).replaceAll('\\','/'),bytes:bytes.length,sha256:sha256(bytes)});
  }
  const dependencies=name==='studio'?['toolkit']:name==='analytics'?[]:[];
  const manifest={
    schema:'https://p2lrn.org/schema/source-snapshot/1',version:'1',
    package:packageManifest.name,packageVersion:version,
    sourceRef,
    license:{id:'P2LRN-NCSL-1.0',file:'LICENSE',notice:'NOTICE.md'},
    build:{command:packageManifest.scripts?.['build:dist']??packageManifest.scripts?.build??'npm pack',workingDirectory:'packages/'+name,
      dependencies:dependencies.map(item=>'@p2lrn/'+item+'@'+version)},
    files,
  };
  await writeFile(join(targetRoot,'SOURCE-MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
  const links=files.map(entry=>'<li><a href="'+entry.path.split('/').map(encodeURIComponent).join('/')+'">'+esc(entry.path)+'</a> · '+entry.bytes+' bytes</li>').join('\n');
  await writeFile(join(targetRoot,'index.html'),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>'+esc(packageManifest.name)+' corresponding source '+esc(version)+'</title></head>'+
    '<body><main><h1>'+esc(packageManifest.name)+' corresponding source</h1><p>Version '+esc(version)+
    '</p><p><a href="SOURCE-MANIFEST.json">Source manifest</a> · <a href="LICENSE">LICENSE</a> · <a href="NOTICE.md">NOTICE.md</a></p><ul>'+links+'</ul></main></body></html>\n');
  return {manifest,targetRoot};
}

export async function verifyPackageCorrespondingSource({outputRoot,name,version}){
  const root=join(outputRoot,name,version,'source');
  const manifest=JSON.parse(await readFile(join(root,'SOURCE-MANIFEST.json'),'utf8'));
  if(manifest.package!=='@p2lrn/'+name||manifest.packageVersion!==version||manifest.license?.id!=='P2LRN-NCSL-1.0')
    throw new Error('Incorrect corresponding-source metadata for '+name);
  if(!Array.isArray(manifest.files)||!manifest.files.length)throw new Error('Source list is empty for '+name);
  for(const entry of manifest.files){
    if(!entry.path.startsWith('packages/'+name+'/')||entry.path.split('/').includes('..'))
      throw new Error('Unsafe corresponding-source entry: '+entry.path);
    const buf=await readFile(join(root,...entry.path.split('/')));
    if(buf.length!==entry.bytes||sha256(buf)!==entry.sha256)
      throw new Error('Corresponding-source hash mismatch: '+entry.path);
  }
  for(const required of ['package.json','LICENSE','NOTICE.md']){
    if(!manifest.files.some(e=>e.path==='packages/'+name+'/'+required))throw new Error('Missing '+name+' '+required);
  }
  return {name,version,fileCount:manifest.files.length,valid:true,sha256:sha256(await readFile(join(root,'SOURCE-MANIFEST.json')))};
}
