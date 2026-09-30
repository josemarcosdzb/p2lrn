import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,existsSync,mkdtempSync,readFileSync,rmSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {validatePackageFile} from '../dist/core/validator.js';
import {buildProject} from '../dist/creator/builder.js';
import {P2LRNReader} from '../dist/reader/index.js';
import {openPackageAsProject} from '../dist/creator/import-project.js';
import {loadProject,saveProject,newProject,upgradeProjectWorkspace,validateProject} from '../dist/creator/project.js';
import {extractPreservedSource} from '../dist/tools/extract-source.js';
const exampleCandidates=[resolve('../examples'),resolve('../../examples/legacy-alpha15')];
const examples=exampleCandidates.find((p)=>existsSync(join(p,'creator-course.p2rln'))&&existsSync(join(p,'creator-project')))??exampleCandidates[0];
const expected=['advanced-interoperability.p2rln','aulap2p-reader/document-reader-course.p2rln','creator-course.p2rln','external/cmi5-catapult-pre-post.p2rln','external/h5p-crossword.p2rln','external/qti3-minimal.p2rln','external/scorm12-real.p2rln','minimal-course.p2rln','native-component-authoring-course.p2rln','native-component-course.p2rln','native-component-timeline-course.p2rln','native-composite-course.p2rln','native-questionnaire-course.p2rln','native-questionnaire-games-course.p2rln','static-seekable-media-course.p2rln','web-bundle-course.p2rln','web-course.p2rln'];
const canonicalExamples=resolve('../../examples/canonical');
const canonicalExpected=expected.map((x)=>x.replace(/\.p2rln$/,'.p2lrn'));

test('Creator authoring contract 0.3 is default while legacy projects remain valid',()=>{const fresh=newProject('Contrato Studio','es');assert.equal(fresh.projectVersion,'0.3.0');assert.doesNotThrow(()=>validateProject(fresh));const legacy=JSON.parse(readFileSync(join(examples,'creator-project/p2rln.project.json'),'utf8'));assert.doesNotThrow(()=>validateProject(legacy));});

test('all canonical P2LRN packages open and rebuild with identical contentRoot',()=>{for(const rel of canonicalExpected){const dir=mkdtempSync(join(tmpdir(),'p2lrn-open-'));try{const source=join(canonicalExamples,rel),projectDir=join(dir,'project'),out=join(dir,'rebuilt.p2lrn');const before=new P2LRNReader(source,{strictProfiles:false}).package.manifest.integrity.contentRoot;const opened=openPackageAsProject(source,projectDir);assert.equal(opened.sourceContentRoot,before,rel);assert.equal(buildProject(projectDir,out,false).contentRoot,before,rel);validatePackageFile(out,{strictProfiles:true,validateProfilePayloads:true});}finally{rmSync(dir,{recursive:true,force:true});}}});

test('editing opened project preserves portable identities',()=>{const dir=mkdtempSync(join(tmpdir(),'p2lrn-edit-'));try{const source=join(canonicalExamples,'native-questionnaire-course.p2lrn'),projectDir=join(dir,'project'),out=join(dir,'edited.p2lrn');const original=new P2LRNReader(source),ids=[...original.entities.keys()].sort();openPackageAsProject(source,projectDir);const loaded=loadProject(projectDir);loaded.project.course.title={es:'Curso editado desde Studio'};loaded.project.course.revision+=1;saveProject(loaded.path,loaded.project);buildProject(projectDir,out,true);assert.deepEqual([...new P2LRNReader(out).entities.keys()].sort(),ids);}finally{rmSync(dir,{recursive:true,force:true});}});

test('editing external wrapper preserves nested source byte-for-byte',()=>{const dir=mkdtempSync(join(tmpdir(),'p2lrn-edit-source-'));try{const source=join(canonicalExamples,'external/scorm12-real.p2lrn'),projectDir=join(dir,'project'),out=join(dir,'edited.p2lrn'),before=join(dir,'before.zip'),after=join(dir,'after.zip');extractPreservedSource(source,before);openPackageAsProject(source,projectDir);const loaded=loadProject(projectDir);loaded.project.course.revision+=1;saveProject(loaded.path,loaded.project);buildProject(projectDir,out,true);extractPreservedSource(out,after);assert.deepEqual(readFileSync(after),readFileSync(before));}finally{rmSync(dir,{recursive:true,force:true});}});

test('stable authoring API create/update/load/build',async()=>{const {AUTHORING_API_VERSION,AUTHORING_PROJECT_VERSION,P2LRNAuthoringWorkspace}=await import('../dist/authoring/index.js');const dir=mkdtempSync(join(tmpdir(),'p2lrn-authoring-api-'));try{const root=join(dir,'workspace'),out=join(dir,'course.p2lrn'),workspace=P2LRNAuthoringWorkspace.create(root,{title:'Curso Studio',language:'es'});assert.equal(AUTHORING_API_VERSION,'1');assert.equal(AUTHORING_PROJECT_VERSION,'0.3.0');workspace.update((draft)=>{draft.course.revision+=1;});workspace.build(out,{strictProfiles:true});assert.equal(new P2LRNReader(out).package.manifest.format,'P2LRN');}finally{rmSync(dir,{recursive:true,force:true});}});

test('stable authoring API opens canonical package losslessly',async()=>{const {P2LRNAuthoringWorkspace}=await import('../dist/authoring/index.js');const dir=mkdtempSync(join(tmpdir(),'p2lrn-authoring-open-'));try{const source=join(canonicalExamples,'advanced-interoperability.p2lrn'),root=join(dir,'workspace'),out=join(dir,'rebuilt.p2lrn'),before=new P2LRNReader(source).package.manifest.integrity.contentRoot,workspace=P2LRNAuthoringWorkspace.open(source,root);assert.equal(workspace.build(out,{strictProfiles:true}).contentRoot,before);}finally{rmSync(dir,{recursive:true,force:true});}});

