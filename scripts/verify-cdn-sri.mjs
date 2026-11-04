import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';

const root=resolve(process.cwd(),'.netlify-cdn');
const manifest=JSON.parse(await readFile(join(root,'sri.json'),'utf8'));
const index=JSON.parse(await readFile(join(root,'index.json'),'utf8'));
const version=index.player.version;
assert.equal(manifest.schema,'https://p2lrn.org/schema/cdn-sri/1');
assert.equal(manifest.version,version);
assert.equal(index.sriManifest,'/sri.json');
const resources=Object.entries(manifest.resources??{});
assert.equal(resources.length,6,'Player, Studio and Analytics require classic/module SHA-384 metadata');
for(const [pathname,integrity] of resources){
  const parts=pathname.split('/');
  assert.ok(['player','studio','analytics'].includes(parts[1]),'Unrecognized CDN component');
  assert.equal(parts[2],version,'Only immutable versioned paths can be hash pinned');
  assert.equal(parts[3],'dist');
  assert.ok(parts.length>=5&&!parts.includes('..')&&!parts.includes('.'));
  assert.match(pathname,/^\/(?:player|studio|analytics)\/[A-Za-z0-9._-]+\/dist\/[A-Za-z0-9_./-]+$/);
  assert.ok(!pathname.includes('/current/'),'SRI must not advertise mutable channels');
  const data=await readFile(join(root,pathname.slice(1)));
  assert.equal('sha384-'+createHash('sha384').update(data).digest('base64'),integrity,pathname);
}
for(const component of ['player','studio','analytics']){
  for(const format of ['classic','module']){
    const asset=index[component][format];
    assert.equal(manifest.resources[asset],index[component].integrity?.[format]);
  }
}
console.log(JSON.stringify({ok:true,version,verifiedSriResources:resources.length},null,2));
