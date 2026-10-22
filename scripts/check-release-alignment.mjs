import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
const execFileAsync=promisify(execFile);
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const names=['h5p-libraries','toolkit','player','studio'];
const pkg={};
for(const name of names)pkg[name]=JSON.parse(await readFile(resolve(root,'packages',name,'package.json'),'utf8'));
const versions=[...new Set(names.map(name=>pkg[name].version))];
assert.equal(versions.length,1,'Four npm package versions must match');
const version=versions[0];
assert.match(version,/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u);
assert.equal(pkg.player.peerDependencies?.['@p2lrn/h5p-libraries'],version,'Player H5P optional peer must be pinned');
assert.equal(pkg.studio.peerDependencies?.['@p2lrn/player'],version,'Studio Player peer must be pinned');
assert.equal(pkg.studio.dependencies?.['@p2lrn/toolkit'],version,'Studio Toolkit dependency must be pinned');
const markers=[
  ['packages/toolkit/web/p2lrn-player.js',"P2LRN_WEB_SDK_VERSION = '"+version+"'"],
  ['packages/toolkit/web/p2lrn-player.js',"P2LRN_TOOLKIT_VERSION = '"+version+"'"],
  ['packages/studio/src/p2lrn-studio.js',"P2LRN_STUDIO_VERSION='"+version+"'"],
  ['packages/toolkit/web-sdk-src/p2lrn.js',"const version = '"+version+"'"],
  ['packages/toolkit/src/tools/build-web-sdk.ts',"webSdkVersion:'"+version+"'"],
  ['packages/toolkit/src/tools/build-web-sdk.ts',"toolkitVersion:'"+version+"'"],
  ['packages/h5p-libraries/scripts/build.mjs',"packageVersion:'"+version+"'"],
  ['packages/toolkit/test/toolkit.test.mjs',"assert.equal(capabilities.product.version,'"+version+"')"],
  ['PUBLISHING.md','All four packages currently use the same release version: '+String.fromCharCode(96)+version],
];
for(const [relative,expected] of markers){
  const content=await readFile(resolve(root,relative),'utf8');
  assert(content.includes(expected),relative+' does not contain correct current version marker '+expected);
}
const capabilities=JSON.parse(await readFile(resolve(root,'packages/toolkit/config/capabilities.json'),'utf8'));
assert.equal(capabilities.product.version,version,'Capabilities report a different product version');
for(const relative of ['README.md','packages/player/README.md','packages/studio/README.md']){
  const content=await readFile(resolve(root,relative),'utf8');
  assert(content.includes(version),relative+' does not document the current prerelease version');
}
const report={ok:true,version,packages:names.map(name=>({name:pkg[name].name,version:pkg[name].version})),
  alignedInternalDependencies:['@p2lrn/studio -> @p2lrn/toolkit','@p2lrn/studio -> @p2lrn/player','@p2lrn/player -> @p2lrn/h5p-libraries'],
  sourceMarkersChecked:markers.length,capabilities:version,
  npmPublish:'NOT_PERFORMED'};
console.log('P2LRN_RELEASE_ALIGNMENT='+JSON.stringify(report));
