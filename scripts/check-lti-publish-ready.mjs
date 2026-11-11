// Explicit release-owner gate for @p2lrn/lti-provider.
// This script runs only on npm publish, not npm pack or installation.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=async p=>readFile(resolve(root,p),'utf8');
const pkg=JSON.parse(await read('integration/lms/package.json'));
const toolkit=JSON.parse(await read('packages/toolkit/package.json'));
const player=JSON.parse(await read('packages/player/package.json'));
assert.equal(pkg.name,'@p2lrn/lti-provider');
assert.equal(pkg.private,undefined,'LTI package must not be private');
assert.equal(pkg.version,player.version);
assert.equal(pkg.version,toolkit.version);
assert.equal(pkg.dependencies['@p2lrn/player'],player.version);
assert.equal(pkg.dependencies['@p2lrn/toolkit'],toolkit.version);
assert.equal(pkg.bin['p2lrn-lti'],'./bin/p2lrn-lti.mjs');
assert.equal(await read('integration/lms/LICENSE'),await read('LICENSE'));
assert.equal(await read('integration/lms/NOTICE.md'),await read('NOTICE.md'));
assert.ok(pkg.files.includes('lti-server.mjs'));
assert.ok(pkg.files.includes('lti-installer.mjs'));
assert.ok(pkg.files.includes('bin/'));
assert.ok(pkg.files.includes('LICENSE')&&pkg.files.includes('NOTICE.md'));
assert.ok(!pkg.files.some(f=>f.endsWith('.test.mjs')));
if(process.env.P2LRN_LTI_RELEASE_APPROVED!=='YES')
 throw new Error('LTI_PROVIDER_RELEASE_NOT_APPROVED: stage, test and explicitly approve the release first');
for(const packageName of ['@p2lrn/player','@p2lrn/toolkit']){
 const url='https://registry.npmjs.org/'+encodeURIComponent(packageName)+'/'+pkg.version;
 const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
 if(response.status!==200)
  throw new Error('Required runtime is not published in npm: '+packageName+'@'+pkg.version+
   ' (HTTP '+response.status+')');
 const manifest=await response.json();
 if(manifest.name!==packageName||manifest.version!==pkg.version||!manifest.dist?.integrity)
  throw new Error('Invalid npm dependency manifest for '+packageName);
}
console.log('LTI Provider publication prerequisites verified. Publishing still requires npm credentials.');
