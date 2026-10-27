import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const hostPath=resolve(here,'../web/package-runtime-shell.js');
const runtimePath=resolve(here,'../web/renderers/package-runtime.js');

test('external package runtime rewrites deferred HTML templates and media references',async()=>{
  const source=await readFile(hostPath,'utf8');
  assert.match(source,/rewriteDeferredMarkup\(doc, path\)/);
  assert.match(source,/text\/template/);
  assert.match(source,/rewriteElementTree\(holder\.content, path\)/);
  assert.match(source,/const attrs = \['src','href','poster','data','background'\]/);
  assert.match(source,/srcset/);
  assert.match(source,/rewriteCss\(el\.getAttribute\('style'\), path\)/);
});

test('cmi5 preview provides a local return URL and forwards exit to the player runtime',async()=>{
  const host=await readFile(hostPath,'utf8');
  const runtime=await readFile(runtimePath,'utf8');
  assert.match(host,/EXIT_HASH='#p2lrn-cmi5-exit'/);
  assert.match(host,/returnURL:localReturnURL\(\)/);
  assert.match(host,/addEventListener\('hashchange',checkExitNavigation\)/);
  assert.match(host,/reply\('cmi5-exit'/);
  assert.match(runtime,/message\.action === 'cmi5-exit'/);
  assert.match(runtime,/exit:true/);
  assert.match(runtime,/Actividad cerrada\./);
});


test('3D physics does not require arbitrary JS eval in package host CSP',async()=>{
  const host=await readFile(hostPath,'utf8');
  assert.match(host,/script-src[^;]*'wasm-unsafe-eval'/,
    'WASM Rapier physics must be allowed in sandboxed package previews');
  assert.doesNotMatch(host,/script-src[^;]*\s'unsafe-eval'(?=\s|;)/,
    'arbitrary JavaScript eval must remain disabled');
});