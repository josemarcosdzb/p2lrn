import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CapabilityBroker,
  createToolCapabilityProvider,
  HOST_CAPABILITY_EXTENSION,
  capabilityRequirements,
  mergeCapabilityRequirements,
  capabilityOperationAllowed,
  validateCapabilityGraph,
} from '../web/capability-broker.js';
import {createMemoryOfflineStore, createOfflineHostAdapter} from '../web/offline-host-adapter.js';
import {createActivityTracker} from '../web/activity-tracker.js';
import {render as renderRemoteMedia} from '../web/renderers/remote-media.js';

function capabilityEntity(requests) {
  return {extensions:{[HOST_CAPABILITY_EXTENSION]:{version:'1',requests}}};
}

test('host capability declarations are additive and broker authorization is deny-by-default', async () => {
  const course = capabilityEntity([{id:'ai.tutor',operations:['explain'],fallback:'static-explanation'}]);
  const activity = capabilityEntity([{id:'ai.tutor',required:true,operations:['hint'],context:['current_question']}]);
  const merged = mergeCapabilityRequirements(capabilityRequirements(course), capabilityRequirements(activity));
  assert.deepEqual(merged.map((item)=>({id:item.id,required:item.required,operations:[...item.operations],context:[...item.context]})), [
    {id:'ai.tutor',required:true,operations:['explain','hint'],context:['current_question']},
  ]);

  const provider = {id:'ai.tutor',operations:['explain','hint'],invoke:(operation,input)=>({operation,input})};
  const denied = new CapabilityBroker({providers:[provider]});
  const status = await denied.negotiate(merged,{entityId:'urn:test:activity'});
  assert.equal(status[0].available,true);
  await assert.rejects(()=>denied.invoke('ai.tutor','hint',{question:'q1'}), (error)=>error?.code==='P2LRN_CAPABILITY_DENIED');

  const allowed = new CapabilityBroker({providers:[provider],authorize:({capabilityId,operation})=>capabilityId==='ai.tutor'&&operation==='hint'});
  assert.deepEqual(await allowed.invoke('ai.tutor','hint',{question:'q1'}),{operation:'hint',input:{question:'q1'}});
  await assert.rejects(()=>allowed.invoke('ai.tutor','explain',{}), (error)=>error?.code==='P2LRN_CAPABILITY_DENIED');
});

test('offline Host Adapter keeps local state, coalesces snapshots and replays ordered events after reconnect', async () => {
  const store=createMemoryOfflineStore();
  let connected=false;
  const calls=[];
  const remote={
    version:'1',
    async loadState(){return null;},
    async saveState(state,context){calls.push(['state',state,context]);},
    async reportScore(score,context){calls.push(['score',score,context]);},
    async emitEvent(event,context){calls.push(['event',event,context]);},
    async resolveResourceUrl(){return null;},
  };
  const adapter=createOfflineHostAdapter({remote,store,online:()=>connected});
  const context={contentRoot:'sha256:'+'1'.repeat(64),entityId:'urn:test:a'};
  await adapter.saveState({page:1},context);
  await adapter.saveState({page:2},context);
  await adapter.emitEvent({type:'p2lrn:answer',payload:{n:1}},context);
  await adapter.emitEvent({type:'p2lrn:answer',payload:{n:2}},context);
  await adapter.reportScore({normalized:.5},context);
  assert.deepEqual(await adapter.loadState(context),{page:2});
  const pending=await adapter.pending();
  assert.equal(pending.filter((item)=>item.type==='state').length,1);
  assert.deepEqual(pending.filter((item)=>item.type==='event').map((item)=>item.value.payload.n),[1,2]);
  assert.equal(calls.length,0);

  connected=true;
  const synced=await adapter.sync();
  assert.equal(synced.acked,4);
  assert.equal(synced.pending,0);
  assert.deepEqual(calls.filter((item)=>item[0]==='event').map((item)=>item[1].payload.n),[1,2]);
  assert.deepEqual(calls.find((item)=>item[0]==='state')?.[1],{page:2});
  await adapter.clearLocal();
  assert.equal((await adapter.pending()).length,0);
  assert.equal(await adapter.loadState(context),null);
});

