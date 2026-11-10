import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {
  appendUniqueConnection,connectionKey,validateConnection,
} from '../web/game-3d-mechanics.js';

const read=(path)=>readFile(new URL(path,import.meta.url),'utf8');

function createMatchingHarness(source,{savedPairs={}}={}){
  class FakeElement {
    constructor(tag,attrs={},text=''){
      this.tag=tag;this.children=[];this.textContent=String(text);
      this.classes=new Set();
      this.classList={
        add:(name)=>this.classes.add(name),
        remove:(name)=>this.classes.delete(name),
        toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name),
        contains:(name)=>this.classes.has(name),
      };
      this.events=new Map();this.disabled=false;
    }
    append(...children){this.children.push(...children);}
    addEventListener(name,callback){this.events.set(name,callback);}
    click(){this.events.get('click')?.();}
  }
  const start=source.indexOf('function buildMatchingControls(');
  // Stop at the COMPLETE following declaration, including an optional ES
  // module export keyword. Otherwise the vm receives a dangling 'export'.
  const boundary=source.slice(start).search(/\n(?:export\s+)?function buildClassificationControls\(/);
  const end=boundary<0?-1:start+boundary+1;
  assert.ok(start>=0&&end>start,'matching scene constructor must exist');
  const ctor=runInNewContext(source.slice(start,end)+'\nbuildMatchingControls;',{
    el:(tag,attrs,text)=>new FakeElement(tag,attrs,text),
    playerUiText:(text)=>text,
    setText:(node,text)=>{node.textContent=String(text);},
    appendUniqueConnection,connectionKey,validateConnection,
    seedText:()=>42,
    matchingPositions:(side,total)=>Array.from({length:total},(_,index)=>[
      side==='left'?-5:5,0,index*2,
    ]),
  });
  const cables={temporary:[],permanent:[],removed:[]};
  const scene={
    addNode(){},highlight(){},setPointerTarget(){},
    connectToPlayer:(id)=>{const line={id,kind:'temporary-player'};cables.temporary.push(line);return line;},
    connectToPointer:(id)=>{const line={id,kind:'temporary-pointer'};cables.temporary.push(line);return line;},
    connect:(from,to)=>{cables.permanent.push([from,to]);return {from,to};},
    disconnect:(line)=>{cables.removed.push(line);return true;},
  };
  const runtime={
    state:{completed:false},
    answer:()=>({pairs:savedPairs}),
    applyPatch(){},
  };
  const trial={
    questionId:'q3d',prompt:'Relaciona',
    left:[{id:'es',text:'España'},{id:'fr',text:'Francia'}],
    right:[{id:'ma',text:'Madrid'},{id:'pa',text:'París'}],
    connections:[{leftId:'es',rightId:'ma'},{leftId:'fr',rightId:'pa'}],
  };
  const status={textContent:''};
  const controller=ctor({trial,runtime,scene,status});
  return {cables,controller,runtime,scene,status};
}

test('Completed matching cannot create a new rope when a solved option is clicked or dragged',async()=>{
  const source=await read('../web/renderers/questionnaire-3d.js');
  const h=createMatchingHarness(source);
  const {controller,cables,runtime,status}=h;
  assert.equal(controller.interact({kind:'matching-left',id:'es'}),true);
  assert.equal(cables.temporary.length,1);
  assert.equal(controller.interact({kind:'matching-right',id:'ma'}),true);
  assert.equal(cables.permanent.length,1);
  assert.equal(cables.removed.length,1);
  // Selecting an already solved source must never create a new loose cable.
  controller.interact({kind:'matching-left',id:'es'});
  assert.equal(cables.temporary.length,1);
  assert.equal(controller.drag({kind:'matching-left',id:'es'},'start'),false);
  assert.equal(cables.temporary.length,1);
  controller.interact({kind:'matching-left',id:'fr'});
  controller.interact({kind:'matching-right',id:'pa'});
  assert.equal(cables.permanent.length,2);
  assert.equal(cables.removed.length,2);
  for(const id of ['es','fr']){
    controller.interact({kind:'matching-left',id});
    assert.equal(controller.drag({kind:'matching-left',id},'start'),false);
  }
  assert.equal(cables.temporary.length,2,'no additional ropes after final pair');
  assert.equal(cables.removed.length,2,'both provisional ropes are cleaned up');
  assert.match(status.textContent,/completadas/);
  runtime.state.completed=true;
  controller.interact({kind:'matching-left',id:'es'});
  assert.equal(cables.temporary.length,2,'submission also locks all connections');
});

test('Restored matching result stays locked and does not create another rope',async()=>{
  const source=await read('../web/renderers/questionnaire-3d.js');
  const h=createMatchingHarness(source,{savedPairs:{es:'ma',fr:'pa'}});
  assert.equal(h.cables.permanent.length,2);
  h.controller.interact({kind:'matching-left',id:'es'});
  assert.equal(h.controller.drag({kind:'matching-left',id:'fr'},'start'),false);
  assert.equal(h.cables.temporary.length,0);
});

test('Game labels are on the faces of real boxes, not floating billboard sprites',async()=>{
  const [scene,renderer,css]=await Promise.all([
    read('../web/game-3d/three-runtime.js'),
    read('../web/renderers/questionnaire-3d.js'),
    read('../web/questionnaire-games.css'),
  ]);
  assert.match(scene,/function addFaceLabel\(/);
  assert.match(scene,/new THREE\.PlaneGeometry\(width,height\)/);
  assert.match(scene,/size\[2\]\/2\+surface/);
  assert.match(scene,/size\[0\]\/2\+surface/);
  assert.match(scene,/ctx\.font=\x60800/);
  assert.doesNotMatch(scene,/new THREE\.Sprite\(/);
  assert.doesNotMatch(scene,/addLabel\(mesh,text/);
  assert.doesNotMatch(renderer,/p2lrn-3d-move-pad|Recentrar jugador/);
  assert.doesNotMatch(css,/\.p2lrn-3d-move-pad/);
  assert.match(renderer,/p2lrn-3d-game/);
});
