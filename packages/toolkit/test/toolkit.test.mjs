import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {validatePackageFile} from '../dist/core/validator.js';
import {buildProject} from '../dist/creator/builder.js';
import {CapabilitySet,P2LRNReader,P2LRNReadingSystem,ReaderServer} from '../dist/reader/index.js';
import {createDelta,applyDelta} from '../dist/core/delta.js';
import {generateKeypair,signPackage,verifyPackageSignature} from '../dist/core/detached-signature.js';
import {writeZip} from '../dist/core/zip.js';
import {convertExternalPackage} from '../dist/creator/external.js';
import {extractPreservedSource} from '../dist/tools/extract-source.js';
import {openP2LRNPackageBytes} from '../web/p2lrn-player.js';
const exampleCandidates=[resolve('../examples'),resolve('../../examples/legacy-alpha15')];
const examples=exampleCandidates.find((p)=>existsSync(join(p,'creator-course.p2rln'))&&existsSync(join(p,'creator-project')))??exampleCandidates[0];
const expected=[
'advanced-interoperability.p2rln','aulap2p-reader/document-reader-course.p2rln','creator-course.p2rln','external/cmi5-catapult-pre-post.p2rln','external/h5p-crossword.p2rln','external/qti3-minimal.p2rln','external/scorm12-real.p2rln','minimal-course.p2rln','native-component-authoring-course.p2rln','native-component-course.p2rln','native-component-timeline-course.p2rln','native-composite-course.p2rln','native-questionnaire-course.p2rln','native-questionnaire-games-course.p2rln','static-seekable-media-course.p2rln','web-bundle-course.p2rln','web-course.p2rln'];

test('all Alpha15 reference examples validate strictly including profile payloads',()=>{for(const rel of expected){const r=validatePackageFile(join(examples,rel),{strictProfiles:true,validateProfilePayloads:true});assert.equal(r.summary.packageId.startsWith('urn:uuid:'),true,rel);assert.match(r.summary.contentRoot,/^sha256:[0-9a-f]{64}$/);}});

test('Creator emits deterministic canonical P2LRN packages while legacy packages remain readable',()=>{const dir=mkdtempSync(join(tmpdir(),'p2lrn-node-'));try{const out1=join(dir,'course-a.p2lrn'),out2=join(dir,'course-b.p2lrn'),a=buildProject(join(examples,'creator-project'),out1,true),b=buildProject(join(examples,'creator-project'),out2,true);assert.equal(a.packageId,b.packageId);assert.equal(a.contentRoot,b.contentRoot);assert.equal(a.packageId,'urn:uuid:2960712b-0b80-5ae7-bf82-1f2a9ad9445d');assert.equal(a.contentRoot,'sha256:218a641b48963cfb6932ea40e5262467e6a272a8a677d035608ecf958fadec17');const canonical=new P2LRNReader(out1);assert.equal(canonical.package.manifest.format,'P2LRN');assert.ok(canonical.package.manifest.profiles.every((p)=>p.id.startsWith('https://p2lrn.org/')));const legacy=new P2LRNReader(join(examples,'creator-course.p2rln'));assert.equal(legacy.package.manifest.format,'P2RLN');}finally{rmSync(dir,{recursive:true,force:true});}});

test('Reader exposes deterministic structural plans',()=>{const r=new P2LRNReader(join(examples,'external/scorm12-real.p2rln'));const caps=CapabilitySet.permissiveReader(r.package.manifest.profiles.map(x=>x.id));const plan=r.courseReadPlan(caps,undefined,'read');assert.ok(plan.summary.total>0);assert.equal(plan.summary.total,plan.activities.length);assert.equal(r.tree().type,'course');});

test('Reading System serves authenticated API and byte ranges',async()=>{const system=new P2LRNReadingSystem(join(examples,'creator-course.p2rln')),server=new ReaderServer(system);try{const base=await server.start(),t=new URL(base).searchParams.get('t');let res=await fetch(new URL(`/api/summary?t=${t}`,base));assert.equal(res.status,200);assert.equal((await res.json()).packageId,system.reader.package.manifest.packageId);res=await fetch(new URL(`/package.p2lrn?t=${t}`,base),{headers:{Range:'bytes=0-31'}});assert.equal(res.status,206);assert.equal((await res.arrayBuffer()).byteLength,32);res=await fetch(new URL(`/package.p2rln?t=${t}`,base),{headers:{Range:'bytes=0-15'}});assert.equal(res.status,206);assert.equal((await res.arrayBuffer()).byteLength,16);}finally{await server.stop();}});

