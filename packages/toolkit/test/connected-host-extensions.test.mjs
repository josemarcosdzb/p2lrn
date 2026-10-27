
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  createMcpCapabilityProvider,
  projectCapabilityContext,
} from '../web/capability-broker.js';
import {
  createOfflineHostAdapter,
  createOfflineSyncController,
} from '../web/offline-host-adapter.js';
import {
  createLearningEvent,
  createLearningEventStream,
  learningEventCategory,
} from '../web/learning-events.js';
import {
  createMemoryResourceLibrary,
  createResourceLibraryCapabilityProvider,
  createResourceLibraryResolver,
  verifyResourceBytes,
} from '../web/resource-library.js';
import {
  CAPABILITY_ACTION_COMPONENT,
  COMPONENT_RUNTIME_CONTRACT_VERSION,
  createDefaultComponentRegistry,
} from '../web/component-registry.js';
import {createP2LRNStudioDocument} from '../web/studio/new-document.js';

test('capability context projection releases only explicitly requested keys', async () => {
  const request={id:'ai.tutor',operations:['hint'],context:['activity.objectives','current_question']};
  const projected=projectCapabilityContext(request,{
    'activity.objectives':['understand fractions'],
    current_question:{id:'q1'},
    learner_email:'private@example.invalid',
  });
  assert.deepEqual(projected,{
    'activity.objectives':['understand fractions'],
    current_question:{id:'q1'},
  });
  assert.equal(Object.isFrozen(projected),true);
  const calls=[];
  const provider=createMcpCapabilityProvider({
    id:'ai.tutor',
    tools:{hint:'tutor.hint'},
    callTool:async(tool,input,context,meta)=>{calls.push({tool,input,context,meta});return{text:'ok'};},
  });
  const result=await provider.invoke('hint',{question:'q1'},{capabilityContext:projected});
  assert.equal(result.text,'ok');
  assert.equal(calls[0].tool,'tutor.hint');
  assert.equal(calls[0].meta.capabilityId,'ai.tutor');
});

test('capability action accepts semantic context and bounded provider restrictions', async () => {
  const registry=createDefaultComponentRegistry();
  const instance={
    component:{
      id:CAPABILITY_ACTION_COMPONENT,
      componentVersion:'1',
      runtimeContractVersion:COMPONENT_RUNTIME_CONTRACT_VERSION,
      dataVersion:'1',
    },
    data:{
      capability:'ai.tutor',
      operation:'hint',
      instruction:'Give a concise hint.',
      context:['activity.objectives','current_question'],
      restrictions:{revealAnswer:false,allowExternalKnowledge:false,maxOutputChars:1200},
      required:false,
    },
  };
  const prepared=await registry.prepare(instance);
  assert.equal(prepared.dataVersion,'1');
  await assert.rejects(
    registry.prepare({...instance,data:{...instance.data,restrictions:{...instance.data.restrictions,maxOutputChars:50001}}}),
    /data is invalid/i,
  );
});

test('offline adapter resolves digest-pinned local resources before remote host', async () => {
  let localCalls=0,remoteCalls=0;
  const local={async resolve(){localCalls+=1;return{url:'blob:local-resource',verified:true,seekable:true};}};
  const remote={
    version:'1',
    async resolveResourceUrl(){remoteCalls+=1;return{url:'https://remote.invalid/resource',verified:true};},
  };
  const adapter=createOfflineHostAdapter({remote,resourceResolver:local,online:()=>true});
  const result=await adapter.resolveResourceUrl({expectedDigest:'sha256:'+'a'.repeat(64)});
  assert.equal(result.url,'blob:local-resource');
  assert.equal(localCalls,1);
  assert.equal(remoteCalls,0);
});

