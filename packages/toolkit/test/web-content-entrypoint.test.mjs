import test from 'node:test';
import assert from 'node:assert/strict';
import {webEntrypointUrl} from '../web/renderers/passive-text.js';
import {safeWebLogicalPath} from '../web/web-content-core.js';

test('webEntrypointUrl keeps a web bundle entrypoint inside the verified virtual route',()=>{
  const base='https://example.test/__p2lrn__/v1/route/capability/pages/';
  assert.equal(
    webEntrypointUrl(base,'pages/index.html'),
    'https://example.test/__p2lrn__/v1/route/capability/pages/index.html',
  );
});

test('webEntrypointUrl safely encodes the final entrypoint segment',()=>{
  const base='https://example.test/__p2lrn__/v1/route/capability/material/';
  assert.equal(
    webEntrypointUrl(base,'material/tema 1.html'),
    'https://example.test/__p2lrn__/v1/route/capability/material/tema%201.html',
  );
});

test('web-content logical paths reject encoded traversal and reserved object keys',()=>{
  for(const name of ['../private','nested/../../secret','nested/%2e%2e/secret',
    'nested/%2F/etc','nested/%5c..','C:/secret','nested/a?b','nested/a#b',
    '__proto__','nested/constructor','nested/prototype']){
    assert.throws(()=>safeWebLogicalPath(name),/Unsafe web-content logical path/);
  }
  assert.equal(safeWebLogicalPath('pages/tema 1.html'),'pages/tema 1.html');
  assert.equal(safeWebLogicalPath('resources/galeria.png'),'resources/galeria.png');
});
