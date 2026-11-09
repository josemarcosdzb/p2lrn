import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {P2LRNAuthoringWorkspace} from '../dist/authoring/index.js';
import {P2LRNReader} from '../dist/reader/index.js';

// Native authoring fixtures are created from source data during the test,
// not retained as old distributable courses in the repository.
const questionnaireFixture = {
  schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',
  version:'0.4.0',title:'Evaluación de prueba',language:'es',
  grading:{mode:'embedded-key'},
  questions:[{id:'q1',type:'single-choice',prompt:'¿Cuál es la respuesta correcta?',points:1,
    choices:[{id:'a',text:'Correcta'},{id:'b',text:'Incorrecta'}],solution:{choiceIds:['a']}}],
};
const componentFixture = {
  schema:'https://p2lrn.org/schema/native-component/0.1',
  version:'0.1',
  component:{id:'https://p2lrn.org/component/test-fixture',componentVersion:'1',dataVersion:'1',runtimeContractVersion:'1'},
  data:{text:'Componente nativo de prueba'},title:'Componente',language:'es',
};

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
    writeFileSync(questionnaire,JSON.stringify(questionnaireFixture));
    workspace.addQuestionnaire({source:questionnaire,key:'quiz',parent:'unidad'});

    const component=join(dir,'component.json');
    writeFileSync(component,JSON.stringify(componentFixture));
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
    const initial=P2LRNAuthoringWorkspace.create(join(dir,'initial'),{title:'Curso de origen',language:'es'});
    initial.addUrl({key:'original',title:'Recurso original',url:'https://example.invalid/original'});
    const source=join(dir,'source.p2lrn');
    initial.build(source,{strictProfiles:true});
    const workspace=P2LRNAuthoringWorkspace.open(source,join(dir,'workspace'));
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
