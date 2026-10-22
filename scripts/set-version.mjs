import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// A release version belongs to the entire product, never just Player/Toolkit.
// Dry-run performs exactly the same validation as a real bump, without writes.
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const argv=process.argv.slice(2);
const dryRun=argv.includes('--dry-run');
const version=String(argv.find(arg=>!arg.startsWith('--'))??'').trim();
const expected=argv.find(arg=>arg.startsWith('--expect-current='))?.slice('--expect-current='.length);
if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u.test(version)){
  console.error('Usage: node scripts/set-version.mjs <semver> [--dry-run] [--expect-current=<semver>]');
  process.exit(2);
}
const paths=['h5p-libraries','toolkit','player','studio'];
const originals=new Map(),pending=new Map();
async function contents(relative){
  if(pending.has(relative))return pending.get(relative);
  if(originals.has(relative))return originals.get(relative);
  const value=await readFile(resolve(root,relative),'utf8');
  originals.set(relative,value);
  return value;
}
async function mutateJson(relative,fn){
  const object=JSON.parse(await contents(relative));
  fn(object);
  pending.set(relative,JSON.stringify(object,null,2)+'\n');
}
async function change(relative,regex,replacement,label){
  const before=await contents(relative);
  const matches=[...before.matchAll(new RegExp(regex.source,regex.flags.replaceAll('g','')+'g'))];
  if(matches.length!==1)throw new Error(relative+': expected exactly one '+label+' marker, got '+matches.length);
  const after=before.replace(regex,replacement);
  pending.set(relative,after);
}
function internalPin(object,name){
  if(!object||typeof object[name]!=='string')throw Error('Expected internal dependency '+name);
  if(object[name]!==previous && object[name]!==version){
    throw Error('Refusing to replace unexpected '+name+' pin '+object[name]+' (expected '+previous+')');
  }
  object[name]=version;
}
const manifests=await Promise.all(paths.map(async name=>{
  const relative='packages/'+name+'/package.json';
  return {name,relative,json:JSON.parse(await contents(relative))};
}));
const versions=[...new Set(manifests.map(x=>x.json.version))];
if(versions.length!==1)throw Error('Cannot bump mismatched package versions: '+versions.join(','));
const previous=versions[0];
if(expected&&expected!==previous)throw Error('Version changed under us: expected '+expected+' but found '+previous);
if(previous===version)throw Error('Requested version already installed: '+version);
const oldOrder=previous.split('-')[0].split('.').map(Number);
const newOrder=version.split('-')[0].split('.').map(Number);
for(let i=0;i<3;i++){
  if(newOrder[i]!==oldOrder[i]){if(newOrder[i]<oldOrder[i])throw Error('Version must not move backwards');break;}
}
for(const {name,relative} of manifests){
  await mutateJson(relative,pkg=>{
    if(pkg.version!==previous)throw Error(relative+': version drift');
    pkg.version=version;
    if(name==='player')internalPin(pkg.peerDependencies,'@p2lrn/h5p-libraries');
    if(name==='studio'){
      internalPin(pkg.dependencies,'@p2lrn/toolkit');
      internalPin(pkg.peerDependencies,'@p2lrn/player');
    }
  });
}
await mutateJson('packages/toolkit/config/capabilities.json',value=>{
  if(value.product?.version!==previous)throw Error('Capabilities version drift');
  value.product.version=version;
});
const quoted=pattern=>new RegExp(pattern,"u");
await change('packages/toolkit/web/p2lrn-player.js',
  /export const P2LRN_WEB_SDK_VERSION = '[^']+';/u,
  "export const P2LRN_WEB_SDK_VERSION = '"+version+"';",'Web SDK version');
await change('packages/toolkit/web/p2lrn-player.js',
  /export const P2LRN_TOOLKIT_VERSION = '[^']+';/u,
  "export const P2LRN_TOOLKIT_VERSION = '"+version+"';",'Toolkit runtime version');
await change('packages/studio/src/p2lrn-studio.js',
  /export const P2LRN_STUDIO_VERSION='[^']+';/u,
  "export const P2LRN_STUDIO_VERSION='"+version+"';",'Studio runtime version');
await change('packages/toolkit/web-sdk-src/p2lrn.js',
  /const version = '[^']+';/u,
  "const version = '"+version+"';",'Web loader version');
await change('packages/toolkit/src/tools/build-web-sdk.ts',
  /webSdkVersion:'[^']+'/u,"webSdkVersion:'"+version+"'",'Web release version');
await change('packages/toolkit/src/tools/build-web-sdk.ts',
  /toolkitVersion:'[^']+'/u,"toolkitVersion:'"+version+"'",'Toolkit release version');
await change('packages/h5p-libraries/scripts/build.mjs',
  /packageVersion:'[^']+'/u,"packageVersion:'"+version+"'",'H5P version');
await change('packages/toolkit/test/toolkit.test.mjs',
  /assert\.equal\(capabilities\.product\.version,'[^']+'\);/u,
  "assert.equal(capabilities.product.version,'"+version+"');",'Capabilities assertion');
// Update current installation instructions, but preserve historical QA evidence.
for(const relative of [
  'README.md','packages/player/README.md','packages/toolkit/README.md',
  'packages/studio/README.md',
]){
  const before=await contents(relative);
  if(!before.includes(previous))throw Error(relative+': cannot find current version '+previous);
  pending.set(relative,before.replaceAll(previous,version));
}
// PUBLISHING.md includes an important historical statement about the previously
// published immutable prerelease. Do not change that history.
const publishing='PUBLISHING.md';
const before=await contents(publishing);
const needle='All four packages currently use the same release version: \`'+previous+'\`.';
if(!before.includes(needle))throw Error('PUBLISHING.md current version marker missing');
pending.set(publishing,before.replace(needle,'All four packages currently use the same release version: \`'+version+'\`.'));
const changes=[...pending.entries()].filter(([path,value])=>value!==originals.get(path));
if(changes.length!==pending.size)throw Error('Version bump contained unexpected no-op changes');
if(!dryRun){
  for(const [relative,content] of changes)await writeFile(resolve(root,relative),content);
}
console.log(JSON.stringify({
  ok:true,dryRun,previous,version,aligned:paths.map(name=>'@p2lrn/'+name),
  releaseIdentifiers:['Studio runtime','Player runtime','Toolkit runtime','H5P library builder','CDN loader','source release','capabilities','installation docs'],
  touched:changes.map(([path])=>path),
  publication:'NOT_PERFORMED',
},null,2));
