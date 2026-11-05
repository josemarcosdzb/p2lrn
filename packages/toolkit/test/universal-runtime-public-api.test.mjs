import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';

import {
  defaultRendererRegistry,defaultDependencyRegistry,
  P2LRNPlayerElement,
} from '../web/p2lrn-player.js';
import {P2LRN_EXECUTION_PLAN_SCHEMA} from '../web/execution-negotiation.js';

const root=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
test('Player global API exposes the same trusted universal preflight as the live registry',()=>{
  const api=globalThis.P2LRN;
  assert(api,'Public Player API missing');
  assert.equal(api.PlayerElement,P2LRNPlayerElement);
  assert.equal(typeof api.negotiateExecution,'function');
  assert.equal(typeof api.inspectPackageExecution,'function');
  assert.equal(api.executionPlanSchema,P2LRN_EXECUTION_PLAN_SCHEMA);
  assert.equal(api.executionPlanVersion,'1');
  assert(defaultRendererRegistry.list().length>0);
  assert(defaultDependencyRegistry.list().length>0);
});
test('NPM ESM exports both inspection operations and includes runtime dependencies in canonical build',async()=>{
  const sdk=await readFile(join(root,'packages/toolkit/web-sdk-src/p2lrn.esm.js'),'utf8');
  const older=await readFile(join(root,'packages/player/src/p2lrn.esm.js'),'utf8');
  const builder=await readFile(join(root,'packages/player/scripts/build-dist.mjs'),'utf8');
  const types=await readFile(join(root,'packages/player/types/index.d.ts'),'utf8');
  for(const source of [sdk,older]){
    assert.match(source,/export const negotiateExecution = /u);
    assert.match(source,/export const inspectPackageExecution = /u);
    assert.match(source,/from '\.\/execution-negotiation\.js'/u);
  }
  assert.match(builder,/copyCanonicalRuntime/u);
  assert.match(builder,/for \(const source of \(await walk\(web\)\)\.sort\(\)\)/u);
  assert.match(types,/readonly negotiateExecution:typeof negotiateExecution/u);
  assert.match(types,/readonly inspectPackageExecution:typeof inspectPackageExecution/u);
});
