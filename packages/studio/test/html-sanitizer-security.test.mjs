import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sourcePaths=[
  new URL('../src/p2lrn-studio.js',import.meta.url),
  new URL('../../../deploy/netlify/site/studio/studio.js',import.meta.url),
];
const sanitizers=await Promise.all(sourcePaths.map(async url=>{
  const source=await readFile(url,'utf8');
  const start=source.indexOf('function sanitizeHtml(text){');
  const end=source.indexOf('\n}\n',start);
  assert.ok(start>=0&&end>start,'Studio HTML sanitizer must be present');
  return source.slice(start,end+2);
}));

test('NPM Studio and public website use identical HTML sanitizer policy',()=>{
  assert.equal(sanitizers[0],sanitizers[1],'Studio npm and public website must not drift');
});
test('Studio lesson editor removes active markup and event attributes before mounting',()=>{
  for(const s of sanitizers){
    assert.match(s,/script,iframe,frame,frameset,object,embed,form/);
    assert.match(s,/svg,math,template,portal/);
    assert.match(s,/name\.startsWith\('on'\)/);
    assert.match(s,/srcdoc/);
    assert.match(s,/xlink:href/);
    assert.match(s,/srcset/);
    assert.match(s,/node\.removeAttribute/);
    assert.match(s,/node\.remove\(\)/);
  }
});
test('Studio blocks unsafe URLs and CSS without dropping ordinary formatting',()=>{
  for(const s of sanitizers){
    assert.match(s,/safeUrl/);
    assert.match(s,/javascript|url\.protocol|https:|http:/);
    assert.match(s,/^data:image|data:image/i);
    assert.match(s,/@import/);
    assert.match(s,/position\\s\*/);
    assert.match(s,/noopener noreferrer/);
    for(const tag of ['h1','p','strong','table','img','video','audio']){
      assert.ok(s.includes("'"+tag+"'"),'Expected supported WYSIWYG tag '+tag);
    }
  }
});
