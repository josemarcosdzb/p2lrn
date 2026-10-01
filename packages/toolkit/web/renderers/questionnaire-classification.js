import {CLASSIFICATION_RENDERER} from '../renderer-registry.js';
import {classificationIsCorrect} from '../game-3d-mechanics.js';
import {el, finishPanel, setupGame, statusNode, stylesheets} from './game-common.js';

export {stylesheets};

export async function render(options) {
  const {game,runtime,shell}=await setupGame({...options,rendererId:CLASSIFICATION_RENDERER});
  const board=el('div',{class:'p2lrn-game-board'});
  const status=statusNode('Selecciona un elemento y después su categoría.');
  let trialIndex=0;

  function renderTrial() {
    board.replaceChildren();
    const trial=game.data.trials[trialIndex];
    const expected=new Map(trial.assignments.map((item)=>[item.itemId,item.categoryId]));
    const values={...runtime.answer(trial.questionId).classifications};
    const selected=new Set();

    board.append(
      el('p',{class:'p2lrn-game-description'},`Prueba ${trialIndex+1} de ${game.data.trials.length}`),
      el('h3',{},trial.prompt),
    );

    const objectWrap=el('div',{class:'p2lrn-memory-grid'});
    const categoryWrap=el('div',{class:'p2lrn-game-actions'});
    const objectButtons=new Map();

    function refresh() {
      for(const [itemId,button] of objectButtons){
        button.classList.toggle('is-selected',selected.has(itemId));
        button.classList.toggle('is-solved',Boolean(values[itemId]));
        button.disabled=Boolean(values[itemId]);
      }
    }

    for(const item of trial.objects){
      const button=el('button',{type:'button',class:'p2lrn-game-card'},item.text);
      button.addEventListener('click',()=>{
        selected.clear();
        selected.add(item.id);
        refresh();
        status.textContent='Elemento seleccionado. Elige una categoría.';
      });
      objectButtons.set(item.id,button);
      objectWrap.append(button);
    }

    for(const category of trial.categories){
      const button=el('button',{type:'button',class:'p2lrn-game-choice'},category.text);
      button.addEventListener('click',()=>{
        const itemId=[...selected][0];
        if(!itemId){status.textContent='Selecciona primero un elemento.';return;}
        if(expected.get(itemId)!==category.id){status.textContent='Esa categoría no es correcta.';return;}
        values[itemId]=category.id;
        runtime.applyPatch(trial.questionId,{kind:'classification-set',itemId,categoryId:category.id});
        selected.clear();
        refresh();
        status.textContent=classificationIsCorrect(values,expected)
          ? 'Clasificación completada correctamente.'
          : 'Correcto. Continúa con el siguiente elemento.';
      });
      categoryWrap.append(button);
    }

    const nav=el('div',{class:'p2lrn-game-actions'});
    const previous=el('button',{type:'button',class:'p2lrn-game-button',disabled:trialIndex===0},'Anterior');
    const next=el('button',{type:'button',class:'p2lrn-game-button',disabled:trialIndex===game.data.trials.length-1},'Siguiente');
    previous.addEventListener('click',()=>{trialIndex-=1;renderTrial();});
    next.addEventListener('click',()=>{trialIndex+=1;renderTrial();});
    nav.append(previous,next);

    board.append(objectWrap,categoryWrap,nav);
    refresh();
  }

  renderTrial();
  shell.append(board);
  finishPanel(runtime,shell);
  shell.append(status);
  return runtime;
}
