import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeZip} from '../dist/core/zip.js';
import {convertExternalPackage} from '../dist/creator/external.js';
import {P2LRNReader} from '../dist/reader/index.js';

const te=new TextEncoder();

function fixture(path,entries){
  writeFileSync(path,writeZip(entries.map(([name,text])=>({
    path:name,data:typeof text==='string'?te.encode(text):text,
    mediaType:name.endsWith('.xml')?'application/xml':name.endsWith('.json')?'application/json':'application/octet-stream',
    method:8
  }))));
}
function withTemp(prefix,fn){
  const dir=mkdtempSync(join(tmpdir(),prefix));
  try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}
}
function convert(dir,name,entries){
  const src=join(dir,name),out=join(dir,name.replace(/\.[^.]+$/,'.p2lrn'));
  fixture(src,entries);
  const report=convertExternalPackage(src,out);
  return{report,reader:new P2LRNReader(out),out,src};
}
function profileIds(reader){return new Set(reader.package.manifest.profiles.map(x=>x.id));}

test('SCORM 2004 ingestion preserves hierarchy and launch metadata',()=>withTemp('p2lrn-scorm2004-',dir=>{
  const {report,reader}=convert(dir,'course.zip',[
    ['imsmanifest.xml',`<?xml version="1.0"?>
<manifest identifier="sc2004" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3">
  <metadata><schema>ADL SCORM</schema><schemaversion>2004 4th Edition</schemaversion></metadata>
  <organizations default="org1"><organization identifier="org1"><title>SCORM 2004</title>
    <item identifier="item1" identifierref="res1"><title>SCO 1</title></item>
  </organization></organizations>
  <resources><resource identifier="res1" type="webcontent" adlcp:scormType="sco" href="sco/index.html"><file href="sco/index.html"/></resource></resources>
</manifest>`],
    ['sco/index.html','<!doctype html><title>SCO</title>']
  ]);
  assert.equal(report.detectedFormat,'scorm');
  assert.ok(profileIds(reader).has('https://p2lrn.org/profile/scorm'));
  const course=reader.package.graph.entities.find(x=>x.type==='course');
  const activity=reader.package.graph.entities.find(x=>x.type==='activity');
  assert.equal(course.title.und,'SCORM 2004');
  assert.equal(activity.title.und,'SCO 1');
  const resource=reader.package.graph.entities.find(x=>x.type==='resource');
  const launch=resource.representations.find(x=>x.role==='primary');
  assert.equal(launch.location.type,'package-member');
  assert.equal(launch.location.member,'sco/index.html');
}));

test('SCORM ingestion rejects missing relative launch members',()=>withTemp('p2lrn-scorm-bad-',dir=>{
  const src=join(dir,'bad.zip'),out=join(dir,'bad.p2lrn');
  fixture(src,[['imsmanifest.xml',`<manifest identifier="m" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"><metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata><organizations/><resources><resource identifier="r" adlcp:scormtype="sco" href="missing.html"/></resources></manifest>`]]);
  assert.throws(()=>convertExternalPackage(src,out),/relative launch target missing/i);
}));

test('H5P ingestion preserves an external-library package without claiming bundled delivery',()=>withTemp('p2lrn-h5p-',dir=>{
  const {report,reader}=convert(dir,'activity.h5p',[
    ['h5p.json',JSON.stringify({title:'H5P external',language:'es',mainLibrary:'H5P.Example',embedTypes:['iframe'],preloadedDependencies:[{machineName:'H5P.Example',majorVersion:1,minorVersion:0}]})],
    ['content/content.json',JSON.stringify({text:'hola'})]
  ]);
  assert.equal(report.detectedFormat,'h5p');
  assert.equal(report.details.dependencyMode,'external');
  const resource=reader.package.graph.entities.find(x=>x.type==='resource');
  const rep=resource.representations.find(x=>x.profile==='https://p2lrn.org/profile/h5p');
  assert.equal(rep.extensions['https://p2lrn.org/profile/h5p'].dependencyMode,'external');
}));

test('H5P ingestion rejects an undeclared main library',()=>withTemp('p2lrn-h5p-bad-',dir=>{
  const src=join(dir,'bad.h5p'),out=join(dir,'bad.p2lrn');
  fixture(src,[
    ['h5p.json',JSON.stringify({title:'Bad',mainLibrary:'H5P.Missing',preloadedDependencies:[]})],
    ['content/content.json','{}']
  ]);
  assert.throws(()=>convertExternalPackage(src,out),/mainLibrary must be declared|mainLibrary.*preloadedDependencies/i);
}));

test('QTI 3 ingestion projects item resources and keeps QTI as authoritative payload',()=>withTemp('p2lrn-qti-',dir=>{
  const {report,reader}=convert(dir,'assessment.zip',[
    ['imsmanifest.xml',`<?xml version="1.0"?>
<manifest xmlns="http://www.imsglobal.org/xsd/qti/qtiv3p0/imscp_v1p1" identifier="qti3">
  <metadata><schema>QTI Package</schema><schemaversion>3.0.0</schemaversion></metadata>
  <organizations/>
  <resources><resource identifier="item-1" type="imsqti_item_xmlv3p0" href="items/item1.xml"><file href="items/item1.xml"/></resource></resources>
</manifest>`],
    ['items/item1.xml',`<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="item1" title="Uno" adaptive="false" time-dependent="false"><qti-item-body><qti-choice-interaction response-identifier="RESPONSE" max-choices="1"><qti-prompt>Pregunta</qti-prompt></qti-choice-interaction></qti-item-body></qti-assessment-item>`]
  ]);
  assert.equal(report.detectedFormat,'qti');
  assert.equal(report.details.itemCount,1);
  assert.ok(profileIds(reader).has('https://p2lrn.org/profile/qti'));
  assert.ok(reader.package.graph.entities.some(x=>x.activityType==='https://p2lrn.org/type/assessment-item'));
}));