test('offline Host Adapter does not discard unacknowledged work when remote replay fails', async () => {
  let connected=false;
  let attempts=0;
  const adapter=createOfflineHostAdapter({
    store:createMemoryOfflineStore(),
    online:()=>connected,
    remote:{version:'1',async emitEvent(){attempts+=1;throw new Error('offline again');}},
  });
  await adapter.emitEvent({type:'p2lrn:progress',payload:{value:.25}},{entityId:'urn:test:x'});
  connected=true;
  const result=await adapter.sync();
  assert.equal(attempts,1);
  assert.equal(result.acked,0);
  assert.equal(result.pending,1);
});

test('activity tracker excludes hidden and idle time and never captures key contents', () => {
  class FakeDocument extends EventTarget {
    visibilityState='visible';
    focused=true;
    hasFocus(){return this.focused;}
  }
  const target=new FakeDocument();
  let clock=0;
  let timerCallback=null;
  const events=[];
  const tracker=createActivityTracker({
    target,
    idleAfterMs:1000,
    now:()=>clock,
    setTimer:(callback)=>{timerCallback=callback;return 1;},
    clearTimer:()=>{timerCallback=null;},
    onEvent:(type,payload)=>events.push([type,payload]),
  });
  clock=200;
  target.visibilityState='hidden';
  target.dispatchEvent(new Event('visibilitychange'));
  clock=700;
  assert.equal(tracker.snapshot().totalActiveMs,200);
  target.visibilityState='visible';
  target.dispatchEvent(new Event('visibilitychange'));
  clock=1200;
  timerCallback();
  assert.equal(tracker.snapshot().idle,true);
  const before=tracker.snapshot().totalActiveMs;
  clock=1500;
  const keyEvent=new Event('keydown');
  target.dispatchEvent(keyEvent);
  assert.equal(tracker.snapshot().idle,false);
  clock=1700;
  const final=tracker.stop();
  assert.equal(final.totalActiveMs,before+200);
  assert.equal(events.some(([type])=>type==='p2lrn:attention'),true);
  assert.equal(events.at(-1)[0],'p2lrn:active-time');
  assert.equal(JSON.stringify(events).includes('key'),false);
});

test('remote media renderer only asks the trusted resolver for digest-pinned resources', async () => {
  const originalDocument=globalThis.document;
  const created=[];
  globalThis.document={createElement(tag){const node={tagName:tag.toUpperCase(),className:'',src:'',controls:false,preload:'',referrerPolicy:'',alt:'',removeAttribute(name){if(name==='src')this.src='';},load(){}};created.push(node);return node;}};
  const appended=[];
  const container={append(node){appended.push(node);},replaceChildren(){appended.length=0;}};
  const digest='sha256:'+'a'.repeat(64);
  let request=null;
  try {
    await renderRemoteMedia({container,representation:{mediaType:'image/png',location:{type:'remote',href:'https://content.example/object',expectedDigest:digest}},resolveResourceUrl:async(value)=>{request=value;return{url:'https://host.example/verified/object',verified:true};}});
    assert.equal(request.kind,'remote');
    assert.equal(request.expectedDigest,digest);
    assert.equal(request.href,'https://content.example/object');
    assert.equal(appended[0].src,'https://host.example/verified/object');
    await assert.rejects(()=>renderRemoteMedia({container,representation:{mediaType:'image/png',location:{type:'remote',href:'https://content.example/unpinned'}},resolveResourceUrl:async()=>({url:'https://host.example/no'})}), (error)=>error?.code==='P2LRN_REMOTE_RESOURCE_UNVERIFIED');
  } finally {
    globalThis.document=originalDocument;
  }
});

test('capability operations must be explicitly declared by the package', () => {
  const requests=mergeCapabilityRequirements(
    capabilityRequirements(capabilityEntity([{id:'ai.tutor',operations:['hint']}]))
  );
  assert.equal(capabilityOperationAllowed(requests,'ai.tutor','hint'),true);
  assert.equal(capabilityOperationAllowed(requests,'ai.tutor','answer_question'),false);
  assert.equal(capabilityOperationAllowed(requests,'data.query','run'),false);
});

