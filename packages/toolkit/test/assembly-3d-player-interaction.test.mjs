import assert from 'node:assert/strict';
import test from 'node:test';
import {defaultAssembly} from '../web/assembly-3d-core.js';
import {buildAssemblyControls} from '../web/renderers/assembly-3d.js';

class FakeElement {
  constructor(tag){
    this.tag=tag;
    this.children=[];
    this.style={};
    this.attributes=new Map();
    this.listeners=new Map();
    this.textContent='';
    this.value='';
    this.disabled=false;
  }
  append(...nodes){
    for(const node of nodes){
      this.children.push(node);
      if(this.tag==='select'&&this.children.length===1)this.value=node.value;
    }
  }
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  addEventListener(name,handler){
    if(!this.listeners.has(name))this.listeners.set(name,[]);
    this.listeners.get(name).push(handler);
  }
  click(){if(this.disabled)return;for(const handler of this.listeners.get('click')??[])handler({target:this});}
  querySelectorAll(selector){
    const result=[];
    const visit=node=>{
      for(const child of node.children){
        if(selector==='button'&&child.tag==='button')result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }
}
function sceneFixture(){
  const positions=new Map(),patches=[],frames=[],carried=new Set(),carryEvents=[];
  const scene={
    addCage(){},addBox({id,position}){positions.set(id,{position:[...position],rotation:[0,0,0,1],scale:[1,1,1]});},
    setTransform(id,transform){positions.set(id,structuredClone(transform));return true;},
    getTranslation(id){return [...positions.get(id).position];},
    setTranslation(id,position){positions.get(id).position=[...position];return true;},
    getObjectLocalBounds(){return null;},
    carry(id,on=true){
      carryEvents.push({id,on});
      if(on){carried.clear();carried.add(id);}
      else carried.delete(id);
    },
    highlight(){},
    frameObjects(ids,options){frames.push({ids,options});return true;},
  };
  const stored=new Map();
  const runtime={
    state:{completed:false,attemptsCompleted:0},
    answer(){return null;},
    getGameState(key,fallback){return stored.has(key)?stored.get(key):fallback;},
    setGameState(key,value){stored.set(key,value);},
    applyPatch(questionId,patch){patches.push({questionId,patch});},
  };
  return {scene,positions,patches,frames,carried,carryEvents,runtime};
}
async function setup({fixture=sceneFixture()}={}){
  const previous=globalThis.document;
  globalThis.document={documentElement:{lang:'es'},createElement:tag=>new FakeElement(tag)};
  try{
    const config=defaultAssembly(),status=new FakeElement('p');
    const controls=await buildAssemblyControls({
      trial:{questionId:'q1',scene:config},runtime:fixture.runtime,
      scene:fixture.scene,status,pkg:null,
    });
    return {config,...fixture,status,controls,restore(){if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}};
  }catch(error){if(previous===undefined)delete globalThis.document;else globalThis.document=previous;throw error;}
}
const hit=id=>({kind:'assembly-piece',id});
const where=id=>({kind:'assembly-target',id});
function drag(controller,id,from,to,target=null){
  assert.equal(controller.drag(hit(id),'start',{position:from}),true);
  assert.equal(controller.drag(hit(id),'move',{position:to}),true);
  assert.equal(controller.drag(hit(id),'end',{position:to,target}),true);
}
function button(panel,label){
  const found=panel.querySelectorAll('button').find(item=>item.textContent===label);
  assert.ok(found,'Expected button '+label);return found;
}

test('assembly retains every released pose, even outside a target or over an invalid cage',async()=>{
  const ctx=await setup();
  try{
    const id='piece-1',key='assembly:'+id;
    const original=structuredClone(ctx.positions.get(key));
    const first=[original.position[0]+3,original.position[1],original.position[2]-1];
    drag(ctx.controls,id,original.position,first);
    assert.deepEqual(ctx.positions.get(key).position,first,'missed drop must not rewind');
    assert.equal(ctx.patches.length,0,'free movement never gives a score');
    assert.match(ctx.status.textContent,/Pieza desplazada/);
    const second=[first[0]+2,first[1],first[2]];
    drag(ctx.controls,id,first,second,where('target-2'));
    assert.deepEqual(ctx.positions.get(key).position,second,'wrong target must not rewind');
    assert.equal(ctx.patches.length,0);
    assert.match(ctx.status.textContent,/no corresponde/);
    const third=[second[0]-1,second[1],second[2]-1];
    assert.equal(ctx.controls.drag(hit(id),'start',{position:second}),true);
    ctx.controls.drag(hit(id),'move',{position:third});
    ctx.controls.drag(hit(id),'end',{position:null,target:null});
    assert.deepEqual(ctx.positions.get(key).position,third,'last pointer move survives missing release point');
  }finally{ctx.restore();}
});

test('assembly scores only real released target placement and preserves retries',async()=>{
  const ctx=await setup();
  try{
    const id='piece-1',key='assembly:'+id;
    const start=structuredClone(ctx.positions.get(key));
    const wrong=[17,1,17];
    drag(ctx.controls,id,start.position,wrong,where('target-1'));
    assert.deepEqual(ctx.positions.get(key).position,wrong);
    assert.equal(ctx.patches.length,0,'never teleport to authored answer on failed physical drop');
    assert.match(ctx.status.textContent,/situarse dentro/);
    const correct=[...ctx.config.targets[0].transform.position];
    drag(ctx.controls,id,wrong,correct,where('target-1'));
    assert.equal(ctx.patches.length,1,'real placement produces one native classification patch');
    assert.deepEqual(ctx.patches[0],{
      questionId:'q1',patch:{kind:'classification-set',itemId:'piece-1',categoryId:'target-1'},
    });
    assert.deepEqual(ctx.positions.get(key).position,correct);
    assert.match(ctx.status.textContent,/encajada/);
    const next='piece-2';
    assert.equal(ctx.controls.drag(hit(next),'start',{position:ctx.positions.get('assembly:'+next).position}),true);
    ctx.controls.drag(hit(next),'cancel');
    assert.equal(ctx.patches.length,1,'cancel never creates a score');
  }finally{ctx.restore();}
});

test('reset orientation preserves movement, explicit reset restores the piece, frame button navigates',async()=>{
  const ctx=await setup();
  try{
    const id='piece-2',key='assembly:'+id,start=structuredClone(ctx.positions.get(key));
    const dest=[start.position[0]+1.5,start.position[1],start.position[2]-0.75];
    drag(ctx.controls,id,start.position,dest);
    button(ctx.controls.panel,'Y +15°').click();
    assert.notDeepEqual(ctx.positions.get(key).rotation,start.rotation);
    button(ctx.controls.panel,'Restaurar orientación').click();
    assert.deepEqual(ctx.positions.get(key).position,dest,'orientation only cannot erase placement');
    assert.deepEqual(ctx.positions.get(key).rotation,start.rotation);
    button(ctx.controls.panel,'Reiniciar pieza').click();
    assert.deepEqual(ctx.positions.get(key).position,start.position,'reset is deliberate');
    const before=ctx.frames.length;
    button(ctx.controls.panel,'Centrar montaje').click();
    assert.equal(ctx.frames.length,before+1,'camera can return to an assembly overview');
    assert.equal(ctx.patches.length,0);
  }finally{ctx.restore();}
});

test('assembly restores invalid free pose across navigation, keeps cancelled pose and only explicit restart rewinds',async()=>{
  const ctx=await setup();
  try{
    const id='piece-1',key='assembly:'+id;
    const original=structuredClone(ctx.positions.get(key));
    const first=[original.position[0]+1.5,original.position[1],original.position[2]-1.5];
    drag(ctx.controls,id,original.position,first);
    const storeKey='3d:assembly:free-poses:q1:attempt-1';
    assert.deepEqual(ctx.runtime.getGameState(storeKey,null)[id].position,first);
    const reentered=await setup({fixture:ctx});
    try{
      assert.deepEqual(reentered.positions.get(key).position,first,
        'returning to assembly should preserve the free released pose');
      const second=[first[0]+1,first[1],first[2]-0.8];
      assert.equal(reentered.controls.drag(hit(id),'start',{position:first}),true);
      reentered.controls.drag(hit(id),'move',{position:second});
      reentered.controls.drag(hit(id),'cancel');
      assert.deepEqual(reentered.positions.get(key).position,second,
        'pointercancel means release, not restore to starting pose');
      reentered.controls.interact({kind:'scene-empty'});
      assert.deepEqual(reentered.positions.get(key).position,second,
        'clicking an empty region must not shift assembly pieces');
      const reopened=await setup({fixture:ctx});
      try{
        assert.deepEqual(reopened.positions.get(key).position,second);
        button(reopened.controls.panel,'Reiniciar pieza').click();
        assert.deepEqual(reopened.positions.get(key).position,original.position,
          'only explicit restart must return to original staging point');
        assert.equal(ctx.runtime.getGameState(storeKey,null)[id],undefined,
          'reset removes saved free pose');
      }finally{reopened.restore();}
    }finally{reentered.restore();}
  }finally{ctx.restore();}
});

test('assembly click-to-carry uses the same single held object and persistent release as ordering',async()=>{
  const c=await setup();
  try{
    const a='assembly:piece-1',b='assembly:piece-2';
    assert.equal(c.controls.interact(hit('piece-1')),true);
    assert.deepEqual([...c.carried],[a],'clicking a piece must really pick it up');
    const first=[2.5,1.45,4.5];
    c.scene.setTranslation(a,first); // Same position the real hand reached.
    c.controls.interact(hit('piece-2'));
    assert.deepEqual([...c.carried],[b],'picking B must immediately release A');
    assert.deepEqual(c.positions.get(a).position,first,'released A must not snap back');
    const key='3d:assembly:free-poses:q1:attempt-1';
    assert.deepEqual(c.runtime.getGameState(key,null)['piece-1'].position,first);
    const second=[-2.7,1.3,3.2];
    c.scene.setTranslation(b,second);
    c.controls.interact({kind:'scene-empty'});
    assert.deepEqual([...c.carried],[],'empty ground releases the single carried piece');
    assert.deepEqual(c.positions.get(b).position,second);
    assert.deepEqual(c.runtime.getGameState(key,null)['piece-2'].position,second);
    assert.equal(c.patches.length,0,'free movement cannot award points');
    // Starting a direct drag from a carried piece must stop follow-by-hand.
    c.controls.interact(hit('piece-1'));
    assert.deepEqual([...c.carried],[a]);
    const from=[first[0]+0.3,first[1],first[2]];
    c.scene.setTranslation(a,from);
    assert.equal(c.controls.drag(hit('piece-1'),'start',{position:from}),true);
    assert.deepEqual([...c.carried],[]);
    const to=[from[0]+0.5,from[1],from[2]-0.4];
    c.controls.drag(hit('piece-1'),'move',{position:to});
    c.controls.drag(hit('piece-1'),'end',{position:to,target:null});
    assert.deepEqual(c.positions.get(a).position,to);
    assert.deepEqual(c.runtime.getGameState(key,null)['piece-1'].position,to);
  }finally{c.restore();}
});
