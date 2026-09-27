import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostAdapter} from '../web/host-adapter.js';
import {RendererRegistry} from '../web/renderer-registry.js';
import {LTI13_RUNTIME_RENDERER,registerBuiltInRenderers} from '../web/built-in-renderers.js';
import {validateLti13Launch} from '../web/renderers/lti13-runtime.js';

function launch(overrides={}){
  return{protocol:'LTI-1.3',rebound:true,url:'https://platform.example.invalid/lti/session/launch',presentation:'iframe',sessionId:'session-1',registrationId:'registration-1',deploymentId:'deployment-1',...overrides};
}

test('LTI 1.3 launch gate requires explicit protocol and confirmed host rebind',()=>{
  const result=validateLti13Launch(launch());
  assert.equal(result.protocol,'LTI-1.3');
  assert.equal(result.rebound,true);
  assert.equal(result.presentation,'iframe');
  assert.equal(result.url,'https://platform.example.invalid/lti/session/launch');
  assert.throws(()=>validateLti13Launch({...launch(),protocol:'LTI-1.1'}),error=>error?.code==='P2LRN_LTI_LAUNCH_INVALID');
  assert.throws(()=>validateLti13Launch({...launch(),rebound:false}),error=>error?.code==='P2LRN_LTI_REBIND_REQUIRED');
});

test('LTI launch gate only accepts HTTP(S) host session URLs and known presentation modes',()=>{
  assert.equal(validateLti13Launch({...launch(),presentation:'window'}).presentation,'window');
  assert.throws(()=>validateLti13Launch({...launch(),url:'javascript:alert(1)'}),error=>error?.code==='P2LRN_LTI_LAUNCH_INVALID');
  assert.throws(()=>validateLti13Launch({...launch(),url:'https://user:secret@platform.example.invalid/lti/session'}),error=>error?.code==='P2LRN_LTI_LAUNCH_INVALID');
  assert.throws(()=>validateLti13Launch({...launch(),presentation:'popup-maybe'}),error=>error?.code==='P2LRN_LTI_PRESENTATION_UNSUPPORTED');
});

test('Host Adapter can provide an LTI platform-owned launch session without packaging credentials',async()=>{
  const adapter=createHostAdapter({resolveRuntimeLaunch(request,context){
    assert.equal(request.runtime,'lti13');
    assert.equal(request.targetLinkUri,'https://tool.example.invalid/resource/42');
    assert.equal(request.rebindRequired,true);
    assert.equal(context.entityId,'activity-1');
    return launch();
  }});
  const result=await adapter.resolveRuntimeLaunch({runtime:'lti13',targetLinkUri:'https://tool.example.invalid/resource/42',rebindRequired:true},{entityId:'activity-1'});
  assert.equal(result.protocol,'LTI-1.3');
});

test('renderer registry selects LTI runtime only for primary remote LTI intent',async()=>{
  const registry=registerBuiltInRenderers(new RendererRegistry());
  const representation={id:'lti-primary',role:'primary',profile:'https://p2lrn.org/profile/lti',mediaType:'application/vnd.ims.lti.v1.ltilink',location:{type:'remote',href:'https://tool.example.invalid/resource/42'},extensions:{'https://p2lrn.org/profile/lti':{sourceVersion:'1.0',targetLinkUri:'https://tool.example.invalid/resource/42',rebindRequired:true}}};
  const resource={id:'res',type:'resource',representations:[representation]};
  const entity={id:'act',type:'activity',activityType:'https://p2lrn.org/type/external-tool',resource:'res'};
  const candidate=await registry.select({representations:[representation],entity,resource});
  assert.equal(candidate.descriptor.id,LTI13_RUNTIME_RENDERER);
});

test('LTI original package is not selected as a tool launch representation',async()=>{
  const registry=registerBuiltInRenderers(new RendererRegistry());
  const representation={id:'original',role:'original-package',profile:'https://p2lrn.org/profile/lti',mediaType:'application/zip',location:{type:'embedded',path:'package.zip'}};
  const candidate=await registry.select({representations:[representation],entity:{id:'act'},resource:{id:'res'}});
  assert.equal(candidate,null);
});