test('authoring contract rejects conflicting preserved package path',()=>{const project=newProject('Conflicto','es');project.preservedFiles=[{path:'payload.bin',packagePath:'assets/shared.bin',mediaType:'application/octet-stream'}];project.resources.push({key:'res-conflict',representations:[{key:'primary',role:'primary',mediaType:'application/octet-stream',source:{type:'package-file',path:'other.bin',packagePath:'assets/shared.bin',packageMediaType:'application/octet-stream'}}]});assert.throws(()=>validateProject(project),/both as preserved file and representation payload/);});

test('Creator and Reader capability matrix covers shipped profiles',()=>{const matrix=JSON.parse(readFileSync(resolve('config/authoring-capabilities.json'),'utf8')),reader=JSON.parse(readFileSync(resolve('config/capabilities.json'),'utf8')),byId=new Map(reader.profiles.map((p)=>[p.id,new Set(p.modes)]));assert.deepEqual(new Set(matrix.profiles.map((p)=>p.id)),new Set(reader.profiles.map((p)=>p.id)));for(const profile of matrix.profiles){const modes=byId.get(profile.id);for(const mode of ['validate','read','preserve','deliver'])assert.equal(profile.reader[mode],modes.has(mode));assert.equal(profile.creator.openRebuild,true);}});

test('legacy workspace upgrades to 0.3 without changing contentRoot',()=>{const dir=mkdtempSync(join(tmpdir(),'p2lrn-upgrade-workspace-'));try{const root=join(dir,'project');cpSync(join(examples,'creator-project'),root,{recursive:true});const current=join(root,'p2lrn.project.json');if(existsSync(current))unlinkSync(current);const before=buildProject(root,join(dir,'before.p2lrn'),true),upgraded=upgradeProjectWorkspace(root),after=buildProject(root,join(dir,'after.p2lrn'),true);assert.equal(upgraded.toVersion,'0.3.0');assert.equal(after.contentRoot,before.contentRoot);}finally{rmSync(dir,{recursive:true,force:true});}});

test('all 17 Alpha15 P2RLN packages open and rebuild as P2LRN',()=>{for(const rel of expected){const dir=mkdtempSync(join(tmpdir(),'p2lrn-open-legacy-'));try{const source=join(examples,rel),root=join(dir,'workspace'),out=join(dir,rel.replace(/\.p2rln$/,'.p2lrn'));assert.equal(openPackageAsProject(source,root).canonicalMigration,true,rel);assert.equal(validatePackageFile((buildProject(root,out,false),out),{strictProfiles:true,validateProfilePayloads:true}).manifest.format,'P2LRN',rel);}finally{rmSync(dir,{recursive:true,force:true});}}});

test('legacy SCORM authoring migration preserves nested source',()=>{const dir=mkdtempSync(join(tmpdir(),'p2lrn-legacy-source-'));try{const source=join(examples,'external/scorm12-real.p2rln'),root=join(dir,'workspace'),out=join(dir,'scorm.p2lrn'),before=join(dir,'before.zip'),after=join(dir,'after.zip');extractPreservedSource(source,before);openPackageAsProject(source,root);buildProject(root,out,true);extractPreservedSource(out,after);assert.deepEqual(readFileSync(after),readFileSync(before));}finally{rmSync(dir,{recursive:true,force:true});}});


test('typed authoring progression is opt-in and distinguishes required from blocking',async()=>{
  const {P2LRNAuthoringWorkspace}=await import('../dist/authoring/index.js');
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-authoring-progression-'));
  try{
    const root=join(dir,'workspace'),out1=join(dir,'gated.p2lrn'),out2=join(dir,'required-only.p2lrn'),out3=join(dir,'free.p2lrn');
    const workspace=P2LRNAuthoringWorkspace.create(root,{title:'Progression',language:'es'});
    workspace.addUrl({url:'https://example.invalid/lesson-1',key:'lesson-1',title:'Lección 1'});
    workspace.addUrl({url:'https://example.invalid/lesson-2',key:'lesson-2',title:'Lección 2'});

    const gated=workspace.setProgression('act-lesson-1',{required:true,gateFollowing:true,completionRequirement:'viewed'});
    assert.equal(gated.profileRequirement,'required');
    workspace.build(out1,{strictProfiles:true});
    let reader=new P2LRNReader(out1);
    let profile=reader.package.manifest.profiles.find((item)=>item.id==='https://p2lrn.org/profile/progression');
    assert.equal(profile?.requirement,'required');
    let entity=[...reader.entities.values()].find((item)=>item.title?.es==='Lección 1'&&item.type==='activity');
    assert.deepEqual(entity?.extensions?.['https://p2lrn.org/profile/progression'],{required:true,gateFollowing:true,completionRequirement:'viewed'});

    const requiredOnly=workspace.setProgression('act-lesson-1',{required:true,completionRequirement:'viewed'});
    assert.equal(requiredOnly.profileRequirement,'optional');
    workspace.build(out2,{strictProfiles:true});
    reader=new P2LRNReader(out2);
    profile=reader.package.manifest.profiles.find((item)=>item.id==='https://p2lrn.org/profile/progression');
    assert.equal(profile?.requirement,'optional');

    const cleared=workspace.setProgression('act-lesson-1',null);
    assert.equal(cleared.profileRequirement,null);
    workspace.build(out3,{strictProfiles:true});
    reader=new P2LRNReader(out3);
    assert.equal(reader.package.manifest.profiles.some((item)=>item.id==='https://p2lrn.org/profile/progression'),false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
