import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cageVertices,validCage,defaultAssembly,validateAssembly,
  evaluateAssemblyPlacement,rotateVector,toWorld,toLocal,
  inspectAssemblyGLB,rotationErrorDegrees,fitAssemblyBounds,assemblyPlacementTransform,assemblyFitStatus,cageContains,scatterAssemblyStarts,
} from '../web/assembly-3d-core.js';
import {validateQuestionnaire,scoreQuestionnaire} from '../web/questionnaire-core.js';
import {buildQuestionnaireGame} from '../web/questionnaire-games-core.js';

const renderer='https://p2lrn.org/renderer/questionnaire/3d-order-match';
function payload(){
  const scene=defaultAssembly();
  return {schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',version:'0.4.0',
    title:'Prueba de ensamblaje',language:'es',grading:{mode:'embedded-key'},
    questions:[{id:'q1',type:'classification',prompt:'Monta el mecanismo',points:2,
      items:scene.pieces.map(p=>({id:p.id,text:p.text})),
      categories:scene.targets.map(t=>({id:t.id,text:t.text})),
      solution:{assignments:scene.links.map(l=>({item:l.pieceId,category:l.targetId}))},
      assembly3d:scene}]};
}
test('convex vertex cages accept independent editing, reject collapse and invalid values',()=>{
  const cage=cageVertices(2,2,2);
  assert.equal(validCage(cage),true);
  const displaced=cage.map(v=>[...v]);displaced[0][0]-=0.25;
  assert.equal(validCage(displaced),true,'Vertex editing must not require original quad faces to remain planar');
  const duplicate=cage.map(v=>[...v]);duplicate[0]=[...duplicate[1]];
  assert.equal(validCage(duplicate),false);
  assert.equal(validCage(cage.slice(1)),false);
  const broken=cage.map(v=>[...v]);broken[1][2]=Infinity;
  assert.equal(validCage(broken),false);
});
test('assembly transforms preserve local/world coordinates and quaternion sign',()=>{
  const scene=defaultAssembly(),target=scene.targets[0];
  target.transform.position=[12,4,-3];
  target.transform.scale=[2,1.5,3];
  target.transform.rotation=[0,Math.sin(Math.PI/4),0,Math.cos(Math.PI/4)];
  assert.deepEqual(toLocal(toWorld([0.3,-0.6,0.9],target.transform),target.transform).map(v=>Number(v.toFixed(6))),[0.3,-0.6,0.9]);
  assert.ok(Math.abs(rotateVector([1,0,0],target.transform.rotation)[2]+1)<1e-9);
  assert.ok(rotationErrorDegrees([0,0,0,1],[0,0,0,-1])<1e-7);
  validateAssembly(scene);
});
test('correct placement, wrong destination, location, rotation and ordering dependency',()=>{
  const scene=defaultAssembly(),identity=[0,0,0,1],target=scene.targets[0];
  assert.equal(evaluateAssemblyPlacement(scene,'piece-1','target-1',{position:target.transform.position,rotation:identity}).ok,true);
  assert.equal(evaluateAssemblyPlacement(scene,'piece-1','target-2',{position:target.transform.position,rotation:identity}).reason,'wrong-target');
  assert.equal(evaluateAssemblyPlacement(scene,'piece-1','target-1',{position:[90,0,0],rotation:identity}).reason,'outside');
  assert.equal(evaluateAssemblyPlacement(scene,'piece-1','target-1',{position:target.transform.position,rotation:[0,Math.sin(Math.PI/4),0,Math.cos(Math.PI/4)]}).reason,'rotation');
  scene.links[1].prerequisites=['piece-1'];
  assert.equal(evaluateAssemblyPlacement(scene,'piece-2','target-2',{position:scene.targets[1].transform.position,rotation:identity}).reason,'prerequisite');
  assert.equal(evaluateAssemblyPlacement(scene,'piece-2','target-2',{position:scene.targets[1].transform.position,rotation:identity},{'piece-1':'target-1'}).ok,true);
});
test('rejects invalid assets and relationship cycles without weakening native questionnaire rules',()=>{
  const data=defaultAssembly();data.links[0].prerequisites=['piece-2'];data.links[1].prerequisites=['piece-1'];
  assert.throws(()=>validateAssembly(data),/circulares/);
  const p=payload();p.questions[0].assembly3d.pieces[0].initialTransform.scale[0]=0;
  assert.throws(()=>validateQuestionnaire(p),/inválidos/);
  const q=payload();q.questions[0].solution.assignments[0].category='target-2';
  assert.throws(()=>validateQuestionnaire(q),/incoherentes/);
});
test('native game converter and grading use existing classification authority',()=>{
  const p=payload();validateQuestionnaire(p);
  const game=buildQuestionnaireGame(p,renderer);
  assert.equal(game.compatible,true);
  assert.equal(game.data.trials[0].type,'assembly-3d');
  assert.equal(game.data.trials[0].scene.targets.length,2);
  const right=scoreQuestionnaire(p,{q1:{classifications:{'piece-1':'target-1','piece-2':'target-2'}}});
  const wrong=scoreQuestionnaire(p,{q1:{classifications:{'piece-1':'target-2','piece-2':'target-1'}}});
  assert.ok(right.raw>wrong.raw);
});
function glb(doc){
  const text=new TextEncoder().encode(JSON.stringify(doc));
  const n=(text.length+3)&~3;
  const bytes=new Uint8Array(20+n+8+8);
  const d=new DataView(bytes.buffer);
  d.setUint32(0,0x46546c67,true);d.setUint32(4,2,true);d.setUint32(8,bytes.length,true);
  d.setUint32(12,n,true);d.setUint32(16,0x4e4f534a,true);
  bytes.fill(32,20,20+n);bytes.set(text,20);
  d.setUint32(20+n,8,true);d.setUint32(24+n,0x004e4942,true);
  return bytes;
}
test('embedded GLB inspection rejects external URLs, unknown compression and corrupt headers',()=>{
  const doc={asset:{version:'2.0'},meshes:[{primitives:[{attributes:{POSITION:0}}]}],nodes:[{mesh:0,name:'Órgano'}],buffers:[{byteLength:8}]};
  const ok=inspectAssemblyGLB(glb(doc));
  assert.equal(ok.nodes[0].name,'Órgano');
  const external=structuredClone(doc);external.buffers[0].uri='https://untrusted.example/geometry.bin';
  assert.throws(()=>inspectAssemblyGLB(glb(external)),/externas/);
  const compressed=structuredClone(doc);compressed.extensionsRequired=['EXT_meshopt_compression'];
  assert.throws(()=>inspectAssemblyGLB(glb(compressed)),/decodificador/);
  const broken=glb(doc);broken[0]=0;
  assert.throws(()=>inspectAssemblyGLB(broken),/cabecera/);
});