test('offline sync controller exposes explicit sync without scheduled tasks', async () => {
  const target=new EventTarget();
  const adapter={
    async pending(){return[];},
    async sync(){return{attempted:0,acked:0,pending:0,online:true};},
  };
  const controller=createOfflineSyncController({adapter,target,autoStart:false,baseDelayMs:100,maxDelayMs:200});
  const result=await controller.syncNow();
  assert.deepEqual(result,{attempted:0,acked:0,pending:0,online:true});
  assert.equal(controller.snapshot().attempt,0);
  controller.stop();
  assert.equal(controller.snapshot().stopped,true);
});

test('learning event projection follows the current semantic runtime vocabulary', () => {
  const timestamp=new Date().toISOString();
  assert.equal(learningEventCategory('p2lrn:attempt',{phase:'started'}),'assessment');
  assert.equal(learningEventCategory('p2lrn:interaction',{action:'media-play'}),'media');
  assert.equal(learningEventCategory('p2lrn:interaction',{action:'collaboration-send'}),'collaboration');
  assert.equal(learningEventCategory('p2lrn:interaction',{action:'resource-open'}),'resource');
  assert.equal(learningEventCategory('p2lrn:interaction',{action:'answer-change'}),'assessment');
  const stream=createLearningEventStream({sessionId:'session-1',attemptId:'attempt-1'});
  const first=stream.push({type:'p2lrn:attempt',timestamp,context:{entityId:'a'},payload:{phase:'started'}});
  const second=stream.push({type:'p2lrn:interaction',timestamp,context:{entityId:'a'},payload:{action:'media-play'}});
  assert.equal(first.sequence,1);
  assert.equal(first.category,'assessment');
  assert.equal(second.sequence,2);
  assert.equal(second.category,'media');
  const single=createLearningEvent({type:'p2lrn:interaction',timestamp,context:{},payload:{action:'resource-open'}});
  assert.equal(single.category,'resource');
});

test('resource library verifies bytes, deduplicates by digest and exposes metadata-only search', async () => {
  const bytes=new TextEncoder().encode('P2LRN shared resource');
  const digest='sha256:'+createHash('sha256').update(bytes).digest('hex');
  const verified=await verifyResourceBytes(bytes,digest);
  assert.equal(verified.digest,digest);
  const store=createMemoryResourceLibrary();
  await store.put({digest,bytes,mediaType:'text/plain',href:'https://content.example/resource.txt'});
  await store.put({digest,bytes,mediaType:'text/plain',href:'https://content.example/resource.txt'});
  assert.equal((await store.list()).length,1);
  const provider=createResourceLibraryCapabilityProvider({store});
  const search=await provider.invoke('search',{query:'resource.txt'});
  assert.equal(search.items.length,1);
  assert.equal('bytes' in search.items[0],false);
  let fetched=0;
  const resolver=createResourceLibraryResolver({
    store,
    networkFetch:async()=>{fetched+=1;throw new Error('network should not be used');},
    createObjectUrl:()=> 'blob:verified-resource',
    revokeObjectUrl:()=>{},
  });
  const resolved=await resolver.resolve({href:'https://content.example/resource.txt',expectedDigest:digest,mediaType:'text/plain'});
  assert.equal(resolved.url,'blob:verified-resource');
  assert.equal(resolved.verified,true);
  assert.equal(fetched,0);
  resolver.destroy();
});

test('Studio can author a digest-pinned shared resource and materialize an embedded fallback', async () => {
  const doc=createP2LRNStudioDocument({title:'Shared resource course',language:'en'});
  const digest='sha256:'+'b'.repeat(64);
  const activity=doc.addSharedResource(doc.rootId,{
    title:'Shared image',
    href:'https://content.example/image.png',
    digest,
    mediaType:'image/png',
  });
  const resource=doc.entity(activity.resource);
  assert.equal(resource.representations[0].location.expectedDigest,digest);
  const fallback=doc.materializeSharedResource(activity.id,{
    bytes:new Uint8Array([1,2,3,4]),
    filename:'image.png',
    mediaType:'image/png',
  });
  assert.equal(fallback.location.type,'embedded');
  assert.equal(fallback.role,'fallback');
  assert.equal(resource.representations.length,2);
});