test('offline Host Adapter never lets new online writes overtake pending offline work', async () => {
  let connected=false;
  const calls=[];
  const adapter=createOfflineHostAdapter({
    store:createMemoryOfflineStore(),
    online:()=>connected,
    remote:{
      version:'1',
      async emitEvent(event){calls.push(['event',event.type]);},
      async reportScore(score){calls.push(['score',score.normalized]);},
    },
  });
  await adapter.emitEvent({type:'offline-first'});
  connected=true;
  await adapter.reportScore({normalized:.75});
  assert.deepEqual(calls,[]);
  assert.deepEqual((await adapter.pending()).map((item)=>item.type),['event','score']);
  const synced=await adapter.sync();
  assert.equal(synced.acked,2);
  assert.deepEqual(calls,[['event','offline-first'],['score',.75]]);
});

test('activity tracker only resets idle from the configured interaction surface', () => {
  class FakeDocument extends EventTarget { visibilityState='visible'; focused=true; hasFocus(){return this.focused;} }
  const lifecycle=new FakeDocument();
  const interaction=new EventTarget();
  let clock=0;let timerCallback=null;
  const tracker=createActivityTracker({
    target:lifecycle, interactionTarget:interaction, idleAfterMs:100, now:()=>clock,
    setTimer:(callback)=>{timerCallback=callback;return 1;}, clearTimer:()=>{timerCallback=null;},
  });
  clock=100;timerCallback();assert.equal(tracker.snapshot().idle,true);
  lifecycle.dispatchEvent(new Event('keydown'));
  assert.equal(tracker.snapshot().idle,true);
  interaction.dispatchEvent(new Event('keydown'));
  assert.equal(tracker.snapshot().idle,false);
  tracker.stop();
});

test('capability declarations are validated before rendering and cannot hide on ignored graph locations', () => {
  const valid={entities:[
    {id:'urn:test:course',type:'course',extensions:{[HOST_CAPABILITY_EXTENSION]:{version:'1',requests:[{id:'ai.tutor',operations:['hint']}]}}},
    {id:'urn:test:activity',type:'activity',extensions:{[HOST_CAPABILITY_EXTENSION]:{version:'1',requests:[{id:'collaboration.room',required:false,operations:['join']}]}}},
    {id:'urn:test:resource',type:'resource',representations:[]},
  ],relations:[]};
  assert.equal(validateCapabilityGraph(valid),true);
  assert.throws(()=>validateCapabilityGraph({entities:[{id:'urn:test:unit',type:'unit',extensions:{[HOST_CAPABILITY_EXTENSION]:{version:'1',requests:[]}}}],relations:[]}),/only valid on course, activity or resource/i);
  assert.throws(()=>validateCapabilityGraph({entities:[{id:'urn:test:resource',type:'resource',representations:[{id:'urn:test:rep',extensions:{[HOST_CAPABILITY_EXTENSION]:{version:'1',requests:[]}}}]}],relations:[]}),/not valid on resource representations/i);
  assert.throws(()=>validateCapabilityGraph({entities:[],relations:[{source:'a',target:'b',extensions:{[HOST_CAPABILITY_EXTENSION]:{version:'1',requests:[]}}}]}),/not valid on graph relations/i);
  assert.throws(()=>validateCapabilityGraph({entities:[{id:'urn:test:course',type:'course',extensions:{[HOST_CAPABILITY_EXTENSION]:{version:'2',requests:[]}}}],relations:[]}),/Unsupported P2LRN host capability extension version/);
});

test('offline Host Adapter serializes concurrent writes in call order', async () => {
  const calls=[];
  const adapter=createOfflineHostAdapter({
    store:createMemoryOfflineStore(),
    online:()=>true,
    remote:{
      version:'1',
      async emitEvent(event){if(event.type==='first')await new Promise((resolve)=>setTimeout(resolve,15));calls.push(event.type);},
    },
  });
  await Promise.all([
    adapter.emitEvent({type:'first'}),
    adapter.emitEvent({type:'second'}),
    adapter.emitEvent({type:'third'}),
  ]);
  assert.deepEqual(calls,['first','second','third']);
});

