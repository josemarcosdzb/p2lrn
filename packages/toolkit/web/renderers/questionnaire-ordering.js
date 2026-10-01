import {ORDERING_RENDERER} from '../renderer-registry.js';
import {hashText, shuffleDeterministic} from '../questionnaire-games-core.js';
import {el, finishPanel, setupGame, statusNode, stylesheets} from './game-common.js';
export {stylesheets};

function shuffled(items,seed){
  if(items.length<2)return [...items];
  let result=shuffleDeterministic(items,seed);
  const same=result.every((item,index)=>item.id===items[index].id);
  if(same)result=[...result.slice(1),result[0]];
  return result;
}
function move(items,from,to){
  const next=[...items];
  const [item]=next.splice(from,1);
  next.splice(Math.max(0,Math.min(to,next.length)),0,item);
  return next;
}

export async function render(options){
  const {game,runtime,shell}=await setupGame({...options,rendererId:ORDERING_RENDERER});
  const sequences=game.data.sequences;
  let index=0;
  let current=shuffled(sequences[0]?.items??[],hashText(`${options.context?.contentRoot??''}|order|0`));
  let dragging=null;
  let pointerStart=null;
  const board=el('div',{class:'p2lrn-game-board'});
  const tabs=el('div',{class:'p2lrn-game-actions',role:'tablist','aria-label':'Secuencias de ordenación'});
  const list=el('div');
  const status=statusNode('Arrastra y suelta los elementos hasta reconstruir el orden correcto.');

  const sequence=()=>sequences[index];
  const sync=()=>runtime.replaceAnswer(sequence().questionId,{order:current.map((item)=>item.id)});
  const resetForIndex=()=>{
    current=shuffled(sequence().items,hashText(`${options.context?.contentRoot??''}|order|${index}`));
    dragging=null;pointerStart=null;sync();redraw();
    status.textContent='Arrastra y suelta los elementos hasta reconstruir el orden correcto.';
  };
  const performMove=(from,to)=>{
    if(from===to||from<0||to<0)return;
    current=move(current,from,to);
    sync();redraw();
    status.textContent='Orden modificado. Sigue arrastrando o comprueba el resultado.';
  };
  const redrawTabs=()=>{
    tabs.replaceChildren();
    sequences.forEach((item,itemIndex)=>{
      const button=el('button',{type:'button',class:'p2lrn-game-button',role:'tab','aria-selected':itemIndex===index},`Secuencia ${itemIndex+1}`);
      if(itemIndex===index)button.classList.add('is-selected');
      button.addEventListener('click',()=>{index=itemIndex;resetForIndex();redrawTabs();});
      tabs.append(button);
    });
  };
  const redraw=()=>{
    list.replaceChildren();
    current.forEach((item,itemIndex)=>{
      const row=el('div',{class:'p2lrn-order-row',draggable:'true','data-order-index':itemIndex});
      const handle=el('button',{type:'button',class:'p2lrn-game-card','aria-label':`Mover ${item.text}`},item.text);
      const controls=el('div',{class:'p2lrn-order-controls'});
      const up=el('button',{type:'button',class:'p2lrn-game-button',disabled:itemIndex===0,'aria-label':`Subir ${item.text}`},'↑');
      const down=el('button',{type:'button',class:'p2lrn-game-button',disabled:itemIndex===current.length-1,'aria-label':`Bajar ${item.text}`},'↓');
      up.addEventListener('click',()=>performMove(itemIndex,itemIndex-1));
      down.addEventListener('click',()=>performMove(itemIndex,itemIndex+1));
      row.addEventListener('dragstart',(event)=>{dragging=item.id;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.id);});
      row.addEventListener('dragover',(event)=>{event.preventDefault();event.dataTransfer.dropEffect='move';});
      row.addEventListener('drop',(event)=>{event.preventDefault();const id=event.dataTransfer.getData('text/plain')||dragging;performMove(current.findIndex((entry)=>entry.id===id),itemIndex);dragging=null;});
      handle.addEventListener('pointerdown',(event)=>{if(event.pointerType==='mouse')return;pointerStart={id:item.id,y:event.clientY};handle.setPointerCapture?.(event.pointerId);});
      handle.addEventListener('pointermove',(event)=>{
        if(!pointerStart||event.pointerType==='mouse')return;
        const root=list.getRootNode();
        const hit=(typeof root.elementFromPoint==='function'?root.elementFromPoint(event.clientX,event.clientY):document.elementFromPoint(event.clientX,event.clientY))?.closest?.('[data-order-index]');
        if(hit){const target=Number(hit.dataset.orderIndex);const from=current.findIndex((entry)=>entry.id===pointerStart.id);if(target!==from)performMove(from,target);}
      });
      handle.addEventListener('pointerup',()=>{pointerStart=null;});
      handle.addEventListener('pointercancel',()=>{pointerStart=null;});
      controls.append(up,down);row.append(handle,controls);list.append(row);
    });
  };

  const actions=el('div',{class:'p2lrn-game-actions'});
  const check=el('button',{type:'button',class:'p2lrn-game-button'},'Comprobar');
  const reshuffle=el('button',{type:'button',class:'p2lrn-game-button'},'Mezclar de nuevo');
  check.addEventListener('click',()=>{
    const correct=sequence().items.every((item,pos)=>current[pos]?.id===item.id);
    status.textContent=correct?'Orden correcto.':'Todavía hay elementos fuera de posición.';
    if(correct&&sequences.length===1)void runtime.finish().then((score)=>{if(score)status.textContent=`Orden correcto: ${score.pointsEarned}/${score.pointsPossible} puntos.`;});
  });
  reshuffle.addEventListener('click',()=>{
    const seed=hashText(`${Date.now()}|${sequence().questionId}|${current.map((x)=>x.id).join('|')}`);
    current=shuffled(sequence().items,seed);dragging=null;pointerStart=null;sync();redraw();
    status.textContent='Elementos mezclados de nuevo. Arrástralos para ordenar.';
  });
  actions.append(check,reshuffle);
  redrawTabs();sync();redraw();board.append(tabs,list,actions);shell.append(board,status);finishPanel(runtime,shell);return runtime;
}
