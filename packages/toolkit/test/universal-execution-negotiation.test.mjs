import test from 'node:test';
import assert from 'node:assert/strict';
import {RendererRegistry} from '../web/renderer-registry.js';
import {DependencyRegistry} from '../web/dependency-registry.js';
import {
  negotiateP2LRNExecution,inspectP2LRNPackageExecution,
  P2LRN_EXECUTION_PLAN_SCHEMA,
} from '../web/execution-negotiation.js';

const prefix='https://p2lrn.org/test/';
const profile=(name)=>'https://p2lrn.org/profile/'+name;
const rep=(id='primary',name='native-questionnaire',type='embedded')=>({
  id,profile:profile(name),mediaType:'application/json',role:'primary',
  location:type==='remote'?{type,href:'https://example.test/content',expectedDigest:'sha256:'+'a'.repeat(64)}:
    {type,path:'assets/'+id+'.json'},
});
function fixture(){
  const dependencies=new DependencyRegistry(),registry=new RendererRegistry({dependencies});
  const counts={detect:0,load:0};
  dependencies.register({id:prefix+'dependency/dom',version:'1',detect:()=>{
    counts.detect++;return true;
  }});
  dependencies.register({id:prefix+'dependency/lazy',version:'2',detect:()=>false,
    load:async()=>{counts.load++;return true;}});
  dependencies.register({id:prefix+'dependency/missing',version:'1',detect:()=>false});
  const register=(name,priority=100,options={})=>registry.register({
    id:prefix+name,version:'1',priority,profiles:[profile(options.profile??'native-questionnaire')],
    dependencies:options.dependencies??[prefix+'dependency/dom'],
    mediaTypes:['application/json'],permissions:options.permissions??[],
    acceptsRemoteLocation:options.acceptsRemoteLocation??false,
    load:async()=>{counts.load++;return {render:()=>null};},
  });
  return {dependencies,registry,counts,register};
}
test('preflight checks exact renderer, does not load JS, and uses existing profile negotiation',async()=>{
  const {registry,counts,register}=fixture();register('questionnaire');
  const plan=await negotiateP2LRNExecution({registry,representations:[rep()]});
  assert.equal(plan.report.schema,P2LRN_EXECUTION_PLAN_SCHEMA);
  assert.equal(plan.report.status,'ready');
  assert.equal(plan.report.rendererId,prefix+'questionnaire');
  assert.equal(plan.report.representationId,'primary');
  assert.equal(plan.report.conformance,'renderer-defined');
  assert.equal(counts.load,0,'Preflight must not execute lazy renderer');
  assert(counts.detect>0,'Preflight must query registered runtime dependencies');
  assert(!JSON.stringify(plan.report).includes('function'),'Report must remain serializable');
});
test('required dependency missing falls back only when caller did not require the first renderer',async()=>{
  const {registry,register}=fixture();
  register('first',100,{dependencies:[prefix+'dependency/missing']});
  register('second',90);
  const normal=await negotiateP2LRNExecution({registry,representations:[rep()]});
  assert.equal(normal.report.rendererId,prefix+'second');
  assert.equal(normal.report.diagnostics[0].code,'P2LRN_DEPENDENCY_UNAVAILABLE');
  const strict=await negotiateP2LRNExecution({registry,representations:[rep()],
    requestedRenderer:prefix+'first'});
  assert.equal(strict.report.status,'blocked');
  assert.equal(strict.candidate,null);
  assert.equal(strict.report.diagnostics[0].code,'P2LRN_DEPENDENCY_UNAVAILABLE');
});
test('permissions fail closed and alternatives only receive authority from the Host',async()=>{
  const {registry,register}=fixture();
  register('privileged',90,{permissions:['read.gradebook']});
  register('public',80);
  let result=await negotiateP2LRNExecution({registry,representations:[rep()]});
  assert.equal(result.report.rendererId,prefix+'public');
  assert.equal(result.report.diagnostics[0].code,'P2LRN_PERMISSION_DENIED');
  result=await negotiateP2LRNExecution({registry,representations:[rep()],
    requestedRenderer:prefix+'privileged'});
  assert.equal(result.report.status,'blocked');
  registry.setPermissionPolicy((permission)=>permission==='read.gradebook');
  result=await negotiateP2LRNExecution({registry,representations:[rep()]});
  assert.equal(result.report.rendererId,prefix+'privileged');
  assert.deepEqual(result.report.permissions,['read.gradebook']);
});
test('missing or version-mismatched dependencies are diagnosed without invoking their loaders',async()=>{
  const {registry,dependencies,counts,register}=fixture();
  register('versioned',90,{dependencies:[
    {id:prefix+'dependency/lazy',version:'2',optional:false},
  ]});
  let plan=await negotiateP2LRNExecution({registry,representations:[rep()]});
  assert.equal(plan.report.status,'conditional');
  assert.equal(plan.report.diagnostics[0].code,'P2LRN_DEPENDENCIES_AWAIT_LAZY_RESOLUTION');
  assert.equal(counts.load,0);
  const requested=[{id:prefix+'dependency/lazy',version:'3'}];
  const report=await dependencies.inspect(requested);
  assert.equal(report.ok,false);
  assert.equal(report.missing[0].version,'3');
  await assert.rejects(dependencies.resolve(requested),{code:'P2LRN_DEPENDENCY_VERSION_UNAVAILABLE'});
  assert.equal(counts.load,0);
});
test('offline preflight does not treat a remote-only resource as available',async()=>{
  const {registry,register}=fixture();
  register('media',90,{profile:'native-questionnaire',acceptsRemoteLocation:true});
  let result=await negotiateP2LRNExecution({registry,representations:[rep('net','native-questionnaire','remote')],
    offline:true});
  assert.equal(result.report.status,'blocked');
  assert(result.report.diagnostics.some(x=>x.code==='P2LRN_OFFLINE_REMOTE_UNAVAILABLE'));
  const local=rep('backup');
  result=await negotiateP2LRNExecution({registry,
    representations:[rep('net','native-questionnaire','remote'),local],offline:true});
  assert.equal(result.report.status,'ready');
  assert.equal(result.report.representationId,'backup');
});
test('required host capabilities are not inferred from package-authored metadata',async()=>{
  const {registry,register}=fixture();register('questionnaire');
  const args={registry,representations:[rep()],requiredCapabilities:['collaboration.room']};
  let plan=await negotiateP2LRNExecution(args);
  assert.equal(plan.report.status,'blocked');
  assert.equal(plan.report.diagnostics[0].code,'P2LRN_REQUIRED_CAPABILITY_UNAVAILABLE');
  plan=await negotiateP2LRNExecution({...args,isCapabilityAvailable:id=>id==='collaboration.room'});
  assert.equal(plan.report.status,'ready');
});
test('external format status is honest: H5P, SCORM, QTI and cmi5 are conditional, not certified',async()=>{
  const {registry,register}=fixture();
  for(const [name,expectedKind,conformance] of [
    ['h5p','h5p','runtime-validated'],['scorm','scorm','bounded'],
    ['qti','qti','subset'],['cmi5','cmi5','preview'],
  ]){
    register(name,100,{profile:name});
    const result=await negotiateP2LRNExecution({registry,representations:[rep(name,name)]});
    assert.equal(result.report.status,'conditional');
    assert.equal(result.report.kind,expectedKind);
    assert.equal(result.report.conformance,conformance);
    assert(result.report.limitations.length>0);
  }
});
test('package-wide audit reports every activity including missing resources, without executing payloads',async()=>{
  const {registry,counts,register}=fixture();register('native');
  const pkg={
    manifest:{packageId:'urn:uuid:test',integrity:{contentRoot:'sha256:'+'a'.repeat(64)}},
    entities:new Map([
      ['a1',{id:'a1',type:'activity',resource:'res'}],
      ['a2',{id:'a2',type:'activity',resource:'missing'}],
      ['res',{id:'res',type:'resource',representations:[rep()]}],
      ['course',{id:'course',type:'course'}],
    ]),
  };
  const result=await inspectP2LRNPackageExecution(pkg,{registry});
  assert.equal(result.total,2);
  assert.equal(result.ready,1);
  assert.equal(result.blocked,1);
  assert.equal(result.activities.find(x=>x.activityId==='a2').status,'blocked');
  assert.equal(counts.load,0);
});
test('unknown requested renderer fails without silently switching to another renderer',async()=>{
  const {registry,register}=fixture();register('native');
  const result=await negotiateP2LRNExecution({
    registry,representations:[rep()],requestedRenderer:prefix+'nonexistent',
  });
  assert.equal(result.report.status,'blocked');
  assert.equal(result.report.diagnostics[0].code,'P2LRN_RENDERER_SELECTION_FAILED');
});