test('delta reconstructs target contentRoot',()=>{const dir=mkdtempSync(join(tmpdir(),'p2lrn-delta-'));try{const base=join(examples,'minimal-course.p2rln'),target=join(examples,'creator-course.p2rln'),delta=join(dir,'x.delta'),out=join(dir,'out.p2rln');createDelta(base,target,delta);const result=applyDelta(base,delta,out);assert.equal(result.contentRoot,new P2LRNReader(target).package.manifest.integrity.contentRoot);}finally{rmSync(dir,{recursive:true,force:true});}});

test('Ed25519 detached signatures verify with explicit trust',()=>{const dir=mkdtempSync(join(tmpdir(),'p2lrn-sign-'));try{const priv=join(dir,'key.pem'),pub=join(dir,'key.pub.pem'),sig=join(dir,'course.sig'),pkg=join(examples,'creator-course.p2rln');generateKeypair(priv,pub);signPackage(pkg,priv,sig,'content');const v=verifyPackageSignature(pkg,sig,{trustedPublicKeys:[pub],requireTrusted:true});assert.equal(v.valid,true);assert.equal(v.trusted,true);}finally{rmSync(dir,{recursive:true,force:true});}});


function writeExternalFixture(path, entries) {
  const encoded=entries.map(([name,text])=>({path:name,data:new TextEncoder().encode(text),mediaType:name.endsWith('.xml')?'application/xml':'application/json',method:8}));
  writeFileSync(path,writeZip(encoded));
}

test('deep SCORM validation rejects a missing relative launch target',()=>{const dir=mkdtempSync(join(tmpdir(),'p2lrn-scorm-neg-'));try{const src=join(dir,'broken-scorm.zip'),out=join(dir,'broken-scorm.p2lrn');writeExternalFixture(src,[['imsmanifest.xml',`<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="m1" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="o1"><organization identifier="o1"><title>Broken SCORM</title><item identifier="i1" identifierref="r1"><title>Launch</title></item></organization></organizations>
  <resources><resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="missing.html"/></resources>
</manifest>`]]);assert.throws(()=>convertExternalPackage(src,out),/relative launch target missing/);}finally{rmSync(dir,{recursive:true,force:true});}});

test('deep H5P validation rejects a package without content/content.json',()=>{const dir=mkdtempSync(join(tmpdir(),'p2lrn-h5p-neg-'));try{const src=join(dir,'broken.h5p'),out=join(dir,'broken.p2lrn');writeExternalFixture(src,[['h5p.json',JSON.stringify({title:'Broken H5P',mainLibrary:'H5P.Example',language:'en',embedTypes:['iframe']})]]);assert.throws(()=>convertExternalPackage(src,out),/requires h5p\.json and content\/content\.json/);}finally{rmSync(dir,{recursive:true,force:true});}});

test('deep QTI validation rejects a missing declared item',()=>{const dir=mkdtempSync(join(tmpdir(),'p2lrn-qti-neg-'));try{const src=join(dir,'broken-qti.zip'),out=join(dir,'broken-qti.p2lrn');writeExternalFixture(src,[['imsmanifest.xml',`<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/qti/qtiv3p0/imscp_v1p1" identifier="qti-broken">
  <metadata><schema>QTI Package</schema><schemaversion>3.0.0</schemaversion></metadata>
  <organizations/><resources><resource identifier="item-1" type="imsqti_item_xmlv3p0" href="items/missing.xml"/></resources>
</manifest>`]]);assert.throws(()=>convertExternalPackage(src,out),/relative launch target missing/);}finally{rmSync(dir,{recursive:true,force:true});}});

