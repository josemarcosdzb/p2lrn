import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {
  OFFLINE_ASSIGNMENT_SCHEMA,
  OFFLINE_RESULT_SCHEMA,
  normalizeOfflineAssignmentPolicy,
  inspectOfflineAssignmentCompatibility,
  exportOfflineAssignmentBundle,
  buildWindowsOfflineExecutable,
  parseOfflineAssignmentResult,
  signOfflineAssignment,
  verifyOfflineAssignmentSignature,
  OFFLINE_TEACHER_RECEIPT_SCHEMA,
} from '../web/studio/offline-assignment.js';
import {HOST_CAPABILITY_EXTENSION} from '../web/capability-broker.js';
import {createP2LRNStudioDocument} from '../web/studio/new-document.js';

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
const truncatedPackageExporter=async()=>({
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

test('offline exporter creates a self-playing ZIP with a real Studio course, local Player and Windows launcher',async()=>{
  const document=createP2LRNStudioDocument({title:'Prueba doble clic'});
  const result=await exportOfflineAssignmentBundle(document,{
    runtimeBaseUrl:'https://runtime.example/player/current/dist/',
    fetchImpl:runtimeFetch(),
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
  assert.match(launcher,/Forbidden Host/,'loopback server must reject forged Host headers');
  assert.match(launcher,/\$file\.StartsWith\(\$webPrefix,/,'file access must be confined to the web directory, not just a shared text prefix');
  const embeddedCourse=entries.get('www/course.p2lrn');
  assert.ok(embeddedCourse.byteLength>500,'embedded course must be a complete P2LRN ZIP, not a marker fixture');
  const embeddedEntries=storedZipEntries(embeddedCourse);
  assert.equal(embeddedEntries.has('META-INF/manifest.json'),true,'embedded course manifest missing');
  assert.equal(embeddedEntries.has('content/graph.json'),true,'embedded course graph missing');
  const eocd=embeddedCourse.slice(-22);
  assert.deepEqual([...eocd.slice(0,4)],[0x50,0x4b,0x05,0x06],'embedded course must contain ZIP EOCD');

  const single=decoder.decode(result.windowsLauncher.bytes);
  assert.match(single,/^@echo off\r?\n/i);
  assert.match(single,/__P2LRN_PAYLOAD__/);
  assert.match(single,/SHA256/i);
  assert.match(single,/Expand-Archive/);
  assert.match(single,/runtime\\serve\.ps1/);
  const marker='\r\n__P2LRN_PAYLOAD__\r\n';
  const markerIndex=single.indexOf(marker);
  assert.notEqual(markerIndex,-1,'single-file launcher must contain a standalone payload marker line');
  const payload=single.slice(markerIndex+marker.length).replace(/\s+/g,'');
  const decoded=new Uint8Array(Buffer.from(payload,'base64'));
  assert.deepEqual([...decoded],[...result.bytes],'single-file launcher must embed the exact portable ZIP');
});

test('offline exporter rejects a truncated P2LRN course before creating a launcher',async()=>{
  await assert.rejects(
    ()=>exportOfflineAssignmentBundle(fakeDocument([{id:'urn:test:course',type:'course',children:[]}]),{
      runtimeBaseUrl:'https://runtime.example/player/current/dist/',
      fetchImpl:runtimeFetch(),
      packageExporter:truncatedPackageExporter,
    }),
    (error)=>error?.code==='P2LRN_OFFLINE_INVALID_COURSE_ZIP'&&/end-of-central-directory|demasiado pequeño/i.test(String(error.message)),
  );
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

test('teacher-signed offline export keeps signing secrets out of learner files and issues a separate receipt',async()=>{
  const document=createP2LRNStudioDocument({title:'Evaluación firmada'});
  const bundle=await exportOfflineAssignmentBundle(document,{
    signAssignment:true,runtimeBaseUrl:'https://runtime.example/player/current/dist/',fetchImpl:runtimeFetch(),
  });
  assert(bundle.assignment.signature);
  assert.equal(bundle.assignment.signature.algorithm,'Ed25519');
  assert.equal(await verifyOfflineAssignmentSignature(bundle.assignment),true);
  assert.match(bundle.assignment.signature.keyFingerprint,/^sha256:[a-f0-9]{64}$/);
  assert.match(bundle.teacherReceipt.filename,/\.p2lrn-assignment\.json$/);
  const receipt=JSON.parse(decoder.decode(bundle.teacherReceipt.bytes));
  assert.equal(receipt.schema,OFFLINE_TEACHER_RECEIPT_SCHEMA);
  assert.deepEqual(receipt.assignment,bundle.assignment);
  const entries=storedZipEntries(bundle.bytes);
  assert.equal(entries.has(bundle.teacherReceipt.filename),false,'Teacher receipt must not be packaged for student');
  const embedded=JSON.parse(decoder.decode(entries.get('www/assignment.json')));
  assert.equal(await verifyOfflineAssignmentSignature(embedded),true);
  assert(!JSON.stringify(embedded).toLowerCase().includes('privatekey'));
  assert(!JSON.stringify(receipt).toLowerCase().includes('privatekey'));
  const js=decoder.decode(entries.get('www/app.js'));
  assert.match(js,/async function verifyAssignment/);
  assert.match(js,/if\(!\(await verifyAssignment\(\)\)\)throw/);
  assert.match(js,/assignmentProof:assignment\.signature\?assignment:null/);
  const normal=await exportOfflineAssignmentBundle(document,{
    runtimeBaseUrl:'https://runtime.example/player/current/dist/',fetchImpl:runtimeFetch(),
  });
  assert.equal(normal.teacherReceipt,null);
  assert.equal(normal.assignment.signature,undefined);
});

test('result review authenticates the teacher assignment only against the saved receipt',async()=>{
  const course=await exportOfflineAssignmentBundle(
    createP2LRNStudioDocument({title:'Control firmado'}),{
      signAssignment:true,runtimeBaseUrl:'https://runtime.example/player/current/dist/',fetchImpl:runtimeFetch(),
    });
  const a=course.assignment,receipt=decoder.decode(course.teacherReceipt.bytes);
  const base={
    schema:OFFLINE_RESULT_SCHEMA,version:'1',
    assignment:{
      assignmentId:a.assignmentId,packageId:a.packageId,contentRoot:a.contentRoot,
      participantToken:a.participant.assignmentToken,participantLabel:'Alumno 1',policy:a.policy,
    },
    assignmentProof:a,
    runtime:{playerVersion:a.runtime.playerVersion,runtimeDigest:a.runtime.runtimeDigest},
    attempt:{id:'test',number:1,elapsedSeconds:45},
    summary:{latestScore:{normalized:.75}},
    submission:{states:[],answers:[],scores:[]},
    analytics:{events:[],activeTimeMs:10000},
    audit:{anomalies:[],evidenceRoot:await shaText(a.assignmentId+'|'+a.contentRoot)},
  };
  const withDigest=async value=>({...value,integrity:{algorithm:'sha256',payloadDigest:await digest(value)}});
  const signedResult=await withDigest(base);
  const verified=await parseOfflineAssignmentResult(signedResult,{
    expectedContentRoot:a.contentRoot,trustedReceipt:receipt,
  });
  assert.equal(verified.integrityValid,true);
  assert.equal(verified.signatureValid,true);
  assert.equal(verified.proofMatchesResult,true);
  assert.equal(verified.receiptMatches,true);
  assert.equal(verified.assignmentAuthenticated,true);
  assert.equal(verified.evidenceValid,true);
  const withoutReceipt=await parseOfflineAssignmentResult(signedResult,{expectedContentRoot:a.contentRoot});
  assert.equal(withoutReceipt.signatureValid,true);
  assert.equal(withoutReceipt.assignmentAuthenticated,null,'Untrusted student public key cannot authenticate a teacher');
  const editedAssignment=structuredClone(base);
  editedAssignment.assignmentProof.policy.maxAttempts=99;
  const changed=await parseOfflineAssignmentResult(await withDigest(editedAssignment),{trustedReceipt:receipt});
  assert.equal(changed.integrityValid,true,'A digest can be recomputed by the student');
  assert.equal(changed.signatureValid,false);
  assert.equal(changed.assignmentAuthenticated,false);
  const forgedScore=structuredClone(base);
  forgedScore.submission.scores=[{id:'fake',type:'score',value:{normalized:1}}];
  const score=await parseOfflineAssignmentResult(await withDigest(forgedScore),{trustedReceipt:receipt});
  assert.equal(score.evidenceValid,false,'Evidence root should flag an inconsistent edited submission');
  assert.equal(score.assignmentAuthenticated,true,'Assignment authenticity does not prove an honest score');
  const changedIdentity=structuredClone(base);
  changedIdentity.assignment.contentRoot='sha256:'+'d'.repeat(64);
  const mismatch=await parseOfflineAssignmentResult(await withDigest(changedIdentity),{
    expectedContentRoot:a.contentRoot,trustedReceipt:receipt,
  });
  assert.equal(mismatch.courseMatches,false);
  assert.equal(mismatch.proofMatchesResult,false);
  assert.equal(mismatch.assignmentAuthenticated,false);
  const different=await signOfflineAssignment({
    schema:OFFLINE_ASSIGNMENT_SCHEMA,version:'1',assignmentId:'urn:uuid:different',
  });
  const wrongReceipt=JSON.stringify({schema:OFFLINE_TEACHER_RECEIPT_SCHEMA,version:'1',assignment:different});
  const unexpected=await parseOfflineAssignmentResult(signedResult,{trustedReceipt:wrongReceipt});
  assert.equal(unexpected.receiptMatches,false);
  assert.equal(unexpected.assignmentAuthenticated,false);
});
async function shaText(value){
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
  return 'sha256:'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}

test('evidence root restores interleaved state, event and score records without false tampering alerts',async()=>{
  const assignmentId='urn:uuid:11111111-2222-4333-8444-555555555555';
  const contentRoot='sha256:'+'a'.repeat(64);
  const state1={type:'state',context:{entityId:'lesson'},value:{answers:{q1:'B'}}};
  const active={type:'event',value:{type:'p2lrn:active-time',payload:{totalActiveMs:12500}}};
  const score={type:'score',value:{normalized:0.75}};
  const state2={type:'state',context:{entityId:'lesson'},value:{answers:{q2:'C'}}};
  const actual=[state1,active,score,state2];
  let evidenceRoot=await shaText(assignmentId+'|'+contentRoot);
  for(const record of actual)evidenceRoot=await shaText(evidenceRoot+'|'+canonical(record));
  const result={
    schema:OFFLINE_RESULT_SCHEMA,version:'1',
    assignment:{assignmentId,contentRoot,packageId:'course'},
    submission:{
      states:[state1,state2],scores:[score],
      answers:[
        {entityId:'lesson',questionId:'q1',answer:'B'},
        {entityId:'lesson',questionId:'q2',answer:'C'},
      ],
    },
    analytics:{events:[active],activeTimeMs:12500},
    summary:{latestScore:{normalized:0.75},stateSnapshots:2,events:1,answers:2,activeTimeMs:12500},
    audit:{evidenceRoot,recordOrder:[['state',0],['event',0],['score',0],['state',1]],anomalies:[]},
  };
  const seal=async body=>({...body,integrity:{algorithm:'sha256',payloadDigest:await digest(body)}});
  const original=await parseOfflineAssignmentResult(await seal(result),{expectedContentRoot:contentRoot});
  assert.equal(original.integrityValid,true);
  assert.equal(original.evidenceValid,true,'Correct interleaving must not trigger a false corruption alert');
  assert.equal(original.summaryValid,true);

  const shuffled=structuredClone(result);
  shuffled.audit.recordOrder=[['state',0],['score',0],['event',0],['state',1]];
  const reordered=await parseOfflineAssignmentResult(await seal(shuffled));
  assert.equal(reordered.integrityValid,true);
  assert.equal(reordered.evidenceValid,false);

  const duplicate=structuredClone(result);
  duplicate.audit.recordOrder=[['state',0],['event',0],['score',0],['state',0]];
  assert.equal((await parseOfflineAssignmentResult(await seal(duplicate))).evidenceValid,false);

  const forgedSummary=structuredClone(result);
  forgedSummary.summary.latestScore={normalized:1};
  const changed=await parseOfflineAssignmentResult(await seal(forgedSummary));
  assert.equal(changed.integrityValid,true,'SHA-256 alone does not authenticate the student');
  assert.equal(changed.evidenceValid,true,'The underlying operations were not changed');
  assert.equal(changed.summaryValid,false,'A reported score must match its operations');

  const forgedAnswers=structuredClone(result);
  forgedAnswers.submission.answers[0].answer='A';
  assert.equal((await parseOfflineAssignmentResult(await seal(forgedAnswers))).summaryValid,false);
  const legacy=structuredClone(result);
  delete legacy.audit.recordOrder;
  const old=await parseOfflineAssignmentResult(await seal(legacy));
  assert.equal(old.evidenceValid,null,'Old mixed-operation results cannot recover original ordering');
  assert.equal(old.summaryValid,true,'Legacy results remain readable without a misleading rejection');

  const noOps=structuredClone(result);
  noOps.submission={states:[],scores:[],answers:[]};
  noOps.analytics={events:[],activeTimeMs:0};
  noOps.summary={latestScore:null,stateSnapshots:0,events:0,answers:0,activeTimeMs:0};
  noOps.audit={evidenceRoot:await shaText(assignmentId+'|'+contentRoot),anomalies:[]};
  const empty=await parseOfflineAssignmentResult(await seal(noOps));
  assert.equal(empty.evidenceValid,true,'Legacy empty evidence remains verifiable');
  assert.equal(empty.summaryValid,true);
});

test('self-playing app saves operation order and verifies signed assignments before enabling start',async()=>{
  const bundle=await exportOfflineAssignmentBundle(createP2LRNStudioDocument({title:'Revisión offline'}),{
    signAssignment:true,
    runtimeBaseUrl:'https://runtime.example/player/current/dist/',
    fetchImpl:runtimeFetch(),
  });
  const entries=storedZipEntries(bundle.bytes);
  const app=decoder.decode(entries.get('www/app.js'));
  assert.match(app,/const SIGNATURE_REQUIRED=true;/);
  assert.match(app,/if\(!assignment\.signature\)return !SIGNATURE_REQUIRED/);
  assert.match(app,/function recordOrder\(ops\)/);
  assert.match(app,/recordOrder:recordOrder\(ops\)/);
  assert.match(app,/evidenceRoot:await evidenceRoot\(ops\)/);
  assert.match(app,/if\(!\(await verifyAssignment\(\)\)\)throw/);
  assert.doesNotMatch(app,/fetch\(['"]https?:/);
  const standard=await exportOfflineAssignmentBundle(createP2LRNStudioDocument({title:'Actividad normal'}),{
    runtimeBaseUrl:'https://runtime.example/player/current/dist/',
    fetchImpl:runtimeFetch(),
  });
  const standardApp=decoder.decode(storedZipEntries(standard.bytes).get('www/app.js'));
  assert.match(standardApp,/const SIGNATURE_REQUIRED=false;/);
});

test('CDN HTML post-processing cannot silently corrupt exported Player runtime',async()=>{
  const original='<!doctype html><html><head><title>Runtime</title></head><body>H5P</body></html>';
  const altered=original.replace('<head>','<head><!-- Host changed this HTML -->');
  const memberPath='runtime-host/h5p.html';
  const release={
    webSdkVersion:'0.5.0-alpha.11',toolkitVersion:'0.5.0-alpha.11',
    files:[{path:memberPath,bytes:encoder.encode(original).byteLength,sha256:await shaText(original)}],
  };
  const visited=[];
  const fetcher=(rawMode)=>async url=>{
    const href=String(url);visited.push(href);
    if(href.endsWith('release.json'))return new Response(JSON.stringify(release));
    if(href.endsWith('.html.raw')){
      if(rawMode==='missing')return new Response('missing',{status:404});
      return new Response(rawMode==='corrupt'?altered:original);
    }
    if(href.endsWith('.html'))return new Response(rawMode==='missing'?original:altered);
    return new Response('missing',{status:404});
  };
  const document=createP2LRNStudioDocument({title:'Runtime fiable'});
  const good=await exportOfflineAssignmentBundle(document,{
    runtimeBaseUrl:'https://static.example/player/current/dist/',fetchImpl:fetcher('valid'),
  });
  assert.equal(decoder.decode(storedZipEntries(good.bytes).get('www/player/'+memberPath)),original);
  assert(visited.some(url=>url.endsWith('.html.raw')));
  assert(!visited.some(url=>url.endsWith('/h5p.html')),'Do not fetch transformed HTML if mirror is available');
  await assert.rejects(()=>exportOfflineAssignmentBundle(document,{
    runtimeBaseUrl:'https://static.example/player/current/dist/',fetchImpl:fetcher('corrupt'),
  }),/runtime Player cambió|Digest inválido/,'Corrupt raw bytes must be rejected rather than using altered HTML');
  const compatible=await exportOfflineAssignmentBundle(document,{
    runtimeBaseUrl:'https://static.example/player/current/dist/',fetchImpl:fetcher('missing'),
  });
  assert.equal(decoder.decode(storedZipEntries(compatible.bytes).get('www/player/'+memberPath)),original,
    'Older self-hosted runtimes remain compatible when original HTML matches the release');
});

test('native Windows EXE envelope is an x64 PE with the exact course ZIP and digest',async()=>{
  const base=new Uint8Array(4096);
  base[0]=77;base[1]=90;
  new DataView(base.buffer).setUint32(60,128,true);
  base.set([0x50,0x45,0,0,0x64,0x86],128);
  const course=await exportOfflineAssignmentBundle(createP2LRNStudioDocument({title:'EXE QA'}),{
    signAssignment:true,
    runtimeBaseUrl:'https://runtime.example/player/current/dist/',fetchImpl:runtimeFetch(),
    windowsExecutableBytes:base,
  });
  const exe=course.windowsExecutable,archive=course.bytes;
  assert(exe.filename.endsWith('.p2lrn-offline.exe'));
  assert.equal(exe.publisherSigned,false);
  assert.deepEqual(exe.bytes.slice(0,base.length),base);
  assert.deepEqual(exe.bytes.slice(base.length,base.length+archive.length),archive);
  const tail=base.length+archive.length,view=new DataView(exe.bytes.buffer);
  assert.equal(decoder.decode(exe.bytes.slice(tail,tail+12)),'P2LRN-EXE-V1');
  assert.equal(view.getBigUint64(tail+16,true),BigInt(archive.length));
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',archive));
  assert.deepEqual(exe.bytes.slice(tail+24,tail+56),hash);
  assert.equal(exe.bytes.length,base.length+archive.length+56);
  assert(course.teacherReceipt,'Native format keeps the separate teacher receipt');
});
test('invalid or mismatched native templates fail closed, not replaced by CMD',async()=>{
  const base=new Uint8Array(4096);
  base.set([0x4d,0x5a]);new DataView(base.buffer).setUint32(60,128,true);
  base.set([0x50,0x45,0,0,0x64,0x86],128);
  const archive=Uint8Array.from([80,75,3,4, ...Array(32).fill(0)]);
  await assert.rejects(()=>buildWindowsOfflineExecutable(archive,new Uint8Array(3)),/Tamaño no válido/);
  const invalid=new Uint8Array(base);
  invalid[128]=0;
  await assert.rejects(()=>buildWindowsOfflineExecutable(archive,invalid),/plantilla no es un ejecutable PE/);
  const wrongCpu=new Uint8Array(base);
  wrongCpu[132]=0x4c;wrongCpu[133]=0x01;
  await assert.rejects(()=>buildWindowsOfflineExecutable(archive,wrongCpu),/Windows x64/);
});
