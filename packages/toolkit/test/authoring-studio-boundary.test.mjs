import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {P2LRNAuthoringWorkspace} from '../dist/authoring/index.js';
import {P2LRNReader} from '../dist/reader/index.js';

const canonicalExamples=resolve('../../examples/canonical');

function extractProfilePayload(packageName,profile,target){
  const reader=new P2LRNReader(join(canonicalExamples,packageName));
  for(const entity of reader.entities.values()){
    if(entity.type!=='resource')continue;
    const representation=(entity.representations??[]).find((rep)=>rep.profile===profile);
    if(!representation)continue;
    const location=representation.location;
    assert.equal(location.type,'embedded');
    writeFileSync(target,reader.package.archive.read(location.path));
    return;
  }
  assert.fail(`profile payload not found: ${profile}`);
}

test('Studio authoring boundary performs typed edits without mutating Creator internals',()=>{
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-studio-api-'));
  try{
    const root=join(dir,'workspace'),out=join(dir,'course.p2lrn');
    const workspace=P2LRNAuthoringWorkspace.create(root,{title:'Curso Studio',language:'es'});
    workspace.setCourseMetadata({title:'Curso Studio tipado',description:'Editado por API pública',incrementRevision:true});
    workspace.addUnit({key:'unidad',title:'Unidad 1'});
    const url=workspace.addUrl({url:'https://example.com/recurso',key:'enlace',title:'Enlace',parent:'unidad'});
    assert.equal(url.activityKey,'act-enlace');
    workspace.setEntityText(url.activityKey,{title:'Enlace editado'});

    const file=join(dir,'nota.txt');writeFileSync(file,'contenido\n');
    workspace.addFile({source:file,key:'nota',title:'Nota',parent:'unidad'});

    const web=join(dir,'web');mkdirSync(web,{recursive:true});writeFileSync(join(web,'index.html'),'<!doctype html><title>web</title>');
    workspace.addWebContent({sourceDirectory:web,key:'web',title:'Web',parent:'unidad'});

    const questionnaire=join(dir,'questionnaire.json');
    extractProfilePayload('native-questionnaire-course.p2lrn','https://p2lrn.org/profile/native-questionnaire',questionnaire);
    workspace.addQuestionnaire({source:questionnaire,key:'quiz',parent:'unidad'});

    const component=join(dir,'component.json');
    extractProfilePayload('native-component-course.p2lrn','https://p2lrn.org/profile/native-component',component);
    workspace.addComponent({source:component,key:'component',parent:'unidad'});

    workspace.setChildren('unidad',['act-enlace','act-nota','act-web','act-quiz','act-component']);
    workspace.addComposite({key:'secuencia',title:'Secuencia',children:['act-enlace','act-nota'],parent:'unidad',mode:'sequence',completion:'all'});

    const summary=workspace.summary();
    assert.equal(summary.counts.units,1);
    assert.equal(summary.counts.activities,6);
    const saved=JSON.parse(readFileSync(workspace.projectFile,'utf8'));
    assert.equal(saved.course.title.es,'Curso Studio tipado');
    assert.equal(saved.course.revision,2);
    assert.equal(saved.activities.find((x)=>x.key==='act-enlace').title.es,'Enlace editado');

    workspace.build(out,{strictProfiles:true});
    const reader=new P2LRNReader(out,{strictProfiles:true,validateProfilePayloads:true});
    assert.equal(reader.package.manifest.format,'P2LRN');
    const profiles=new Set(reader.package.manifest.profiles.map((p)=>p.id));
    for(const profile of ['https://p2lrn.org/profile/web-content','https://p2lrn.org/profile/native-questionnaire','https://p2lrn.org/profile/native-component','https://p2lrn.org/profile/native-composite'])assert.ok(profiles.has(profile),profile);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('opening an existing course retains imported entityOrder when adding new authoring entities',()=>{
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-authoring-import-order-'));
  try{
    const workspace=P2LRNAuthoringWorkspace.open(join(canonicalExamples,'minimal-course.p2lrn'),join(dir,'workspace'));
    const before=workspace.project.entityOrder;
    assert.ok(Array.isArray(before)&&before.length>0);
    workspace.addUnit({key:'extra-unit',title:'Nueva unidad'});
    workspace.addUrl({key:'extra-resource',title:'Enlace añadido',url:'https://example.com/learning',parent:'extra-unit'});
    const after=workspace.project.entityOrder;
    assert.deepEqual(after.slice(0,before.length),before,'original portable entity order remains unchanged');
    assert.deepEqual(after.slice(before.length),['extra-unit','res-extra-resource','act-extra-resource']);
    const target=join(dir,'roundtrip.p2lrn');
    workspace.build(target,{strictProfiles:true});
    const reader=new P2LRNReader(target,{strictProfiles:true,validateProfilePayloads:true});
    assert.ok(reader.tree());
  }finally{rmSync(dir,{recursive:true,force:true});}
});
