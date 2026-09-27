import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostAdapter} from '../web/host-adapter.js';
import {RendererRegistry} from '../web/renderer-registry.js';
import {CMI5_RUNTIME_RENDERER,registerBuiltInRenderers} from '../web/built-in-renderers.js';
import {validateCmi5Launch} from '../web/renderers/cmi5-runtime.js';

function launch(overrides={}){
  const actor=encodeURIComponent(JSON.stringify({objectType:'Agent',account:{homePage:'https://lms.example.invalid',name:'learner-1'}}));
  const query=new URLSearchParams({
    endpoint:'https://lrs.example.invalid/xapi/',
    fetch:'https://lms.example.invalid/cmi5/fetch/once',
    actor:decodeURIComponent(actor),
    registration:'760e3480-ba55-4991-94b0-01820dbd23a2',
    activityId:'https://example.invalid/course/au/1',
  });
  for(const [key,value] of Object.entries(overrides.params??{})){if(value==null)query.delete(key);else query.set(key,String(value));}
  return{url:'https://content.example.invalid/launch.html?'+query.toString(),launchMethod:'AnyWindow',sessionId:'session-1',...overrides,params:undefined};
}

test('cmi5 launch gate accepts the five required query parameters and account IFI',()=>{
  const resolved=validateCmi5Launch(launch());
  assert.equal(resolved.launchMethod,'AnyWindow');
  assert.equal(resolved.sessionId,'session-1');
  const url=new URL(resolved.url);
  assert.equal(url.searchParams.get('activityId'),'https://example.invalid/course/au/1');
  assert.equal(JSON.parse(url.searchParams.get('actor')).account.name,'learner-1');
});

test('cmi5 launch gate rejects missing endpoint/fetch/actor/registration/activityId',()=>{
  for(const key of ['endpoint','fetch','actor','registration','activityId']){
    assert.throws(()=>validateCmi5Launch(launch({params:{[key]:null}})),error=>error?.code==='P2LRN_CMI5_LAUNCH_INVALID',key);
  }
});

test('cmi5 launch gate rejects invalid actor, registration and non-http endpoint/fetch',()=>{
  assert.throws(()=>validateCmi5Launch(launch({params:{actor:JSON.stringify({objectType:'Agent',mbox:'mailto:a@example.invalid'})}})),error=>error?.code==='P2LRN_CMI5_LAUNCH_INVALID');
  assert.throws(()=>validateCmi5Launch(launch({params:{registration:'not-a-uuid'}})),error=>error?.code==='P2LRN_CMI5_LAUNCH_INVALID');
  assert.throws(()=>validateCmi5Launch(launch({params:{endpoint:'javascript:alert(1)'}})),error=>error?.code==='P2LRN_CMI5_LAUNCH_INVALID');
  assert.throws(()=>validateCmi5Launch(launch({params:{fetch:'file:///secret'}})),error=>error?.code==='P2LRN_CMI5_LAUNCH_INVALID');
  assert.throws(()=>validateCmi5Launch(launch({url:'https://user:secret@content.example.invalid/launch?endpoint=https%3A%2F%2Flrs.example.invalid%2F&fetch=https%3A%2F%2Flms.example.invalid%2Ffetch&actor=%7B%22account%22%3A%7B%22homePage%22%3A%22https%3A%2F%2Flms.example.invalid%22%2C%22name%22%3A%22learner%22%7D%7D&registration=760e3480-ba55-4991-94b0-01820dbd23a2&activityId=https%3A%2F%2Fexample.invalid%2Fau'})),error=>error?.code==='P2LRN_CMI5_LAUNCH_INVALID');
  assert.throws(()=>validateCmi5Launch(launch({params:{endpoint:'https://user:secret@lrs.example.invalid/xapi/'}})),error=>error?.code==='P2LRN_CMI5_LAUNCH_INVALID');
  assert.throws(()=>validateCmi5Launch(launch({params:{fetch:'https://user:secret@lms.example.invalid/fetch'}})),error=>error?.code==='P2LRN_CMI5_LAUNCH_INVALID');
});

test('cmi5 launch gate only accepts AnyWindow and OwnWindow',()=>{
  assert.equal(validateCmi5Launch(launch({launchMethod:'OwnWindow'})).launchMethod,'OwnWindow');
  assert.throws(()=>validateCmi5Launch(launch({launchMethod:'PopupMaybe'})),error=>error?.code==='P2LRN_CMI5_LAUNCH_METHOD_UNSUPPORTED');
});

test('Host Adapter retains resolveRuntimeLaunch as an optional public callback',async()=>{
  const adapter=createHostAdapter({resolveRuntimeLaunch(request,context){return{...launch(),sessionId:request.sourceAuId+'@'+context.entityId};}});
  assert.equal(typeof adapter.resolveRuntimeLaunch,'function');
  const result=await adapter.resolveRuntimeLaunch({runtime:'cmi5',sourceAuId:'au1'},{entityId:'activity1'});
  assert.equal(result.sessionId,'au1@activity1');
});

test('renderer registry selects cmi5 runtime for remote and package-member primary representations',async()=>{
  const registry=registerBuiltInRenderers(new RendererRegistry());
  for(const location of [
    {type:'remote',href:'https://content.example.invalid/launch.html'},
    {type:'package-member',package:'packages/sha256/aa/bb/hash',member:'au/index.html'},
  ]){
    const representation={id:'cmi5-primary',role:'primary',profile:'https://p2lrn.org/profile/cmi5',mediaType:'text/html',location};
    const resource={id:'res',type:'resource',representations:[representation]};
    const entity={id:'act',type:'activity',activityType:'https://p2lrn.org/type/cmi5-au',resource:'res'};
    const candidate=await registry.select({representations:[representation],entity,resource});
    assert.equal(candidate.descriptor.id,CMI5_RUNTIME_RENDERER);
  }
});

test('cmi5 original package representation is not selected as a launch surface',async()=>{
  const registry=registerBuiltInRenderers(new RendererRegistry());
  const representation={id:'original',role:'original-package',profile:'https://p2lrn.org/profile/cmi5',mediaType:'application/zip',location:{type:'embedded',path:'package.zip'}};
  const candidate=await registry.select({representations:[representation],entity:{id:'act'},resource:{id:'res'}});
  assert.equal(candidate,null);
});
