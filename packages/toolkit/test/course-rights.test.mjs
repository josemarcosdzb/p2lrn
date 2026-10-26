import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {COURSE_RIGHTS_EXTENSION,COURSE_RIGHTS_SCHEMA,validateCourseRights,applyCourseRights} from '../dist/core/course-rights.js';
import {P2LRNAuthoringWorkspace} from '../dist/authoring/index.js';
import {P2LRNReader} from '../dist/reader/index.js';
import {openP2LRNPackageBytes} from '../web/p2lrn-player.js';
import {createP2LRNStudioDocument} from '../web/studio/new-document.js';
import {P2LRNStudioDocument} from '../web/studio/authoring-document.js';
import {exportP2LRNPackage} from '../web/studio/package-export.js';
import {COURSE_RIGHTS_EXTENSION as WEB_EXTENSION,getCourseRights,normalizeCourseRights} from '../web/course-rights.js';

const toBuffer=bytes=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const date=/^\d{4}-\d{2}-\d{2}$/;
const fixture=resolve('../../examples/canonical/minimal-course.p2lrn');
const rights={author:'María López',createdAt:'2025-11-18',license:'CC BY 4.0',copyrightHolder:'María López'};
const nonRights=['generatedBy','ai','createdWith','publisher','institution','creator','tool'];

test('portable authorship schema exposes exactly the requested four fields',()=>{
  assert.equal(COURSE_RIGHTS_EXTENSION,WEB_EXTENSION);
  assert.deepEqual(Object.keys(COURSE_RIGHTS_SCHEMA.properties).sort(),
    ['author','createdAt','license','copyrightHolder'].sort());
  assert.deepEqual(normalizeCourseRights(rights),rights);
  assert.deepEqual(validateCourseRights(rights),rights);
  assert.throws(()=>validateCourseRights({author:'Autor',createdAt:'2025-02-30'}),/real calendar date/);
  assert.throws(()=>normalizeCourseRights({author:'Autor',createdAt:'2025-02-30'}),/fecha real/);
  assert.throws(()=>normalizeCourseRights({author:'Autor',generator:'other'}),/desconocido/);
  assert.throws(()=>validateCourseRights({author:'Autor',generator:'other'}),/unsupported property/);
  for(const field of nonRights)assert.equal(field in rights,false);
});

test('Studio creates course with creation date and exports all four edited rights without guessing an author',async()=>{
  const doc=createP2LRNStudioDocument({title:'Autoría visible',language:'es'});
  assert.match(doc.getCourseRights().createdAt,date);
  assert.equal(doc.getCourseRights().author,undefined);
  const before=(await exportP2LRNPackage(doc)).manifest.integrity.contentRoot;
  doc.setCourseRights(rights);
  const exported=await exportP2LRNPackage(doc);
  assert.notEqual(exported.manifest.integrity.contentRoot,before,'Rights change affects package integrity');
  const pkg=await openP2LRNPackageBytes(toBuffer(exported.bytes));
  assert.deepEqual(getCourseRights(pkg.entities.get(doc.rootId)),rights);
  assert.deepEqual(Object.keys(pkg.entities.get(doc.rootId).extensions[COURSE_RIGHTS_EXTENSION]).sort(),
    Object.keys(rights).sort());
  const reopened=new P2LRNStudioDocument(pkg,{sourceName:'course.p2lrn'});
  assert.deepEqual(reopened.getCourseRights(),rights);
  reopened.setCourseRights({license:null});
  const changed=await exportP2LRNPackage(reopened);
  assert.deepEqual(getCourseRights((await openP2LRNPackageBytes(toBuffer(changed.bytes))).entities.get(doc.rootId)),
    {author:rights.author,createdAt:rights.createdAt,copyrightHolder:rights.copyrightHolder});
  // Editing an imported legacy course must not add an invented original creation date.
  const legacy=await openP2LRNPackageBytes(toBuffer(new Uint8Array(readFileSync(fixture))));
  const legacyStudio=new P2LRNStudioDocument(legacy,{sourceName:'original.p2lrn'});
  assert.equal(legacyStudio.getCourseRights().createdAt,undefined);
  legacyStudio.setCourseRights({author:'Autor anterior'});
  assert.deepEqual(legacyStudio.getCourseRights(),{author:'Autor anterior'});
});