test('QTI ingestion rejects a declared item whose member is missing',()=>withTemp('p2lrn-qti-bad-',dir=>{
  const src=join(dir,'bad.zip'),out=join(dir,'bad.p2lrn');
  fixture(src,[['imsmanifest.xml',`<manifest xmlns="http://www.imsglobal.org/xsd/qti/qtiv3p0/imscp_v1p1" identifier="q"><metadata><schema>QTI Package</schema><schemaversion>3.0.0</schemaversion></metadata><organizations/><resources><resource identifier="i" type="imsqti_item_xmlv3p0" href="items/missing.xml"/></resources></manifest>`]]);
  assert.throws(()=>convertExternalPackage(src,out),/relative launch target missing/i);
}));

test('cmi5 ingestion preserves block/AU structure, moveOn and remote AU without dereference',()=>withTemp('p2lrn-cmi5-',dir=>{
  const {report,reader}=convert(dir,'course.zip',[
    ['cmi5.xml',`<?xml version="1.0"?>
<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">
  <course id="https://example.invalid/course"><title><langstring lang="es">Curso cmi5</langstring></title></course>
  <block id="https://example.invalid/block"><title><langstring lang="es">Bloque</langstring></title>
    <au id="https://example.invalid/au" moveOn="Completed" masteryScore="0.8"><title><langstring lang="es">AU remota</langstring></title><url>https://example.invalid/launch</url></au>
  </block>
</courseStructure>`]
  ]);
  assert.equal(report.detectedFormat,'cmi5');
  assert.equal(report.details.blockCount,1);
  assert.equal(report.details.auCount,1);
  const activity=reader.package.graph.entities.find(x=>x.activityType==='https://p2lrn.org/type/cmi5-au');
  assert.equal(activity.extensions['https://p2lrn.org/profile/cmi5'].moveOn,'Completed');
  const resource=reader.package.graph.entities.find(x=>x.id===activity.resource);
  assert.ok(resource.representations.some(x=>x.location.type==='remote'&&x.location.href==='https://example.invalid/launch'));
}));

test('Common Cartridge projects organization order and validates all relative references',()=>withTemp('p2lrn-cc-',dir=>{
  const {report,reader}=convert(dir,'course.imscc',[
    ['imsmanifest.xml',`<?xml version="1.0"?>
<manifest identifier="cc" xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1">
  <metadata><schema>IMS Common Cartridge</schema><schemaversion>1.3.0</schemaversion></metadata>
  <organizations default="org"><organization identifier="org"><title>Cartridge</title>
    <item identifier="i1" identifierref="r1"><title>Primero</title></item>
    <item identifier="i2" identifierref="r2"><title>Segundo</title></item>
  </organization></organizations>
  <resources>
    <resource identifier="r1" type="webcontent" href="web/index.html"><file href="web/index.html"/></resource>
    <resource identifier="r2" type="imswl_xmlv1p3" href="links/link.xml"><file href="links/link.xml"/><dependency identifierref="r1"/></resource>
  </resources>
</manifest>`],
    ['web/index.html','<!doctype html><title>Web</title>'],
    ['links/link.xml','<webLink><title>OpenAI</title><url href="https://example.invalid/"/></webLink>']
  ]);
  assert.equal(report.detectedFormat,'common-cartridge');
  assert.ok(profileIds(reader).has('https://p2lrn.org/profile/common-cartridge'));
  const course=reader.package.graph.entities.find(x=>x.type==='course');
  const titles=course.children.map(id=>reader.package.graph.entities.find(x=>x.id===id)?.title?.und);
  assert.deepEqual(titles,['Primero','Segundo']);
}));

test('Common Cartridge rejects missing files, unknown item references and unknown dependencies',()=>withTemp('p2lrn-cc-bad-',dir=>{
  const variants=[
    ['missing-file',`<manifest xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1"><metadata><schema>IMS Common Cartridge</schema><schemaversion>1.3.0</schemaversion></metadata><organizations/><resources><resource identifier="r1" type="webcontent" href="missing.html"/></resources></manifest>`,/relative launch target missing/i],
    ['unknown-item',`<manifest xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1"><metadata><schema>IMS Common Cartridge</schema><schemaversion>1.3.0</schemaversion></metadata><organizations><organization identifier="o"><item identifier="i" identifierref="missing"/></organization></organizations><resources><resource identifier="r1" type="webcontent" href="ok.html"/></resources></manifest>`,/item references unknown resource/i],
    ['unknown-dependency',`<manifest xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1"><metadata><schema>IMS Common Cartridge</schema><schemaversion>1.3.0</schemaversion></metadata><organizations/><resources><resource identifier="r1" type="webcontent" href="ok.html"><dependency identifierref="missing"/></resource></resources></manifest>`,/depends on unknown resource/i]
  ];
  for(const [name,manifest,pattern] of variants){
    const src=join(dir,name+'.imscc'),out=join(dir,name+'.p2lrn');
    fixture(src,[['imsmanifest.xml',manifest],['ok.html','ok']]);
    assert.throws(()=>convertExternalPackage(src,out),pattern);
  }
}));
