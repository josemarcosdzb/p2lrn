import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {
  OFFLINE_ASSIGNMENT_SCHEMA,
  OFFLINE_RESULT_SCHEMA,
  normalizeOfflineAssignmentPolicy,
  inspectOfflineAssignmentCompatibility,
  exportOfflineAssignmentBundle,
  parseOfflineAssignmentResult,
} from '../web/studio/offline-assignment.js';
import {HOST_CAPABILITY_EXTENSION} from '../web/capability-broker.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;

const encoder=new TextEncoder();
const decoder=new TextDecoder();

function canonical(value){
  if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map((key)=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
async function digest(value){
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(canonical(value))));
  return 'sha256:'+Array.from(bytes,(byte)=>byte.toString(16).padStart(2,'0')).join('');
}
function storedZipEntries(bytes){
  const out=new Map();
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let offset=0;
  while(offset+4<=bytes.byteLength){
    const sig=view.getUint32(offset,true);
    if(sig!==0x04034b50)break;
    const method=view.getUint16(offset+8,true);
    const size=view.getUint32(offset+18,true);
    const nameLength=view.getUint16(offset+26,true);
    const extraLength=view.getUint16(offset+28,true);
    assert.equal(method,0,'offline bundle must use stored ZIP entries');
    const nameStart=offset+30,nameEnd=nameStart+nameLength,dataStart=nameEnd+extraLength,dataEnd=dataStart+size;
    const name=decoder.decode(bytes.slice(nameStart,nameEnd));
    out.set(name,bytes.slice(dataStart,dataEnd));
    offset=dataEnd;
  }
  return out;
}
function fakeDocument(entities=[]){
  return {
    manifest:{format:'P2LRN',formatVersion:'0.4.0'},
    graph:{entities,relations:[]},
    rootId:'urn:test:course',
    title:()=> 'Curso offline',
  };
}
const packageExporter=async()=>({
  bytes:new Uint8Array([80,75,3,4,1,2,3]),
  filename:'curso.p2lrn',
  manifest:{packageId:'urn:uuid:11111111-1111-4111-8111-111111111111',integrity:{contentRoot:'sha256:'+'1'.repeat(64)}},
  graph:{entities:[]},
});
function runtimeFetch(){
  const release={webSdkVersion:'0.5.0-alpha.11',toolkitVersion:'0.5.0-alpha.11',files:[
    {path:'p2lrn.js'},
    {path:'p2lrn.esm.js'},
    {path:'runtime-host/scorm.html'},
  ]};
  return async(url)=>{
    const href=String(url);
    if(href.endsWith('/release.json'))return new Response(JSON.stringify(release),{status:200});
    if(href.endsWith('/p2lrn.js'))return new Response('/* classic runtime */',{status:200});
    if(href.endsWith('/p2lrn.esm.js'))return new Response('export default globalThis.P2LRN;',{status:200});
    if(href.endsWith('/runtime-host/scorm.html'))return new Response('<!doctype html><title>SCORM</title>',{status:200});
    return new Response('missing',{status:404});
  };
}

test('offline assignment policy validates dates, duration and attempts',()=>{
  const policy=normalizeOfflineAssignmentPolicy({
    availableFrom:'2026-10-27T08:00:00Z',
    dueAt:'2026-10-30T20:00:00Z',
    attemptDurationSeconds:3600,
    maxAttempts:2,
    allowResume:true,
  });
  assert.equal(policy.collaboration,'disabled');
  assert.equal(policy.network,'deny-by-default');
  assert.equal(policy.attemptDurationSeconds,3600);
  assert.equal(policy.maxAttempts,2);
  assert.throws(()=>normalizeOfflineAssignmentPolicy({availableFrom:'2026-10-31T00:00:00Z',dueAt:'2026-10-30T00:00:00Z'}),/posterior/i);
  assert.throws(()=>normalizeOfflineAssignmentPolicy({attemptDurationSeconds:10}),/entero/i);
});

test('offline compatibility rejects required collaboration and remote-only resources',()=>{
  const required=fakeDocument([
    {id:'urn:test:course',type:'course',extensions:{[HOST_CAPABILITY_EXTENSION]:{version:'1',requests:[{id:'collaboration.room',required:true,operations:['join']}]} }},
  ]);
  const a=inspectOfflineAssignmentCompatibility(required);
  assert.equal(a.ok,false);
  assert.equal(a.issues[0].code,'REQUIRED_COLLABORATION');

  const remote=fakeDocument([
    {id:'urn:test:r',type:'resource',representations:[{id:'rep',mediaType:'image/png',location:{type:'remote',href:'https://example.invalid/a.png',expectedDigest:'sha256:'+'a'.repeat(64)}}]},
  ]);
  const b=inspectOfflineAssignmentCompatibility(remote);
  assert.equal(b.ok,false);
  assert.equal(b.issues[0].code,'REMOTE_ONLY_RESOURCE');

  const optional=fakeDocument([
    {id:'urn:test:course',type:'course',extensions:{[HOST_CAPABILITY_EXTENSION]:{version:'1',requests:[{id:'collaboration.room',required:false,operations:['join'],fallback:'individual'}]} }},
  ]);
  assert.equal(inspectOfflineAssignmentCompatibility(optional).ok,true);
});