test('real glTF bounds fit inside the target even with an off-centre pivot',()=>{
  const scene=defaultAssembly(),target=scene.targets[0],piece=scene.pieces[0];
  target.transform.position=[3,2,-4];
  target.transform.rotation=[0,Math.sin(Math.PI/4),0,Math.cos(Math.PI/4)];
  const bounds={min:[10,-2,5],max:[14,4,8]};
  const fitted=fitAssemblyBounds(target,bounds);
  scene.links[0].placement=fitted;
  piece.initialTransform.scale=[...fitted.scale];
  const correct=assemblyPlacementTransform(scene,piece.id);
  const center=bounds.min.map((n,i)=>(n+bounds.max[i])/2);
  assert.equal(cageContains(toWorld(center,correct),target),true);
  assert.equal(evaluateAssemblyPlacement(scene,piece.id,target.id,correct).ok,true);
  const pivotWrong={...correct,position:[...target.transform.position]};
  assert.equal(evaluateAssemblyPlacement(scene,piece.id,target.id,pivotWrong).ok,false);
  const scaleWrong={...correct,scale:correct.scale.map(v=>v*1.4)};
  assert.equal(evaluateAssemblyPlacement(scene,piece.id,target.id,scaleWrong).ok,false);
  const oldStart=[...piece.initialTransform.position];
  target.transform.position[0]+=2.5;
  const followed=assemblyPlacementTransform(scene,piece.id);
  assert.ok(Math.abs(followed.position[0]-correct.position[0]-2.5)<1e-8);
  assert.deepEqual(piece.initialTransform.position,oldStart,'Moving a destination must not move the student start position');
  validateAssembly(scene);
});
test('fits flat educational geometry and isolates fitting from assembly sequence order',()=>{
  const scene=defaultAssembly(),target=scene.targets[1];
  const flat={min:[0,0,0],max:[0.8,0.8,0]};
  scene.links[1].placement=fitAssemblyBounds(target,flat);
  scene.links[1].prerequisites=['piece-1'];
  const pose=assemblyPlacementTransform(scene,'piece-2');
  assert.equal(assemblyFitStatus(scene,'piece-2',pose).ok,true,'The teacher must see geometry fit even if a learner must assemble other pieces first');
  assert.equal(evaluateAssemblyPlacement(scene,'piece-2','target-2',pose).reason,'prerequisite');
});

test('learner pieces scatter into distinct random positions outside ALL destination volumes',()=>{
  const scene=defaultAssembly();
  for(let n=3;n<=12;n++){
    const id='piece-'+n,tid='target-'+n;
    scene.pieces.push({id,text:'Pieza '+n,assetId:null,nodeId:null,initialTransform:{
      position:[0,1,0],rotation:[0,0,0,1],scale:[1,1,1],
    }});
    scene.targets.push({id:tid,text:'Caja '+n,vertices:cageVertices(),transform:{
      position:[(n%4)*2,1,-Math.floor(n/4)*2],rotation:[0,0,0,1],scale:[1,1,1]},visibility:'outline'});
    scene.links.push({pieceId:id,targetId:tid,positionTolerance:0.18,rotationToleranceDeg:22,prerequisites:[]});
  }
  const first=scatterAssemblyStarts(scene,0x12345678);
  const same=scatterAssemblyStarts(scene,0x12345678);
  const different=scatterAssemblyStarts(scene,0x23456789);
  assert.deepEqual(first,same,'Resume must keep the same positions for a saved seed');
  assert.notDeepEqual(first,different,'New attempt must reshuffle the staging area');
  const list=Object.values(first);
  assert.equal(list.length,scene.pieces.length);
  const maxDestZ=Math.max(...scene.targets.flatMap(t=>t.vertices.map(v=>toWorld(v,t.transform)[2])));
  for(const p of list){
    assert.ok(p.position[2]>maxDestZ+1,'Learner piece is already inside or beside a target');
    assert.ok(scene.targets.every(t=>!cageContains(p.position,t,0.5)),'Learner piece begins inside a target');
  }
  for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)
    assert.ok(Math.hypot(list[i].position[0]-list[j].position[0],list[i].position[2]-list[j].position[2])>1.5,
      'Two learner pieces overlap at the start');
  assert.deepEqual(scene.pieces[0].initialTransform.position,[-2.5,0.8,2.5],'Student randomization mutated the authoring scene');
});
