import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioHistory} from '../web/studio/studio-history.js';
import {modifyStudioTable,objectTransform,percentDiagramGeometry} from '../web/studio/studio-object-tools.js';

const make=(key,html='<p>Original</p>')=>({
  dataset:{studioHtmlKey:key},innerHTML:html,isContentEditable:true,
  dispatches:0,
  dispatchEvent(){this.dispatches++;return true;}
});

test('undo and redo include inserts, design and geometric object changes',()=>{
  const history=createStudioHistory();
  const s=make('lesson-a');
  history.activate(s);
  s.innerHTML='<p>Original</p><table><tr><td>A</td></tr></table>';
  history.record(s,{kind:'command'});
  s.innerHTML=s.innerHTML.replace('<table','<table style="background-color:blue"');
  history.record(s,{kind:'command'});
  s.innerHTML=s.innerHTML.replace('background-color:blue','background-color:blue;width:410px;transform:translate(25px,12px)');
  history.record(s,{kind:'command'});
  assert.equal(history.canUndo(),true);
  assert.equal(history.undo(s),true);
  assert.equal(s.innerHTML.includes('translate'),false,'undo size and position');
  assert.equal(history.undo(s),true);
  assert.equal(s.innerHTML.includes('background-color'),false,'undo design');
  assert.equal(history.undo(s),true);
  assert.equal(s.innerHTML,'<p>Original</p>','undo insertion');
  assert.equal(history.canUndo(),false);
  for(let i=0;i<3;i++)assert.equal(history.redo(s),true);
  assert.match(s.innerHTML,/translate/);
  assert.equal(history.canRedo(),false);
  assert.equal(s.dispatches,6,'all restored versions were persisted through input');
});
test('history is retained independently when navigating across lesson surfaces',()=>{
  const history=createStudioHistory();
  const a=make('lesson-a'),b=make('lesson-b','<p>Segundo</p>');
  history.activate(a);a.innerHTML+='<h2>Uno</h2>';history.record(a);
  history.activate(b);b.innerHTML+='<h2>Dos</h2>';history.record(b);
  history.activate(a);assert.equal(history.canUndo(),true);
  history.undo(a);assert.equal(a.innerHTML,'<p>Original</p>');
  history.activate(b);assert.equal(history.canUndo(),true);
  history.undo(b);assert.equal(b.innerHTML,'<p>Segundo</p>');
});
test('redo is invalidated by a new edit after undo and reset clears old courses',()=>{
  const history=createStudioHistory();
  const s=make('activity-1');
  history.activate(s);
  s.innerHTML='one';history.record(s);
  s.innerHTML='two';history.record(s);
  history.undo(s);
  s.innerHTML='alternate';history.record(s);
  assert.equal(history.canRedo(),false);
  history.reset();
  assert.equal(history.canUndo(),false);
  assert.equal(history.size,0);
});
test('table structural helper and history exports remain loadable by Node',()=>{
  assert.equal(typeof createStudioHistory,'function');
  assert.equal(typeof modifyStudioTable,'function');
});

test('large embedded images remain undoable without duplicating base64 in every snapshot',()=>{
  const history=createStudioHistory(),surface=make('image-course');
  history.activate(surface);
  const media='A'.repeat(9000000);
  surface.innerHTML='<img src="data:image/png;base64,'+media+'">';
  history.record(surface,{kind:'media'});
  assert.equal(history.canUndo(),true,'large image insertion must be captured');
  history.undo(surface);
  assert.equal(surface.innerHTML,'<p>Original</p>');
  history.redo(surface);
  assert.equal(surface.innerHTML.length,media.length+'<img src="data:image/png;base64,">'.length);
  assert.equal(surface.innerHTML.includes('p2lrn-history-media:'),false,'internal history tokens must never leak into course content');
  history.reset();
});

test('object rotation composes with translation and rejects invalid geometry',()=>{
  assert.equal(objectTransform(20,-15,0),'translate(20px, -15px)');
  assert.equal(objectTransform(20,-15,90),'translate(20px, -15px) rotate(90deg)');
  assert.equal(objectTransform(-40,30,225),'translate(-40px, 30px) rotate(225deg)');
  assert.throws(()=>objectTransform(NaN,0,0),/Invalid object transform/);
  assert.throws(()=>objectTransform(0,0,Infinity),/Invalid object transform/);
});

test('responsive diagram geometry preserves proportions across viewport widths',()=>{
  const original=percentDiagramGeometry(100,50,200,120,1000,600);
  const scaled=percentDiagramGeometry(50,25,100,60,500,300);
  assert.deepEqual(original,scaled);
  assert.deepEqual(original,{left:10,top:8.3333,width:20,height:20});
  assert.throws(()=>percentDiagramGeometry(1,2,3,4,0,600),/Invalid diagram geometry/);
  assert.throws(()=>percentDiagramGeometry(1,2,3,4,NaN,600),/Invalid diagram geometry/);
});
