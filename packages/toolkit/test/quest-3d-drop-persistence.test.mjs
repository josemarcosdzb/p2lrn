import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOrderingControls,buildClassificationControls,
} from '../web/renderers/questionnaire-3d.js';
import {validLoose3DPosition} from '../web/game-3d-mechanics.js';

class Element{
  constructor(tag){this.tag=tag;this.children=[];this.value='';this.textContent='';this.disabled=false;
    this.events=new Map();this.attributes=new Map();
    const classes=new Set();
    this.classList={add:name=>classes.add(name),remove:name=>classes.delete(name),
      toggle:(name,on)=>on?classes.add(name):classes.delete(name),
      contains:name=>classes.has(name)};
  }
  append(...elements){this.children.push(...elements);}
  addEventListener(name,handler){this.events.set(name,handler);}
  setAttribute(name,value){this.attributes.set(name,String(value));}
}

function setup(builder,trial,{state=new Map(),answers=new Map(),patches=[]}={}){
  const previous=globalThis.document;
  globalThis.document={createElement:tag=>new Element(tag),documentElement:{lang:'es'}};
  const positions=new Map(),carried=new Set(),highlights=new Set();
  const scene={
    addBox:({id,position})=>positions.set(id,[...position]),
    addZone:()=>{},
    getTranslation:id=>positions.get(id)?[...positions.get(id)]:null,
    setTranslation:(id,position)=>{if(!positions.has(id))return false;positions.set(id,[...position]);return true;},
    carry:(id,active=true)=>{
      if(active){carried.clear();carried.add(id);
        // An object click-carried in the real engine follows the hand.
        positions.set(id,[4.1,1.42,4.1]);
      }else carried.delete(id);
      return active;
    },
    highlight:(id,active=true)=>active?highlights.add(id):highlights.delete(id),
  };
  const runtime={
    state:{completed:false},
    answer:id=>answers.get(id)??{order:[],classifications:{}},
    replaceAnswer:(id,answer)=>{answers.set(id,answer);return true;},
    getGameState:(key,fallback)=>state.has(key)?state.get(key):fallback,
    setGameState:(key,value)=>state.set(key,structuredClone(value)),
    applyPatch:(id,patch)=>{
      patches.push({id,patch});
      const previous=runtime.answer(id);
      if(patch.kind==='classification-set')answers.set(id,{
        ...previous,classifications:{...previous.classifications,[patch.itemId]:patch.categoryId}});
      return true;
    },
  };
  const status=new Element('p');
  const controller=builder({trial,runtime,scene,status});
  return {scene,runtime,controller,status,positions,carried,highlights,state,answers,patches,
    restore:()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}};
}
const orderTrial={questionId:'order-retain',prompt:'Ordena',objects:[
  {id:'a',text:'A'},{id:'b',text:'B'}],correctOrder:['a','b']};
const classificationTrial={questionId:'class-retain',prompt:'Clasifica',objects:[
  {id:'a',text:'A'},{id:'b',text:'B'}],categories:[
    {id:'green',text:'Verde'},{id:'blue',text:'Azul'}],assignments:[
    {itemId:'a',categoryId:'green'},{itemId:'b',categoryId:'blue'}]};

test('all dragged ordering objects remain exactly where released on floor or invalid slot',()=>{
  const a=setup(buildOrderingControls,orderTrial);
  try{
    const origin=a.positions.get('order:a');
    assert.equal(a.controller.drag({kind:'ordering-object',id:'a'},'start',{position:origin}),true);
    a.controller.drag({kind:'ordering-object',id:'a'},'move',{position:[2.7,0.72,2.3]});
    a.controller.drag({kind:'ordering-object',id:'a'},'end',{position:[2.7,0.72,2.3],target:null});
    assert.deepEqual(a.positions.get('order:a'),[2.7,0.72,2.3]);
    assert.deepEqual(a.state.get('3d:ordering:order-retain:free-positions').a,[2.7,0.72,2.3]);
    assert.deepEqual(a.runtime.answer(orderTrial.questionId).order,[],'no false scoring');
    const picked=a.positions.get('order:b');
    a.controller.drag({kind:'ordering-object',id:'b'},'start',{position:picked});
    a.controller.drag({kind:'ordering-object',id:'b'},'move',{position:[4.9,0.72,2.8]});
    a.controller.drag({kind:'ordering-object',id:'b'},'cancel');
    assert.deepEqual(a.positions.get('order:b'),[4.9,0.72,2.8],
      'pointercancel must not teleport B back to staging');
    assert.deepEqual(a.positions.get('order:a'),[2.7,0.72,2.3],
      'releasing B must not move A');
    const b=setup(buildOrderingControls,orderTrial,{state:a.state,answers:a.answers,patches:a.patches});
    try{
      assert.deepEqual(b.positions.get('order:a'),[2.7,0.72,2.3],
        'reopening trial must retain released location of A');
      assert.deepEqual(b.positions.get('order:b'),[4.9,0.72,2.8],
        'reopening trial must retain released location of B');
      b.controller.interact({kind:'ordering-object',id:'a'});
      b.controller.interact({kind:'ordering-slot',index:0});
      assert.equal(b.positions.get('order:a')[2]<0,true,'valid slot snaps A to its intended position');
      assert.equal(b.state.get('3d:ordering:order-retain:free-positions').a,undefined,
        'placed box no longer has a free pose');
      b.controller.interact({kind:'ordering-object',id:'a'});
      assert.deepEqual(b.runtime.answer(orderTrial.questionId).order,[],
        'picking an already-placed box invalidates its previously answered slot');
      assert.equal(b.state.get('3d:ordering:order-retain').includes('a'),false);
    }finally{b.restore();}
  }finally{a.restore();}
});

