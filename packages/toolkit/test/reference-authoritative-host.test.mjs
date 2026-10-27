import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {createJsonFileAuthoritativeHostStore,createMemoryAuthoritativeHostStore,createReferenceAuthoritativeHost} from '../dist/host/reference-authoritative-host.js';

const baseContext={contentRoot:'sha256:'+'a'.repeat(64),entityId:'urn:test:activity'};

test('reference authoritative host partitions outside package and deduplicates offline deliveries',async()=>{
  let gradeCalls=0;
  const host=createReferenceAuthoritativeHost({
    partitionKey:()=> 'learner-42|attempt-7',
    store:createMemoryAuthoritativeHostStore(),
    grade:async({reportedScore})=>{gradeCalls+=1;return{...reportedScore,authoritative:true,verifiedBy:'reference-grader'};},
  });
  await host.adapter.saveState({page:2},{...baseContext,offlineDeliveryId:'state-1'});
  await host.adapter.saveState({page:99},{...baseContext,offlineDeliveryId:'state-1'});
  assert.deepEqual(await host.adapter.loadState(baseContext),{page:2});

  const event={schema:'https://p2lrn.org/schema/runtime-event/1',version:'1',type:'p2lrn:complete',timestamp:'2026-10-24T20:00:00.000Z',context:baseContext,payload:{}};
  await host.adapter.emitEvent(event,{...baseContext,offlineDeliveryId:'event-1'});
  await host.adapter.emitEvent({...event,payload:{duplicate:true}},{...baseContext,offlineDeliveryId:'event-1'});
  assert.equal((await host.events(baseContext)).length,1);

  const official=await host.adapter.reportScore({raw:8,max:10,normalized:.8},{...baseContext,offlineDeliveryId:'score-1'});
  const duplicate=await host.adapter.reportScore({raw:1,max:10,normalized:.1},{...baseContext,offlineDeliveryId:'score-1'});
  assert.equal(official.authoritative,true);
  assert.equal(duplicate.normalized,.8);
  assert.equal(gradeCalls,1);
});

test('reference authoritative host refuses to invent authoritative grades without a grader',async()=>{
  const host=createReferenceAuthoritativeHost({partitionKey:()=> 'learner|attempt'});
  await assert.rejects(()=>host.adapter.reportScore({normalized:1},baseContext),(error)=>error?.code==='P2LRN_AUTHORITATIVE_GRADER_REQUIRED');
});

test('reference file store persists state and idempotency across host restarts',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p2lrn-host-'));
  const file=join(dir,'authoritative.json');
  try{
    const first=createReferenceAuthoritativeHost({
      partitionKey:()=> 'learner-file|attempt-1',
      store:createJsonFileAuthoritativeHostStore(file),
      grade:async({reportedScore})=>({...reportedScore,authoritative:true}),
    });
    await first.adapter.saveState({step:3},{...baseContext,offlineDeliveryId:'persist-state'});
    await first.adapter.emitEvent({type:'p2lrn:progress',timestamp:'2026-10-24T20:00:00.000Z'},{...baseContext,offlineDeliveryId:'persist-event'});

    const second=createReferenceAuthoritativeHost({
      partitionKey:()=> 'learner-file|attempt-1',
      store:createJsonFileAuthoritativeHostStore(file),
      grade:async({reportedScore})=>({...reportedScore,authoritative:true}),
    });
    assert.deepEqual(await second.adapter.loadState(baseContext),{step:3});
    await second.adapter.emitEvent({type:'p2lrn:progress',timestamp:'2026-10-24T20:01:00.000Z'},{...baseContext,offlineDeliveryId:'persist-event'});
    assert.equal((await second.events(baseContext)).length,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('reference host exposes explicit server-wins state conflict policy',async()=>{
  const host=createReferenceAuthoritativeHost({partitionKey:()=> 'learner|attempt',stateConflictPolicy:'server-wins'});
  await host.adapter.saveState({value:'server'},baseContext);
  await host.adapter.saveState({value:'device'},baseContext);
  assert.deepEqual(await host.adapter.loadState(baseContext),{value:'server'});
});
