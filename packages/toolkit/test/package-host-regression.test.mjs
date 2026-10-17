import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const hostPath=resolve(here,'../web/runtime-host/package-host.js');
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

import {createOpaquePackageRuntimeDocument} from '../web/renderers/package-runtime.js';
import {getAutomaticRuntimeHostResources} from '../web/runtime-host-config.js';

test('external package runtime selects automatic opaque origin without a configured service',async()=>{
  const runtime=await readFile(runtimePath,'utf8');
  const resources=getAutomaticRuntimeHostResources('https://app.example.invalid/player/runtime-host/');
  assert.equal(resources.packageHostScriptUrl,'https://app.example.invalid/player/runtime-host/package-host.js');
  const html=createOpaquePackageRuntimeDocument({hostScriptUrl:resources.packageHostScriptUrl});
  assert.match(html,/package-host\.js/u);
  assert.match(html,/Content-Security-Policy/u);
  assert.match(html,/connect-src 'none'/u);
  assert.doesNotMatch(html,/allow-same-origin/u);
  assert.match(runtime,/const opaqueMode = !runtimeUrl/u);
  assert.match(runtime,/iframe\.srcdoc = opaqueDocument/u);
  assert.match(runtime,/event\.source !== iframe\.contentWindow \|\| event\.origin !== runtimeOrigin/u);
  assert.match(runtime,/opaqueMode \? 'allow-scripts allow-forms allow-modals'/u);
  assert.match(runtime,/new MessageChannel\(\)/u);
});
test('opaque runtime rejects unsafe externally supplied host script URLs',()=>{
  for(const url of ['http://example.invalid/host.js','javascript:alert(1)','https://user:pass@example.invalid/host.js','https://example.invalid/host.js?token=secret']){
    assert.throws(()=>createOpaquePackageRuntimeDocument({hostScriptUrl:url}),/HTTPS runtime script/i);
  }
  assert.doesNotThrow(()=>createOpaquePackageRuntimeDocument({hostScriptUrl:'http://127.0.0.1:3000/runtime-host/package-host.js'}));
});