test('deep cmi5 validation does not dereference a remote AU',()=>{const dir=mkdtempSync(join(tmpdir(),'p2lrn-cmi5-remote-'));try{const src=join(dir,'remote-cmi5.zip'),out=join(dir,'remote-cmi5.p2lrn');writeExternalFixture(src,[['cmi5.xml',`<?xml version="1.0" encoding="UTF-8"?>
<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">
  <course id="https://example.invalid/course"><title><langstring lang="en">Remote cmi5</langstring></title></course>
  <au id="https://example.invalid/course/au1" moveOn="Completed"><title><langstring lang="en">Remote AU</langstring></title><url>https://example.invalid/launch</url></au>
</courseStructure>`]]);const report=convertExternalPackage(src,out);assert.equal(report.detectedFormat,'cmi5');assert.equal(report.validation.summary.formatVersion,'0.4.0');}finally{rmSync(dir,{recursive:true,force:true});}});


test('Common Cartridge is detected, preserved and projects local web content',()=>{const dir=mkdtempSync(join(tmpdir(),'p2lrn-cc-'));try{
  const src=join(dir,'course.imscc'),out=join(dir,'course.p2lrn');
  writeExternalFixture(src,[
    ['imsmanifest.xml',`<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1" identifier="cc1">
  <metadata><schema>IMS Common Cartridge</schema><schemaversion>1.3.0</schemaversion></metadata>
  <organizations default="org1"><organization identifier="org1"><title>CC Course</title><item identifier="i1" identifierref="r1"><title>Page</title></item></organization></organizations>
  <resources><resource identifier="r1" type="webcontent" href="index.html"><file href="index.html"/></resource></resources>
</manifest>`],
    ['index.html','<!doctype html><html><body>Common Cartridge OK</body></html>']
  ]);
  const report=convertExternalPackage(src,out);const reader=new P2LRNReader(out);
  assert.equal(report.detectedFormat,'common-cartridge');
  assert.ok(reader.package.manifest.profiles.some((p)=>p.id==='https://p2lrn.org/profile/common-cartridge'));
  const reps=reader.package.graph.entities.filter((e)=>e.type==='resource').flatMap((e)=>e.representations??[]);
  assert.ok(reps.some((rep)=>rep.location?.type==='package-member'&&rep.location.member==='index.html'));
}finally{rmSync(dir,{recursive:true,force:true});}});

test('generic IMS Content Package fallback is detected without mislabeling SCORM or Common Cartridge',()=>{const dir=mkdtempSync(join(tmpdir(),'p2lrn-ims-cp-'));try{
  const src=join(dir,'ims.zip'),out=join(dir,'ims.p2lrn');
  writeExternalFixture(src,[
    ['imsmanifest.xml',`<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" identifier="ims1">
  <metadata><schema>IMS Content</schema><schemaversion>1.1.4</schemaversion></metadata>
  <organizations default="org1"><organization identifier="org1"><title>IMS Course</title><item identifier="i1" identifierref="r1"><title>Lesson</title></item></organization></organizations>
  <resources><resource identifier="r1" type="webcontent" href="lesson.html"><file href="lesson.html"/></resource></resources>
</manifest>`],
    ['lesson.html','<!doctype html><html><body>IMS Content Package OK</body></html>']
  ]);
  const report=convertExternalPackage(src,out);const reader=new P2LRNReader(out);
  assert.equal(report.detectedFormat,'ims-content-package');
  assert.ok(reader.package.manifest.profiles.some((p)=>p.id==='https://p2lrn.org/profile/ims-content-package'));
  const reps=reader.package.graph.entities.filter((e)=>e.type==='resource').flatMap((e)=>e.representations??[]);
  assert.ok(reps.some((rep)=>rep.location?.type==='package-member'&&rep.location.member==='lesson.html'));
}finally{rmSync(dir,{recursive:true,force:true});}});

test('legacy Tin Can package is detected and preserves a local launch target',()=>{const dir=mkdtempSync(join(tmpdir(),'p2lrn-tincan-'));try{
  const src=join(dir,'tincan.zip'),out=join(dir,'tincan.p2lrn');
  writeExternalFixture(src,[
    ['tincan.xml',`<?xml version="1.0" encoding="UTF-8"?>
<tincan><activities><activity id="https://example.invalid/tincan/activity"><name>Tin Can Demo</name><launch>index.html</launch></activity></activities></tincan>`],
    ['index.html','<!doctype html><html><body>Tin Can launch OK</body></html>']
  ]);
  const report=convertExternalPackage(src,out);const reader=new P2LRNReader(out);
  assert.equal(report.detectedFormat,'tincan-package');
  assert.ok(reader.package.manifest.profiles.some((p)=>p.id==='https://p2lrn.org/profile/tincan-package'));
  const rep=reader.package.graph.entities.find((e)=>e.type==='resource')?.representations?.[0];
  assert.equal(rep?.extensions?.['https://p2lrn.org/profile/tincan-package']?.launch,'index.html');
}finally{rmSync(dir,{recursive:true,force:true});}});


