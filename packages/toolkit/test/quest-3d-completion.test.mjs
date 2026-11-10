import assert from 'node:assert/strict';
import test from 'node:test';
import {incompleteThreeDTrials} from '../web/renderers/questionnaire-3d.js';
import {finishPanel} from '../web/renderers/game-common.js';

const trials=[
  {type:'ordering-3d',questionId:'ordering',prompt:'Ordena tres cajas',
    objects:[{id:'a'},{id:'b'},{id:'c'}]},
  {type:'matching-3d',questionId:'matching',prompt:'Relaciona países',
    connections:[{leftId:'sp',rightId:'madrid'},{leftId:'fr',rightId:'paris'}]},
  {type:'classification-3d',questionId:'classify',prompt:'Clasifica objetos',
    assignments:[{itemId:'one',categoryId:'circle'},{itemId:'two',categoryId:'square'}]},
  {type:'assembly-3d',questionId:'assemble',prompt:'Ensambla piezas',
    scene:{links:[{pieceId:'leg',targetId:'leg-slot'},{pieceId:'tail',targetId:'tail-slot'}]}},
];
function pending(answers){return incompleteThreeDTrials(trials,id=>answers[id]??{});}

test('four 3D challenges cannot finish while incomplete, including partial saved answers',()=>{
  const answers={};
  assert.deepEqual(pending(answers).map(p=>p.remaining),[3,2,2,2]);
  answers.ordering={order:['a',null,'c']};
  answers.matching={pairs:{sp:'madrid'}};
  answers.classify={classifications:{one:'circle'}};
  answers.assemble={classifications:{leg:'leg-slot'}};
  assert.deepEqual(pending(answers).map(p=>p.remaining),[1,1,1,1]);
  answers.ordering={order:['c','a','b']}; // Fully attempted, may be graded wrong.
  answers.matching={pairs:{sp:'madrid',fr:'paris'}};
  answers.classify={classifications:{one:'circle',two:'square'}};
  answers.assemble={classifications:{leg:'leg-slot',tail:'tail-slot'}};
  assert.deepEqual(pending(answers),[]);
});

test('wrong category and malformed duplicates never unlock unfinished challenges',()=>{
  const answers={
    ordering:{order:['a','a','b']},
    matching:{pairs:{sp:'paris',fr:'paris'}},
    classify:{classifications:{one:'square',two:'square'}},
    assemble:{classifications:{leg:'tail-slot',tail:'tail-slot'}},
  };
  assert.deepEqual(pending(answers).map(p=>p.remaining),[1,1,1,1]);
});

class FakeNode {
  constructor(tag){
    this.tag=tag;this.children=[];this.disabled=false;this.textContent='';
    this.attributes=new Map();this.listeners=new Map();
  }
  append(...children){this.children.push(...children);}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  addEventListener(event,listener){
    const handlers=this.listeners.get(event)??[];
    handlers.push(listener);this.listeners.set(event,handlers);
  }
  async click(){for(const fn of this.listeners.get('click')??[])await fn({target:this});}
  querySelectorAll(selector){
    const result=[];
    const visit=node=>{
      for(const child of node.children){
        if(selector.split(',').includes(child.tag))result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }
}

test('3D finish button warns and reviews missing tasks instead of submitting partial scores',async()=>{
  const old=globalThis.document;
  globalThis.document={createElement:tag=>new FakeNode(tag),documentElement:{lang:'es'}};
  try{
    const answers={},shell=new FakeNode('section'),visited=[];
    let finishCalls=0;
    const runtime={
      state:{completed:false},
      payload:{presentation:{showFeedback:'never'}},
      async finish(){finishCalls++;this.state.completed=true;return {pointsEarned:3,pointsPossible:3,normalized:1};},
    };
    const panel=finishPanel(runtime,shell,{
      checkPending:()=>pending(answers),
      onIncomplete:task=>visited.push(task.index),
    });
    assert.equal(panel.finish.textContent,'Revisar pendientes');
    assert.match(shell.children[0].textContent,/Pruebas pendientes: .*Ordena tres cajas/);
    await panel.finish.click();
    assert.equal(finishCalls,0,'unfinished activity cannot invoke runtime.finish()');
    assert.deepEqual(visited,[0],'review action navigates to first unfinished challenge');
    assert.match(panel.status.textContent,/No puedes finalizar/);
    answers.ordering={order:['b','a','c']};
    answers.matching={pairs:{sp:'madrid',fr:'paris'}};
    answers.classify={classifications:{one:'circle',two:'square'}};
    answers.assemble={classifications:{leg:'leg-slot',tail:'tail-slot'}};
    panel.refresh();
    assert.equal(panel.finish.textContent,'Finalizar actividad');
    await panel.finish.click();
    assert.equal(finishCalls,1,'only complete attempts can be submitted');
    assert.equal(panel.finish.disabled,true);
    await panel.finish.click();
    assert.equal(finishCalls,1,'completed session cannot be submitted twice');
  }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});
