import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createOpaqueH5PRuntimeDocument} from '../web/h5p-auto-runtime.js';
import {createOpaquePackageRuntimeDocument} from '../web/renderers/package-runtime.js';

function policy(html) {
  const value=/http-equiv="Content-Security-Policy" content="([^"]+)"/i.exec(html)?.[1];
  assert.ok(value,'Opaque runtime requires an enforced CSP');
  return Object.fromEntries(value.split(';').filter(Boolean).map(item=>{
    const [name,...values]=item.trim().split(/\s+/);
    return [name,values.join(' ')];
  }));
}
function secureIsolation(p) {
  assert.equal(p['default-src'],"'none'");
  assert.equal(p['object-src'],"'none'");
  assert.equal(p['base-uri'],"'none'");
  assert.equal(p['form-action'],"'none'");
  assert.ok(!p['script-src']?.includes("'unsafe-eval'"),'Cannot enable arbitrary evaluation');
  assert.ok(!p['connect-src']?.includes('https:'),'No implicit remote networking');
  assert.ok(!p['connect-src']?.includes('*'),'No wildcards');
}

test('H5P opaque mode only accepts embedded media; never accepts arbitrary remote URLs',()=>{
  const p=policy(createOpaqueH5PRuntimeDocument());
  secureIsolation(p);
  assert.equal(p['connect-src'],'blob:');
  assert.equal(p['media-src'],'data: blob:');
  assert.equal(p['font-src'],'data: blob:');
  assert.equal(p['img-src'],'data: blob:');
  assert.ok(!p['frame-src'].includes('https:'));
});

test('Nested package runtime keeps opaque sandbox, no remote origin or navigation',()=>{
  const p=policy(createOpaquePackageRuntimeDocument());
  secureIsolation(p);
  assert.equal(p['connect-src'],'blob:');
  assert.equal(p['media-src'],'blob: data:');
});

test('Opaque renderers never set same-origin or top-navigation permission',async()=>{
  const [h5p, external]=await Promise.all([
    readFile(new URL('../web/renderers/h5p-runtime.js',import.meta.url),'utf8'),
    readFile(new URL('../web/renderers/package-runtime.js',import.meta.url),'utf8'),
  ]);
  assert.match(h5p,/opaqueMode\s*\?\s*'allow-scripts'/);
  assert.match(external,/opaqueMode\s*\?\s*'allow-scripts'/);
  for(const src of [h5p,external]){
    assert.doesNotMatch(src,/allow-top-navigation/u);
    assert.match(src,/iframe\.setAttribute\('referrerpolicy',\s*'no-referrer'\)/u);
  }
});
