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
    workspace.addUnit({key:'unidad-2',title:'Unidad 2'});
    const url=workspace.addUrl({url:'https://example.com/recurso',key:'enlace',title:'Enlace',parent:'unidad'});
    assert.equal(url.activityKey,'act-enlace');
    workspace.setEntityText(url.activityKey,{title:'Enlace editado'});

    const file=join(dir,'nota.txt');writeFileSync(file,'contenido\n');
    workspace.addFile({source:file,key:'nota',title:'Nota',parent:'unidad'});

    const web=join(dir,'web');mkdirSync(web,{recursive:true});writeFileSync(join(web,'index.html'),'<!doctype html><title>web</title>');
    workspace.addWebContent({sourceDirectory:web,key:'web',title:'Web',parent:'unidad'});

    const questionnaire=join(dir,'questionnaire.json');
    extractProfilePayload('native-questionnaire-course.p2lrn','https://p2lrn.org/profile/native-questionnaire',questionnaire);
    workspace.addQuestionnaireData({data:JSON.parse(readFileSync(questionnaire,'utf8')),key:'quiz',parent:'unidad'});

    const component=join(dir,'component.json');
    extractProfilePayload('native-component-course.p2lrn','https://p2lrn.org/profile/native-component',component);
    workspace.addComponent({source:component,key:'component',parent:'unidad'});

    workspace.addObjective({key:'objetivo-1',title:'Aplicar el concepto',description:'Objetivo editable desde Studio'});
    workspace.addCaseAlignment('objetivo-1',{
      targetUrl:'https://case.example.invalid/uri/item-1',
      targetType:'CFItem',
      targetCode:'item-1',
      targetFramework:'Framework de prueba',
      targetName:'Aplicar el concepto'
    });
    workspace.setActivity('act-quiz',{objectives:['objetivo-1']});
    workspace.setRendererPreference('act-quiz',{renderer:'https://p2lrn.org/renderer/questionnaire/rosco',rendererVersion:'1'});
    workspace.addRelation({source:'act-quiz',predicate:'https://p2lrn.org/relation/assesses',target:'objetivo-1'});
    workspace.setObjective('objetivo-1',{description:'Objetivo actualizado'});
    workspace.moveEntity({key:'act-component',parent:'unidad-2',index:0});
    workspace.duplicateEntity({key:'objetivo-1',newKey:'objetivo-2',title:'Objetivo duplicado'});
    workspace.duplicateEntity({key:'act-enlace',newKey:'act-enlace-copia',title:'Enlace copia',parent:'unidad-2'});
    workspace.removeEntity({key:'act-enlace-copia'});

    workspace.setChildren('unidad',['act-enlace','act-nota','act-web','act-quiz']);
    workspace.addComposite({key:'secuencia',title:'Secuencia',children:['act-enlace','act-nota'],parent:'unidad',mode:'sequence',completion:'all'});

    const summary=workspace.summary();
    assert.equal(summary.counts.units,2);
    assert.equal(summary.counts.activities,6);
    assert.equal(summary.counts.objectives,2);
    assert.equal(summary.counts.relations,1);
    const saved=JSON.parse(readFileSync(workspace.projectFile,'utf8'));
    assert.equal(saved.course.title.es,'Curso Studio tipado');
    assert.equal(saved.course.revision,2);
    assert.equal(saved.activities.find((x)=>x.key==='act-enlace').title.es,'Enlace editado');
    assert.deepEqual(saved.units.find((x)=>x.key==='unidad-2').children,['act-component']);
    assert.deepEqual(saved.activities.find((x)=>x.key==='act-quiz').objectives,['objetivo-1']);
    assert.equal(saved.activities.find((x)=>x.key==='act-quiz').extensions['https://p2lrn.org/ext/renderer-preference/1'].preferred,'https://p2lrn.org/renderer/questionnaire/rosco');
    assert.equal(saved.objectives.find((x)=>x.key==='objetivo-1').description.es,'Objetivo actualizado');
    assert.equal(saved.objectives.find((x)=>x.key==='objetivo-1').alignments[0].targetUrl,'https://case.example.invalid/uri/item-1');
    assert.equal(saved.objectives.find((x)=>x.key==='objetivo-1').alignments[0].extensions['https://p2lrn.org/profile/case'].version,'1.1');
    assert.equal(saved.objectives.find((x)=>x.key==='objetivo-2').title.es,'Objetivo duplicado');
    assert.equal(saved.objectives.find((x)=>x.key==='objetivo-2').portableId,undefined);
    assert.equal(saved.activities.some((x)=>x.key==='act-enlace-copia'),false);
    assert.equal(saved.relations[0].predicate,'https://p2lrn.org/relation/assesses');

    workspace.build(out,{strictProfiles:true});
    const reader=new P2LRNReader(out,{strictProfiles:true,validateProfilePayloads:true});
    assert.equal(reader.package.manifest.format,'P2LRN');
    const profiles=new Set(reader.package.manifest.profiles.map((p)=>p.id));
    for(const profile of ['https://p2lrn.org/profile/web-content','https://p2lrn.org/profile/native-questionnaire','https://p2lrn.org/profile/native-component','https://p2lrn.org/profile/native-composite'])assert.ok(profiles.has(profile),profile);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