function asArrayBuffer(buffer) { return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength); }

test('browser SDK opens both legacy P2RLN and canonical P2LRN packages after integrity verification',async()=>{const dir=mkdtempSync(join(tmpdir(),'p2lrn-web-'));try{const canonicalPath=join(dir,'canonical.p2lrn');buildProject(join(examples,'creator-project'),canonicalPath,true);const legacy=await openP2LRNPackageBytes(asArrayBuffer(readFileSync(join(examples,'creator-course.p2rln'))));const canonical=await openP2LRNPackageBytes(asArrayBuffer(readFileSync(canonicalPath)));assert.equal(legacy.manifest.format,'P2RLN');assert.equal(canonical.manifest.format,'P2LRN');assert.ok(legacy.graph.entities.some((e)=>e.activityType==='https://p2lrn.org/type/resource'));assert.ok(canonical.graph.entities.some((e)=>e.activityType==='https://p2lrn.org/type/resource'));}finally{rmSync(dir,{recursive:true,force:true});}});

test('external converter emits canonical P2LRN namespace without losing preserved source',()=>{const dir=mkdtempSync(join(tmpdir(),'p2lrn-convert-'));try{const src=join(dir,'source.zip'),out=join(dir,'converted.p2lrn');extractPreservedSource(join(examples,'external/scorm12-real.p2rln'),src);const report=convertExternalPackage(src,out);const pkg=new P2LRNReader(out);assert.equal(report.detectedFormat,'scorm');assert.equal(pkg.package.manifest.format,'P2LRN');assert.ok(pkg.package.manifest.profiles.some((p)=>p.id==='https://p2lrn.org/profile/scorm'));const recovered=join(dir,'recovered.zip');extractPreservedSource(out,recovered);assert.deepEqual(readFileSync(recovered),readFileSync(src));}finally{rmSync(dir,{recursive:true,force:true});}});

test('canonical capability schema and shipped capability document use P2LRN names',()=>{
  const capabilities=JSON.parse(readFileSync(resolve('config/capabilities.json'),'utf8'));
  assert.deepEqual(capabilities.p2lrnVersions,['0.4.0']);
  assert.equal(Object.prototype.hasOwnProperty.call(capabilities,'p2rlnVersions'),false);
  assert.equal(capabilities.product.version,'0.5.0-alpha.9');
});

test('canonical schema registry validates p2lrnVersions and rejects the historical key on the new schema',async()=>{
  const {schemaById,validateSchema}=await import('../dist/core/json-schema.js');
  const id='https://p2lrn.org/schema/capabilities/0.4.0';
  const schema=schemaById(id);
  assert.ok(schema.required.includes('p2lrnVersions'));
  assert.equal(schema.properties.p2lrnVersions.type,'array');
  const doc=JSON.parse(readFileSync(resolve('config/capabilities.json'),'utf8'));
  assert.doesNotThrow(()=>validateSchema(id,doc,'capabilities'));
  const legacyKey={...doc,p2rlnVersions:doc.p2lrnVersions}; delete legacyKey.p2lrnVersions;
  assert.throws(()=>validateSchema(id,legacyKey,'capabilities'),/p2lrnVersions|unsupported property/);
});

test('runtime events emit P2LRN and normalize legacy P2RLN event names',async()=>{
  const {createRuntimeEvent}=await import('../web/runtime-events.js');
  const now=Date.UTC(2026,8,12,20,0,0);
  const canonical=createRuntimeEvent('p2lrn:ready',{ok:true},{courseId:'c'},{clock:()=>now});
  const legacy=createRuntimeEvent('p2rln:ready',{ok:true},{courseId:'c'},{clock:()=>now});
  assert.equal(canonical.type,'p2lrn:ready');
  assert.equal(legacy.type,'p2lrn:ready');
  assert.equal(legacy.schema,'https://p2lrn.org/schema/runtime-event/1');
});

