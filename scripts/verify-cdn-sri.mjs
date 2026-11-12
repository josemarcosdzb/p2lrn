import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {runtimeBootstrapCspManifest} from '../deploy/netlify/runtime-bootstrap-csp.mjs';

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
const headers=await readFile(join(root,'_headers'),'utf8');
const runtimeCsp=JSON.parse(await readFile(join(root,'runtime-bootstrap-csp.json'),'utf8'));
assert.deepEqual(runtimeCsp,runtimeBootstrapCspManifest());
const lines=headers.split(/\r?\n/);
let route='',matched=0;
for(const line of lines){
  if(line.startsWith('/')){route=line.trim();continue;}
  if(!runtimeCsp.routes.includes(route)||!/^\s+Content-Security-Policy:/.test(line))continue;
  const scriptSrc=/script-src ([^;]*);/.exec(line)?.[1]??'';
  assert.ok(!scriptSrc.includes("'unsafe-inline'"),'Runtime CSP must not allow all inline code: '+route);
  for(const hash of Object.values(runtimeCsp.hashes))assert.ok(scriptSrc.includes("'"+hash+"'"),'Missing sandbox bootstrap CSP hash: '+route);
  matched++;
}
assert.equal(matched,runtimeCsp.routes.length,'Demo and Studio CSP must authorize deterministic opaque sandbox scripts');

if(!headers.includes('/sri.json')||!headers.includes('Access-Control-Allow-Origin: *'))
  throw new Error('Published CDN SRI/CORS headers were overwritten by the website build');
for(const component of ['player','studio','analytics']){
  if(!headers.includes('/'+component+'/'+version+'/*'))
    throw new Error('Missing immutable '+component+' CDN cache/CORS headers');
}
for(const runtime of ['h5p.html','scorm.html','package.html']){
  if(!headers.includes('/player/'+version+'/dist/runtime-host/'+runtime))
    throw new Error('Missing isolated runtime CSP header: '+runtime);
}
for(const component of ['player','studio','analytics']){
  for(const format of ['classic','module']){
    const asset=index[component][format];
    assert.equal(manifest.resources[asset],index[component].integrity?.[format]);
  }
}
// Audit the HTML actually emitted by build-site.mjs, not just its source templates.
// A valid source placeholder is not a functioning integration example on a website.
const canonicalPlayerPath=index?.player?.classic;
const canonicalPlayerSri=index?.player?.integrity?.classic;
assert.equal(manifest.resources[canonicalPlayerPath],canonicalPlayerSri);
assert.equal('sha384-'+createHash('sha384').update(await readFile(join(root,canonicalPlayerPath.slice(1)))).digest('base64'),canonicalPlayerSri);
const pinnedHtmlSnippet='&lt;script src="https://p2lrn.org'+canonicalPlayerPath+'" integrity="'+canonicalPlayerSri+'" crossorigin="anonymous" referrerpolicy="no-referrer"&gt;&lt;/script&gt;';
for(const homepage of ['index.html','en/index.html']){
  const html=await readFile(join(root,homepage),'utf8');
  assert.ok(html.includes(pinnedHtmlSnippet),'Built homepage has no usable immutable CDN URL and SRI: '+homepage);
  assert.ok(html.includes('&lt;p2lrn-player src="./course.p2lrn"&gt;&lt;/p2lrn-player&gt;'),'Built homepage has no Player web component example: '+homepage);
  assert.doesNotMatch(html,/__P2LRN_PINNED_PLAYER_(?:URL|SRI)__/,'Unresolved homepage CDN marker: '+homepage);
}
console.log(JSON.stringify({ok:true,version,verifiedSriResources:resources.length},null,2));
