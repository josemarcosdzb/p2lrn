import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createVirtualJoystick} from '../web/renderers/questionnaire-3d.js';

class FakeElement {
  constructor(tag){
    this.tag=tag;
    this.style={};
    this.children=[];
    this.listeners=new Map();
    this.attributes={};
    this.capture=null;
  }
  append(...nodes){this.children.push(...nodes);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  addEventListener(name,fn){
    if(!this.listeners.has(name))this.listeners.set(name,new Set());
    this.listeners.get(name).add(fn);
  }
  removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
  dispatch(name,event){
    for(const fn of this.listeners.get(name)??[])fn(event);
  }
  setPointerCapture(id){this.capture=id;}
  releasePointerCapture(id){if(this.capture===id)this.capture=null;}
  getBoundingClientRect(){return {left:10,top:10,width:120,height:120};}
}

const source=(path)=>readFile(fileURLToPath(new URL(path,import.meta.url)),'utf8');
const touch=(id,x,y)=>({
  pointerId:id,pointerType:'touch',button:0,clientX:x,clientY:y,
  prevented:false,preventDefault(){this.prevented=true;},
});

test('mobile joystick moves analog, clamps diagonals, resets on release and cancel',()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:(tag)=>new FakeElement(tag),documentElement:{lang:'es'}};
  try{
    const values=[];
    const joystick=createVirtualJoystick({setMovementVector:(x,y)=>values.push([x,y])});
    const pad=joystick.element;
    const knob=pad.children[0].children[0];
    assert.equal(pad.className,'p2lrn-3d-joystick');
    const down=touch(7,70,70);
    pad.dispatch('pointerdown',down);
    assert.equal(down.prevented,true);
    assert.deepEqual(values.at(-1),[0,0]);
    const up=touch(7,70,30);
    pad.dispatch('pointermove',up);
    assert.ok(values.at(-1)[1]>0.95,'upward thumbstick moves forward');
    pad.dispatch('pointermove',touch(7,110,30));
    assert.ok(Math.hypot(...values.at(-1))<=1.001,'diagonal speed is capped');
    const previousCount=values.length;
    pad.dispatch('pointermove',touch(8,0,0));
    assert.equal(values.length,previousCount,'other touches cannot hijack the thumbstick');
    pad.dispatch('pointerup',touch(7,110,30));
    assert.deepEqual(values.at(-1),[0,0]);
    assert.equal(knob.style.transform,'translate3d(0,0,0)');
    pad.dispatch('pointerdown',touch(9,70,70));
    pad.dispatch('pointermove',touch(9,110,70));
    pad.dispatch('pointercancel',touch(9,110,70));
    assert.deepEqual(values.at(-1),[0,0]);
    joystick.destroy();
    assert.equal(pad.listeners.get('pointermove').size,0,'listeners cleaned up');
  }finally{
    if(previous===undefined)delete globalThis.document;
    else globalThis.document=previous;
  }
});

test('3D input is scene-first on PC and mobile, while retaining WebGL fallback',async()=>{
  const [render,engine,css,locales]=await Promise.all([
    source('../web/renderers/questionnaire-3d.js'),
    source('../web/game-3d/three-runtime.js'),
    source('../web/questionnaire-games.css'),
    source('../web/renderers/ui-i18n.js'),
  ]);
  assert.match(engine,/velocity\.addScaledVector\(forward,analogMovement\.y\)/);
  assert.match(engine,/velocity\.addScaledVector\(right,analogMovement\.x\)/);
  assert.match(engine,/velocity\.clampLength\(0,1\)/);
  assert.match(engine,/canvas\.focus\(\{preventScroll:true\}\)/);
  assert.match(engine,/onDrag\(drag\.source,'cancel',\{event\}\);\s*raycastInteraction\(event\)/);
  assert.match(render,/Haz clic en la escena para entrar/);
  assert.match(render,/createVirtualJoystick\(scene\)/);
  assert.match(render,/ordering-3d':/);
  assert.match(render,/matching-3d':/);
  assert.match(render,/classification-3d':/);
  assert.doesNotMatch(render,/p2lrn-3d-move-pad|Recentrar jugador/);
  assert.doesNotMatch(render,/if\(scene\.playerDistanceTo\(/);
  assert.match(render,/p2lrn-3d-alternative/);
  assert.match(render,/createAccessibleOnlyScene/);
  assert.match(css,/@media \(any-pointer:coarse\)/);
  assert.match(css,/touch-action:none/);
  assert.match(css,/p2lrn-3d-alternative:focus-within/);
  assert.match(locales,/"Haz clic en la escena para entrar": "Click the scene to enter"/);
});
