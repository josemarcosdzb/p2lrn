import test from 'node:test';
import assert from 'node:assert/strict';
import {CapabilityBroker} from '../web/capability-broker.js';
import {createMemoryCollaborationHub,COLLABORATION_OPERATIONS} from '../web/collaboration-provider.js';
import {createP2LRNStudioDocument} from '../web/studio/new-document.js';
import {exportP2LRNPackage} from '../web/studio/package-export.js';
import {openP2LRNPackageBytes} from '../web/p2lrn-player.js';

const toArrayBuffer=(bytes)=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);

test('memory collaboration hub implements exactly the five portable room operations',async()=>{
  const hub=createMemoryCollaborationHub();
  const context={contentRoot:'sha256:'+'a'.repeat(64),entityId:'urn:test:poll'};
  const a=new CapabilityBroker({providers:[hub.provider({participantId:'learner-a'})],authorize:()=>true});
  const b=new CapabilityBroker({providers:[hub.provider({participantId:'learner-b'})],authorize:()=>true});
  assert.deepEqual([...a.list()[0].operations],COLLABORATION_OPERATIONS);
  const joinA=await a.invoke('collaboration.room','join',{room:'main'},context);
  const joinB=await b.invoke('collaboration.room','join',{room:'main'},context);
  assert.equal(joinB.presence,2);
  await a.invoke('collaboration.room','send',{sessionId:joinA.sessionId,type:'poll.vote',payload:{choiceId:'a'}},context);
  const heard=await b.invoke('collaboration.room','listen',{sessionId:joinB.sessionId,cursor:0},context);
  assert.equal(heard.events.length,1);assert.equal(heard.events[0].participantId,'learner-a');assert.equal(heard.events[0].payload.choiceId,'a');
  const snap=await b.invoke('collaboration.room','snapshot',{sessionId:joinB.sessionId},context);
  assert.equal(snap.events.length,1);assert.equal(snap.presence,2);
  await a.invoke('collaboration.room','leave',{sessionId:joinA.sessionId},context);
  assert.equal((await b.invoke('collaboration.room','snapshot',{sessionId:joinB.sessionId},context)).presence,1);
});

test('collaboration session is scoped to the package activity context',async()=>{
  const hub=createMemoryCollaborationHub();
  const broker=new CapabilityBroker({providers:[hub.provider({participantId:'learner'})],authorize:()=>true});
  const one={contentRoot:'sha256:'+'1'.repeat(64),entityId:'urn:test:one'};
  const two={contentRoot:'sha256:'+'1'.repeat(64),entityId:'urn:test:two'};
  const joined=await broker.invoke('collaboration.room','join',{room:'main'},one);
  await assert.rejects(()=>broker.invoke('collaboration.room','snapshot',{sessionId:joined.sessionId},two),(error)=>error?.code==='P2LRN_COLLABORATION_SCOPE_MISMATCH');
});

test('Studio round-trips poll board and peer-review without transport credentials',async()=>{
  const doc=createP2LRNStudioDocument({title:'Curso colaborativo',language:'es'});
  const activities=[
    doc.addCollaborationActivity(doc.rootId,{mode:'poll'}),
    doc.addCollaborationActivity(doc.rootId,{mode:'board'}),
    doc.addCollaborationActivity(doc.rootId,{mode:'peer-review'}),
  ];
  for(const activity of activities){
    const caps=doc.hostCapabilitiesForEntity(activity.id);
    assert.equal(caps[0].id,'collaboration.room');
    assert.deepEqual(caps[0].operations,['join','send','listen','snapshot','leave']);
    assert.equal(caps[0].fallback,'individual');
  }
  const exported=await exportP2LRNPackage(doc);
  const reopened=await openP2LRNPackageBytes(toArrayBuffer(exported.bytes));
  for(const activity of activities)assert.ok(reopened.entities.get(activity.id));
  const graph=JSON.stringify(reopened.graph);
  assert.equal(/wss?:\/\//i.test(graph),false);
  assert.equal(/redis:\/\//i.test(graph),false);
});

test('Studio accepts digest-pinned shared remote resources and rejects malformed digests',()=>{
  const doc=createP2LRNStudioDocument({title:'Recursos compartidos',language:'es'});
  const digest='sha256:'+'a'.repeat(64);
  const activity=doc.addRemoteResource(doc.rootId,{title:'Video compartido',url:'https://content.example/video.mp4',mediaType:'video/mp4',expectedDigest:digest});
  const resource=doc.entity(activity.resource);
  assert.equal(resource.representations[0].location.expectedDigest,digest);
  assert.throws(()=>doc.addRemoteResource(doc.rootId,{url:'https://content.example/bad',expectedDigest:'sha256:bad'}),/expectedDigest/);
});