test('offline exporter creates a self-playing ZIP with local Player, course and Windows launcher',async()=>{
  const result=await exportOfflineAssignmentBundle(fakeDocument([{id:'urn:test:course',type:'course',children:[]}]),{
    runtimeBaseUrl:'https://runtime.example/player/current/dist/',
    fetchImpl:runtimeFetch(),
    packageExporter,
    participantLabel:'Alumno 7',
    availableFrom:'2026-10-27T08:00:00Z',
    dueAt:'2026-10-30T20:00:00Z',
    attemptDurationSeconds:1800,
    maxAttempts:1,
  });
  assert.match(result.filename,/\.p2lrn-offline\.zip$/);
  assert.match(result.windowsLauncher.filename,/\.p2lrn-offline\.cmd$/);
  assert.match(result.windowsLauncher.payloadDigest,/^sha256:[0-9a-f]{64}$/);
  assert.equal(result.assignment.schema,OFFLINE_ASSIGNMENT_SCHEMA);
  assert.equal(result.assignment.policy.collaboration,'disabled');
  assert.equal(result.assignment.participant.label,'Alumno 7');

  const entries=storedZipEntries(result.bytes);
  for(const path of [
    'Abrir P2LRN.cmd','LEEME.txt','runtime/serve.ps1','www/index.html','www/style.css','www/app.js',
    'www/assignment.json','www/course.p2lrn','www/player/release.json','www/player/p2lrn.js','www/player/p2lrn.esm.js','www/player/runtime-host/scorm.html',
  ])assert.equal(entries.has(path),true,'missing '+path);

  const app=decoder.decode(entries.get('www/app.js'));
  assert.match(app,/createOfflineHostAdapter/);
  assert.match(app,/online:\(\)=>false/);
  assert.doesNotMatch(app,/createHttpCollaborationProvider|createMemoryCollaborationHub/);
  const launcher=decoder.decode(entries.get('runtime/serve.ps1'));
  assert.match(launcher,/IPAddress\]::Loopback/);
  assert.match(launcher,/127\.0\.0\.1/);
  assert.deepEqual([...entries.get('www/course.p2lrn')],[80,75,3,4,1,2,3]);

  const single=decoder.decode(result.windowsLauncher.bytes);
  assert.match(single,/^@echo off\r?\n/i);
  assert.match(single,/__P2LRN_PAYLOAD__/);
  assert.match(single,/SHA256/i);
  assert.match(single,/Expand-Archive/);
  assert.match(single,/runtime\\\\serve\.ps1/);
  const marker='__P2LRN_PAYLOAD__';
  const payload=single.slice(single.indexOf(marker)+marker.length).replace(/\s+/g,'');
  const decoded=new Uint8Array(Buffer.from(payload,'base64'));
  assert.deepEqual([...decoded],[...result.bytes],'single-file launcher must embed the exact portable ZIP');
});

test('offline result verifier checks digest and original course identity',async()=>{
  const body={
    schema:OFFLINE_RESULT_SCHEMA,
    version:'1',
    assignment:{assignmentId:'urn:uuid:a',contentRoot:'sha256:'+'2'.repeat(64),participantLabel:'Ana'},
    runtime:{playerVersion:'0.5.0-alpha.11'},
    attempt:{number:1,elapsedSeconds:125},
    summary:{latestScore:{normalized:.8}},
    submission:{answers:[{entityId:'a',questionId:'q1',answer:{choiceIds:['x']}}],scores:[]},
    analytics:{events:[{type:'event'}],activeTimeMs:60000},
    audit:{anomalies:[]},
  };
  const result={...body,integrity:{algorithm:'sha256',payloadDigest:await digest(body)}};
  const verified=await parseOfflineAssignmentResult(JSON.stringify(result),{expectedContentRoot:body.assignment.contentRoot});
  assert.equal(verified.integrityValid,true);
  assert.equal(verified.courseMatches,true);
  assert.equal(verified.summary.answers.length,1);
  assert.equal(verified.summary.activeTimeMs,60000);

  const tampered=structuredClone(result);tampered.attempt.elapsedSeconds=999;
  const invalid=await parseOfflineAssignmentResult(tampered,{expectedContentRoot:body.assignment.contentRoot});
  assert.equal(invalid.integrityValid,false);
  const wrongCourse=await parseOfflineAssignmentResult(result,{expectedContentRoot:'sha256:'+'3'.repeat(64)});
  assert.equal(wrongCourse.courseMatches,false);
});