test('tool capability provider maps semantic operations to host tools without exposing transport', async () => {
  const calls=[];
  const provider=createToolCapabilityProvider({
    id:'ai.tutor',
    tools:{hint:'tutor.hint',explain:'tutor.explain'},
    async callTool(tool,input,context,mapping){calls.push({tool,input,context,mapping});return{tool,ok:true};},
  });
  const broker=new CapabilityBroker({providers:[provider],authorize:()=>true});
  const result=await broker.invoke('ai.tutor','hint',{question:'q1'},{entityId:'urn:test:q'});
  assert.deepEqual(result,{tool:'tutor.hint',ok:true});
  assert.equal(calls[0].tool,'tutor.hint');
  assert.deepEqual(calls[0].mapping,{capabilityId:'ai.tutor',operation:'hint'});
  await assert.rejects(()=>broker.invoke('ai.tutor','answer_question',{}),(error)=>error?.code==='P2LRN_CAPABILITY_UNAVAILABLE');
});

test('host capability declarations reject transport addresses and bounded-list abuse', () => {
  assert.throws(
    ()=>capabilityRequirements(capabilityEntity([{id:'https://private.example/mcp',operations:['hint']}])),
    /semantic identifier/i,
  );
  assert.throws(
    ()=>capabilityRequirements(capabilityEntity([{id:'ai.tutor',operations:['https://private.example/tool']}])),
    /semantic identifier/i,
  );
  assert.throws(
    ()=>capabilityRequirements(capabilityEntity(Array.from({length:129},(_,index)=>({id:`capability.${index}`,operations:['run']})))),
    /too many requests/i,
  );
});

test('offline delivery keeps a stable id across ambiguous failure and replay', async () => {
  let first=true;
  const seen=[];
  const adapter=createOfflineHostAdapter({
    store:createMemoryOfflineStore(),
    online:()=>true,
    remote:{
      version:'1',
      async emitEvent(event,context){
        seen.push({event,context});
        if(first){first=false;throw new Error('response lost after commit');}
      },
    },
  });
  await adapter.emitEvent({type:'p2lrn:test'},{entityId:'urn:test:delivery'});
  const pending=await adapter.pending();
  assert.equal(pending.length,1);
  assert.equal(seen.length,1);
  assert.equal(seen[0].context.offlineDeliveryId,pending[0].id);
  assert.equal(typeof seen[0].context.offlineQueuedAt,'string');
  const synced=await adapter.sync();
  assert.equal(synced.acked,1);
  assert.equal(seen.length,2);
  assert.equal(seen[1].context.offlineDeliveryId,seen[0].context.offlineDeliveryId);
  assert.equal(seen[1].context.offlineQueuedAt,seen[0].context.offlineQueuedAt);
});

test('activity tracker can use a window-like focus target without treating unrelated host interaction as course activity', () => {
  class FakeDocument extends EventTarget { visibilityState='visible'; focused=true; hasFocus(){return this.focused;} }
  const lifecycle=new FakeDocument();
  const focusTarget=new EventTarget();
  const interaction=new EventTarget();
  let clock=0,timer=null;
  const tracker=createActivityTracker({
    target:lifecycle,
    focusTarget,
    interactionTarget:interaction,
    idleAfterMs:100,
    now:()=>clock,
    setTimer:(callback)=>{timer=callback;return 1;},
    clearTimer:()=>{timer=null;},
  });
  clock=20;focusTarget.dispatchEvent(new Event('blur'));
  assert.equal(tracker.snapshot().focused,false);
  clock=40;focusTarget.dispatchEvent(new Event('focus'));
  assert.equal(tracker.snapshot().focused,true);
  clock=100;timer();
  assert.equal(tracker.snapshot().idle,true);
  lifecycle.dispatchEvent(new Event('keydown'));
  assert.equal(tracker.snapshot().idle,true);
  interaction.dispatchEvent(new Event('pointerdown'));
  assert.equal(tracker.snapshot().idle,false);
  tracker.stop();
});