test('Creator authored rights survive file build, Reader, edit and complete round trip',()=>{
  const directory=mkdtempSync(join(tmpdir(),'p2lrn-rights-'));
  try{
    const base=join(directory,'draft'),first=join(directory,'course.p2lrn'),second=join(directory,'revised.p2lrn');
    const workspace=P2LRNAuthoringWorkspace.create(base,{title:'Curso',language:'es'});
    assert.match(workspace.project.course.extensions[COURSE_RIGHTS_EXTENSION].createdAt,date);
    workspace.setCourseRights(rights);
    assert.deepEqual(workspace.project.course.extensions[COURSE_RIGHTS_EXTENSION],rights);
    workspace.addUrl({key:'lesson',title:'Lección',url:'https://example.org/lesson'});
    workspace.build(first,{strictProfiles:true});
    const reader=new P2LRNReader(first);
    const course=reader.entity(reader.primaryEntrypoint().id);
    assert.deepEqual(course.extensions[COURSE_RIGHTS_EXTENSION],rights);
    const imported=P2LRNAuthoringWorkspace.open(first,join(directory,'imported'));
    assert.deepEqual(imported.project.course.extensions[COURSE_RIGHTS_EXTENSION],rights);
    imported.setCourseMetadata({title:'Curso revisado'});
    imported.build(second,{strictProfiles:true});
    const reopened=new P2LRNReader(second);
    assert.deepEqual(reopened.entity(reopened.primaryEntrypoint().id).extensions[COURSE_RIGHTS_EXTENSION],rights);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('Creator rejects invalid dates and unknown rights; rights can be removed without touching other extensions',()=>{
  const course={extensions:{other:{kept:true},[COURSE_RIGHTS_EXTENSION]:{author:'Autor'}}};
  applyCourseRights(course,{author:'Nuevo',license:'Uso educativo'});
  assert.deepEqual(course.extensions.other,{kept:true});
  assert.equal(course.extensions[COURSE_RIGHTS_EXTENSION].license,'Uso educativo');
  assert.throws(()=>applyCourseRights(course,{createdAt:'2026-02-29'}),/real calendar date/);
  assert.throws(()=>applyCourseRights(course,{generator:'X'}),/Unsupported course rights field/);
  assert.deepEqual(course.extensions[COURSE_RIGHTS_EXTENSION],{author:'Nuevo',license:'Uso educativo'});
  applyCourseRights(course,{author:null,license:null});
  assert.equal(course.extensions[COURSE_RIGHTS_EXTENSION],undefined);
  assert.deepEqual(course.extensions.other,{kept:true});
});

test('native Studio and web Studio both expose all four fields and Reader/Player display them',()=>{
  const root=resolve('../..');
  const included=[
    'packages/studio/src/p2lrn-studio.js',
    'deploy/netlify/site/studio/studio.js',
  ];
  for(const file of included){
    const source=readFileSync(join(root,file),'utf8');
    assert.match(source,/Autoría y derechos/);
    for(const key of ['author','createdAt','license','copyrightHolder'])
      assert.match(source,new RegExp(key));
  }
  const player=readFileSync(join(root,'packages/toolkit/web/p2lrn-player.js'),'utf8');
  const viewer=readFileSync(join(root,'packages/toolkit/web/app.js'),'utf8');
  assert.match(player,/renderCourseRights/);
  assert.match(viewer,/renderCourseRights/);
  const site=readFileSync(join(root,'deploy/netlify/build-site.mjs'),'utf8');
  assert.match(site,/course-rights.js/);
});
