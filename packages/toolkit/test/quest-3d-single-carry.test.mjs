import assert from 'node:assert/strict';
import test from 'node:test';
import {buildOrderingControls,buildClassificationControls} from '../web/renderers/questionnaire-3d.js';

// Deliberately non-exclusive mock: the controller must release old selections.
// A permissive scene is what allowed several boxes to pile up in the Player.
class Node {
  constructor(tag){
    this.tag=tag;this.children=[];this.listeners=new Map();this.attributes=new Map();
    this.textContent='';this.value='';this.className='';
    const classes=new Set();
    this.classList={
      add:name=>classes.add(name),remove:name=>classes.delete(name),
      toggle:(name,forced)=>{if(forced===false){classes.delete(name);return false;}
        if(forced===true){classes.add(name);return true;}
        if(classes.has(name)){classes.delete(name);return false;}classes.add(name);return true;},
      contains:name=>classes.has(name),
    };
  }
  append(...nodes){this.children.push(...nodes);}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  addEventListener(name,callback){
    if(!this.listeners.has(name))this.listeners.set(name,[]);
    this.listeners.get(name).push(callback);
  }
  click(){for(const fn of this.listeners.get('click')??[])fn({target:this});}
}
function fixture(){
  const held=new Set(),highlights=new Set(),locations=new Map(),patches=[],orderAnswers=[];
  const scene={
    addBox:({id,position})=>locations.set(id,[...position]),
    addZone:()=>{},
    carry:(id,active=true)=>{if(active)held.add(id);else held.delete(id);return active;},
    highlight:(id,active=true)=>{if(active)highlights.add(id);else highlights.delete(id);},
    setTranslation:(id,position)=>{locations.set(id,[...position]);return true;},
  };
  const runtime={
    state:{completed:false},
    getGameState:(_key,defaultValue)=>defaultValue,
    setGameState:()=>{},
    answer:()=>({order:[],classifications:{}}),
    replaceAnswer:(_question,answer)=>orderAnswers.push(answer),
    applyPatch:(_question,patch)=>patches.push(patch),
  };
  return {scene,runtime,held,highlights,locations,patches,orderAnswers,status:new Node('p')};
}
function setup(builder,trial){
  const old=globalThis.document;
  globalThis.document={createElement:tag=>new Node(tag),documentElement:{lang:'es'}};
  try{
    const state=fixture();
    const controls=builder({...state,trial});
    return {...state,controls,restore(){
      if(old===undefined)delete globalThis.document;else globalThis.document=old;
    }};
  }catch(error){
    if(old===undefined)delete globalThis.document;else globalThis.document=old;
    throw error;
  }
}
const objects=[{id:'a',text:'A'},{id:'b',text:'B'},{id:'c',text:'C'}];
const orderTrial={questionId:'q-order',prompt:'Ordena los bloques',objects,correctOrder:['a','b','c']};
const classTrial={questionId:'q-class',prompt:'Clasifica los bloques',objects,
  categories:[{id:'cat-1',text:'Primera'},{id:'cat-2',text:'Segunda'}],
  assignments:[{itemId:'a',categoryId:'cat-1'},{itemId:'b',categoryId:'cat-2'},{itemId:'c',categoryId:'cat-1'}]};
const click=(controls,kind,id)=>controls.interact({kind,id});
const sorted=set=>[...set].sort();

test('ordering 3D releases the previous carried object on picking a different one',()=>{
  const c=setup(buildOrderingControls,orderTrial);
  try{
    click(c.controls,'ordering-object','a');
    assert.deepEqual(sorted(c.held),['order:a']);
    click(c.controls,'ordering-object','b');
    assert.deepEqual(sorted(c.held),['order:b'],'A must drop before B is picked');
    assert.deepEqual(sorted(c.highlights),['order:b'],'former highlight must clear');
    click(c.controls,'ordering-object','b');
    assert.deepEqual(sorted(c.held),[],'clicking the carried object again should release it');
    click(c.controls,'ordering-object','c');
    assert.deepEqual(sorted(c.held),['order:c']);
    assert.equal(c.orderAnswers.length,0,'switching carried objects must not submit a response');
  }finally{c.restore();}
});

test('starting a pointer drag releases a previously click-carried ordering object',()=>{
  const c=setup(buildOrderingControls,orderTrial);
  try{
    click(c.controls,'ordering-object','a');
    assert.deepEqual(sorted(c.held),['order:a']);
    assert.equal(c.controls.drag({kind:'ordering-object',id:'b'},'start'),true);
    assert.deepEqual(sorted(c.held),[],'dragging B must release the carried A');
    assert.deepEqual(sorted(c.highlights),['order:b']);
    assert.equal(c.controls.drag({kind:'ordering-object',id:'b'},'cancel'),true);
    assert.deepEqual(sorted(c.highlights),[]);
    click(c.controls,'ordering-object','a');
    assert.deepEqual(sorted(c.held),['order:a']);
    c.controls.interact({kind:'ordering-slot',index:0});
    assert.deepEqual(sorted(c.held),[],'placing A must release A');
    assert.deepEqual(c.orderAnswers.at(-1),{order:[]},'partial order is not an earned answer');
  }finally{c.restore();}
});

test('classification 3D releases previous carried object, rejects solved objects',()=>{
  const c=setup(buildClassificationControls,classTrial);
  try{
    click(c.controls,'classification-object','a');
    assert.deepEqual(sorted(c.held),['classify:a']);
    click(c.controls,'classification-object','b');
    assert.deepEqual(sorted(c.held),['classify:b']);
    assert.deepEqual(sorted(c.highlights),['classify:b']);
    c.controls.interact({kind:'classification-category',id:'cat-2'});
    assert.deepEqual(sorted(c.held),[]);
    assert.deepEqual(c.patches,[{kind:'classification-set',itemId:'b',categoryId:'cat-2'}]);
    click(c.controls,'classification-object','b');
    assert.deepEqual(sorted(c.held),[],'a solved object cannot be carried again');
    click(c.controls,'classification-object','a');
    assert.deepEqual(sorted(c.held),['classify:a']);
    c.controls.drag({kind:'classification-object',id:'c'},'start');
    assert.deepEqual(sorted(c.held),[],'dragging C releases carried A');
    c.controls.drag({kind:'classification-object',id:'c'},'cancel');
    assert.deepEqual(sorted(c.highlights),[]);
    assert.equal(c.patches.length,1,'switching and invalid dragging never adds scores');
  }finally{c.restore();}
});
