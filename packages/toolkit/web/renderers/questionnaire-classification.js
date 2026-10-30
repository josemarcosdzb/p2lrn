import {CLASSIFICATION_RENDERER} from '../renderer-registry.js';
import {classificationIsCorrect} from '../game-3d-mechanics.js';
import {el, finishPanel, setupGame, statusNode, stylesheets} from './game-common.js';

export {stylesheets};

export async function render(options) {
  const {game,runtime,shell}=await setupGame({...options,rendererId:CLASSIFICATION_RENDERER});
  const board=el('div',{class:'p2lrn-classification-board'});
  const status=statusNode('Arrastra cada ficha a su categoría. También puedes seleccionar una ficha y pulsar una categoría.');
  let trialIndex=0;
  let dragGhost=null;

  function renderTrial() {
    board.replaceChildren();
    dragGhost?.remove();
    dragGhost=null;
    const trial=game.data.trials[trialIndex];
    const values={...runtime.answer(trial.questionId).classifications};
    let selected=null;
    let busy=false;
    const itemButtons=new Map();
    const categoryBoxes=new Map();

    const header=el('div',{class:'p2lrn-classification-prompt'});
    header.append(
      el('strong',{},trial.prompt),
      el('span',{},`Prueba ${trialIndex+1} de ${game.data.trials.length}`),
    );
    const pool=el('div',{class:'p2lrn-classification-pool',role:'group','aria-label':'Fichas pendientes'});
    const categories=el('div',{class:'p2lrn-classification-categories'});

    const refresh=()=>{
      const solvedCount=Object.keys(values).length;
      for(const item of trial.objects){
        const button=itemButtons.get(item.id);
        if(!button) continue;
        const solved=Boolean(values[item.id]);
        button.hidden=solved;
        button.classList.toggle('is-selected',selected===item.id);
      }
      for(const category of trial.categories){
        const box=categoryBoxes.get(category.id);
        if(!box) continue;
        const body=box.querySelector('.p2lrn-classification-box-items');
        body.replaceChildren();
        trial.objects.filter((item)=>values[item.id]===category.id).forEach((item)=>{
          const placed=el('button',{type:'button','data-p2lrn-placed':item.id,'aria-label':`Cambiar categoría de ${item.text}`},item.text);
          placed.addEventListener('click',()=>{delete values[item.id];runtime.replaceAnswer(trial.questionId,{classifications:{...values}});selected=item.id;refresh();status.textContent='Elige otra categoría para la ficha.';});
          body.append(placed);
        });
      }
      if(solvedCount===trial.objects.length){
        status.textContent='Has colocado todas las fichas. Finaliza para entregar tus respuestas.';
      }
    };

    const place=(itemId,categoryId)=>{
      if(busy || !trial.categories.some((category)=>category.id===categoryId)) return false;
      busy=true;
      values[itemId]=categoryId;
      runtime.replaceAnswer(trial.questionId,{classifications:{...values}});
      selected=null;
      busy=false;
      refresh();
      status.textContent='Ficha colocada. Puedes cambiarla de categoría antes de finalizar.';
      return true;
    };

    const hitCategory=(x,y)=>{
      const root=board.getRootNode();
      const node=typeof root.elementFromPoint==='function'
        ? root.elementFromPoint(x,y)
        : document.elementFromPoint(x,y);
      const box=node?.closest?.('[data-p2lrn-category]');
      return box && board.contains(box) ? box.dataset.p2lrnCategory : null;
    };

    for(const item of trial.objects){
      const button=el('button',{
        type:'button',
        class:'p2lrn-game-card p2lrn-classification-item',
        draggable:'true',
        'data-p2lrn-item':item.id,
      },item.text);
      let pointerStart=null;
      button.addEventListener('click',()=>{
        if(values[item.id]) return;
        selected=selected===item.id?null:item.id;
        refresh();
      });
      button.addEventListener('dragstart',(event)=>{
        if(values[item.id]){event.preventDefault();return;}
        event.dataTransfer.effectAllowed='move';
        event.dataTransfer.setData('text/plain',item.id);
        selected=item.id;
        refresh();
      });
      button.addEventListener('dragend',()=>{selected=null;refresh();});
      button.addEventListener('pointerdown',(event)=>{
        if(event.pointerType==='mouse'||values[item.id]) return;
        pointerStart={id:item.id,x:event.clientX,y:event.clientY,moved:false};
      });
      button.addEventListener('pointermove',(event)=>{
        if(!pointerStart||event.pointerType==='mouse') return;
        if(!pointerStart.moved&&Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)<8) return;
        pointerStart.moved=true;
        selected=item.id;
        if(!dragGhost){
          dragGhost=el('span',{class:'p2lrn-classification-drag-preview','aria-hidden':'true'},item.text);
          board.append(dragGhost);
        }
        dragGhost.style.left=`${event.clientX}px`;
        dragGhost.style.top=`${event.clientY}px`;
        const over=hitCategory(event.clientX,event.clientY);
        categoryBoxes.forEach((box,id)=>box.classList.toggle('is-over',id===over));
      });
      button.addEventListener('pointerup',(event)=>{
        if(pointerStart?.moved){
          const categoryId=hitCategory(event.clientX,event.clientY);
          if(categoryId) place(item.id,categoryId);
        }
        pointerStart=null;
        dragGhost?.remove();
        dragGhost=null;
        categoryBoxes.forEach((box)=>box.classList.remove('is-over'));
      });
      button.addEventListener('pointercancel',()=>{
        pointerStart=null;
        dragGhost?.remove();
        dragGhost=null;
        categoryBoxes.forEach((box)=>box.classList.remove('is-over'));
      });
      itemButtons.set(item.id,button);
      pool.append(button);
    }

    for(const category of trial.categories){
      const box=el('div',{
        class:'p2lrn-classification-box',
        role:'button',
        tabindex:'0',
        'aria-label':`Categoría ${category.text}`,
        'data-p2lrn-category':category.id,
      });
      box.append(
        el('strong',{class:'p2lrn-classification-box-title'},category.text),
        el('div',{class:'p2lrn-classification-box-items'}),
      );
      box.addEventListener('click',()=>{if(selected) place(selected,category.id);});
      box.addEventListener('keydown',(event)=>{
        if((event.key==='Enter'||event.key===' ')&&selected){
          event.preventDefault();
          place(selected,category.id);
        }
      });
      box.addEventListener('dragover',(event)=>{
        event.preventDefault();
        event.dataTransfer.dropEffect='move';
        box.classList.add('is-over');
      });
      box.addEventListener('dragleave',(event)=>{
        if(!box.contains(event.relatedTarget)) box.classList.remove('is-over');
      });
      box.addEventListener('drop',(event)=>{
        event.preventDefault();
        box.classList.remove('is-over');
        const itemId=event.dataTransfer.getData('text/plain');
        if(itemId) place(itemId,category.id);
      });
      categoryBoxes.set(category.id,box);
      categories.append(box);
    }

    const nav=el('div',{class:'p2lrn-game-actions'});
    const previous=el('button',{type:'button',class:'p2lrn-game-button',disabled:trialIndex===0},'Anterior');
    const next=el('button',{type:'button',class:'p2lrn-game-button',disabled:trialIndex===game.data.trials.length-1},'Siguiente');
    const restart=el('button',{type:'button',class:'p2lrn-game-button'},'Reiniciar clasificación');
    previous.addEventListener('click',()=>{trialIndex-=1;renderTrial();});
    next.addEventListener('click',()=>{trialIndex+=1;renderTrial();});
    restart.addEventListener('click',()=>{
      for(const key of Object.keys(values)) delete values[key];
      selected=null;
      refresh();
      status.textContent='Clasificación reiniciada.';
    });
    nav.append(previous,next,restart);

    board.append(header,pool,categories,nav);
    refresh();
  }

  renderTrial();
  shell.append(board);
  finishPanel(runtime,shell);
  shell.append(status);
  return runtime;
}
