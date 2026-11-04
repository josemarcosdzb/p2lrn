import test from 'node:test';
import assert from 'node:assert/strict';
import {isSafeRuntimeMessage} from '../web/runtime-message-security.js';
import {readFile} from 'node:fs/promises';

test('cross-format bridge allows correctly-shaped bounded SCORM and H5P messages',()=>{
  const message={
    protocol:'p2lrn-scorm-runtime/1',action:'state',
    state:{values:{'cmi.core.lesson_status':'completed'},lifecycle:'initialized'},
    meta:{reason:'commit'},
  };
  assert.equal(isSafeRuntimeMessage(message),true);
  assert.equal(isSafeRuntimeMessage({protocol:'p2lrn-h5p-runtime/1',
    action:'xapi',statement:{verb:{id:'http://adlnet.gov/expapi/verbs/completed'}}}),true);
});
test('cross-format bridge rejects unsafe keys, forged types and huge or cyclic payloads',()=>{
  const base={protocol:'p2lrn-scorm-runtime/1',action:'state'};
  for(const k of ['__proto__','prototype','constructor']){
    const malicious=JSON.parse('{"protocol":"p2lrn-scorm-runtime/1","action":"state","state":{"'+k+'":{"isAdmin":true}}}');
    assert.equal(isSafeRuntimeMessage(malicious),false);
  }
  assert.equal(isSafeRuntimeMessage({...base,action:{fake:true}}),false);
  assert.equal(isSafeRuntimeMessage({...base,state:{value:'x'.repeat(20000)}},{maxBytes:4096}),false);
  const cyclic={...base};cyclic.state=cyclic;
  assert.equal(isSafeRuntimeMessage(cyclic),false);
  let nested={ok:true};for(let i=0;i<60;i++)nested={nested};
  assert.equal(isSafeRuntimeMessage({...base,state:nested}),false);
  assert.equal({}.isAdmin,undefined);
});
test('SCORM and H5P dispatch only through validated iframe sources and bounded messages',async()=>{
  for(const file of ['renderers/scorm-runtime.js','renderers/h5p-runtime.js']){
    const text=await readFile(new URL('../web/'+file,import.meta.url),'utf8');
    assert.match(text,/event\.source !== iframe\.contentWindow/);
    assert.match(text,/event\.origin !== runtimeOrigin/);
    assert.match(text,/isSafeRuntimeMessage\(/);
  }
});
