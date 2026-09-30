import test from 'node:test';
import assert from 'node:assert/strict';
import {webEntrypointUrl} from '../web/renderers/passive-text.js';

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