test('static bridge generates P2LRN routes and still parses Alpha15 P2RLN routes',async()=>{
  const {VIRTUAL_MARKER,LEGACY_VIRTUAL_MARKER,extractVirtualTarget}=await import('../web/p2lrn-sw.js');
  const route='a'.repeat(48);
  assert.equal(VIRTUAL_MARKER,'/__p2lrn__/v1/');
  assert.equal(LEGACY_VIRTUAL_MARKER,'/__p2rln__/v1/');
  assert.deepEqual(extractVirtualTarget(`https://example.invalid${VIRTUAL_MARKER}${route}/video/file.mp4`),{routeId:route,logical:'video/file.mp4'});
  assert.deepEqual(extractVirtualTarget(`https://example.invalid${LEGACY_VIRTUAL_MARKER}${route}/video/file.mp4`),{routeId:route,logical:'video/file.mp4'});
});

test('H5P binary session encoder supports canonical and Alpha15 envelopes',async()=>{
  const {encodeH5PSession}=await import('../web/h5p-package.js');
  const data=new TextEncoder().encode('{}');
  const nested={archive:{entries:new Map([['h5p.json',{uncompressedSize:data.byteLength}]])},names:()=>['h5p.json'],read:async()=>data};
  const inspection={names:['h5p.json'],dependencyMode:'external',mainLibrary:'H5P.Test',missing:[]};
  for(const [protocol,mime] of [['p2lrn-h5p-session/1','application/vnd.p2lrn.h5p-session'],['p2rln-h5p-session/1','application/vnd.p2rln.h5p-session']]){
    const blob=await encodeH5PSession(nested,inspection,{protocol});
    assert.equal(blob.type,mime);
    const bytes=new Uint8Array(await blob.arrayBuffer());
    const len=new DataView(bytes.buffer,bytes.byteOffset,8).getUint32(4,false);
    const manifest=JSON.parse(new TextDecoder().decode(bytes.subarray(8,8+len)));
    assert.equal(manifest.protocol,protocol);
  }
});

test('generic repack migrates legacy native packages to canonical P2LRN without losing semantics',async()=>{
  const {repackPackage}=await import('../dist/tools/repack.js');
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-repack-canonical-'));
  try{
    for(const rel of ['native-questionnaire-course.p2rln','native-component-course.p2rln','native-composite-course.p2rln']){
      const out=join(dir,rel.replace(/\.p2rln$/,'.p2lrn'));
      const result=repackPackage(join(examples,rel),out,false,true);
      assert.equal(result.canonicalized,true);
      const pkg=new P2LRNReader(out);
      assert.equal(pkg.package.manifest.format,'P2LRN');
      assert.ok(pkg.package.manifest.profiles.every((p)=>p.id.startsWith('https://p2lrn.org/')));
      validatePackageFile(out,{strictProfiles:true,validateProfilePayloads:true});
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('canonical repack preserves nested external package bytes exactly',async()=>{
  const {repackPackage}=await import('../dist/tools/repack.js');
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-repack-source-'));
  try{
    const legacy=join(examples,'external/scorm12-real.p2rln'),out=join(dir,'scorm.p2lrn');
    const beforeSource=join(dir,'before.zip'),afterSource=join(dir,'after.zip');
    extractPreservedSource(legacy,beforeSource);
    repackPackage(legacy,out,false,true);
    extractPreservedSource(out,afterSource);
    assert.deepEqual(readFileSync(beforeSource),readFileSync(afterSource));
    assert.equal(new P2LRNReader(out).package.manifest.format,'P2LRN');
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('canonical repack preserves ZIP_STORED resources required by range integrity',async()=>{
  const {repackPackage}=await import('../dist/tools/repack.js');
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-repack-range-'));
  try{
    const out=join(dir,'seekable.p2lrn');
    repackPackage(join(examples,'static-seekable-media-course.p2rln'),out,false,true);
    const validated=validatePackageFile(out,{strictProfiles:true,validateProfilePayloads:true});
    assert.equal(validated.manifest.format,'P2LRN');
    const stored=[...validated.archive.entries.values()].filter((e)=>e.name.startsWith('assets/sha256/')&&e.method===0);
    assert.ok(stored.length>0);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