test('classification preserves wrong-category and interrupted drops without awarding points',()=>{
  const a=setup(buildClassificationControls,classificationTrial);
  try{
    const origin=a.positions.get('classify:a');
    a.controller.drag({kind:'classification-object',id:'a'},'start',{position:origin});
    a.controller.drag({kind:'classification-object',id:'a'},'move',{position:[2.1,0.72,3.1]});
    a.controller.drag({kind:'classification-object',id:'a'},'end',{
      position:[2.1,0.72,3.1],target:{kind:'classification-category',id:'blue'},
    });
    assert.deepEqual(a.positions.get('classify:a'),[2.1,0.72,3.1]);
    assert.equal(a.patches.length,0,'wrong category is not scored');
    const bPos=a.positions.get('classify:b');
    a.controller.drag({kind:'classification-object',id:'b'},'start',{position:bPos});
    a.controller.drag({kind:'classification-object',id:'b'},'move',{position:[5.4,0.72,2.2]});
    a.controller.drag({kind:'classification-object',id:'b'},'cancel');
    assert.deepEqual(a.positions.get('classify:b'),[5.4,0.72,2.2],
      'cancel must not restore B to initial coordinates');
    assert.deepEqual(a.positions.get('classify:a'),[2.1,0.72,3.1]);
    const b=setup(buildClassificationControls,classificationTrial,{state:a.state,answers:a.answers,patches:a.patches});
    try{
      assert.deepEqual(b.positions.get('classify:a'),[2.1,0.72,3.1]);
      assert.deepEqual(b.positions.get('classify:b'),[5.4,0.72,2.2]);
      b.controller.interact({kind:'classification-object',id:'a'});
      b.controller.interact({kind:'classification-category',id:'green'});
      assert.deepEqual(b.runtime.answer('class-retain').classifications,{a:'green'});
      assert.equal(b.state.get('3d:classification:class-retain:free-positions').a,undefined);
    }finally{b.restore();}
  }finally{a.restore();}
});

test('click-to-carry also leaves previous object at last hand coordinates when switching',()=>{
  const o=setup(buildOrderingControls,orderTrial);
  try{
    o.controller.interact({kind:'ordering-object',id:'a'});
    assert.deepEqual(o.positions.get('order:a'),[4.1,1.42,4.1]);
    o.controller.interact({kind:'ordering-object',id:'b'});
    assert.deepEqual(o.positions.get('order:a'),[4.1,1.42,4.1]);
    assert.deepEqual(o.state.get('3d:ordering:order-retain:free-positions').a,[4.1,1.42,4.1]);
    assert.deepEqual([...o.carried],['order:b'],'only B may be carried');
  }finally{o.restore();}
});

test('stored 3D coordinates must be finite, in-range and cannot poison mesh physics',()=>{
  assert.equal(validLoose3DPosition([2,0.7,4]),true);
  for(const value of [[NaN,0,0],[Infinity,1,0],[0,-99,0],[99,1,0],[0,1,999],[],{},null]){
    assert.equal(validLoose3DPosition(value),false,JSON.stringify(value));
  }
  const state=new Map([['3d:ordering:order-retain:free-positions',
    {a:[Infinity,1,1],b:[99,1,1],__proto__:{toString:null}}]]);
  const c=setup(buildOrderingControls,orderTrial,{state});
  try{
    assert.ok(validLoose3DPosition(c.positions.get('order:a')));
    assert.ok(validLoose3DPosition(c.positions.get('order:b')));
  }finally{c.restore();}
});
