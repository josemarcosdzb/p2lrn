import {ORDERING_RENDERER} from '../renderer-registry.js';

import {el, finishPanel, setupGame, statusNode, stylesheets} from './game-common.js';
export {stylesheets};

function mixed(items,variant=0){
  if(items.length<=1)return [...items];
  if(items.length===2)return [...items].reverse();
  const perTurn=items.length-1;
  const offset=1+(Math.abs(variant)%perTurn);
  let result=[...items.slice(offset),...items.slice(0,offset)];
  if(Math.floor(Math.abs(variant)/perTurn)%2===0)result=result.reverse();
  if(result.every((item,index)=>item.id===items[index].id))[result[0],result[1]]=[result[1],result[0]];
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
  let mixVariant=0;
  let current=mixed(sequences[0]?.items??[],0);
  let dragging=null;
  let pointerStart=null;
  const board=el('div',{class:'p2lrn-game-board'});
  const tabs=el('div',{class:'p2lrn-game-actions',role:'tablist','aria-label':'Secuencias de ordenación'});
  const list=el('div');
  const status=statusNode('Arrastra y suelta los elementos hasta reconstruir el orden correcto.');

  const sequence=()=>sequences[index];
  const sync=()=>runtime.replaceAnswer(sequence().questionId,{order:current.map((item)=>item.id)});
  const resetForIndex=()=>{
    mixVariant=0;
    current=mixed(sequence().items,0);
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
      const button=el('button',{type:'button',class:'p2lrn-game-button',role:'tab','aria-selected':itemIndex===index},`Reto ${itemIndex+1}`);
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
      handle.addEventListener('keydown',(event)=>{
        const from=current.findIndex((entry)=>entry.id===item.id);
        if(event.altKey&&event.key==='ArrowUp'&&from>0){event.preventDefault();performMove(from,from-1);}
        if(event.altKey&&event.key==='ArrowDown'&&from<current.length-1){event.preventDefault();performMove(from,from+1);}
      });
      handle.addEventListener('pointerdown',(event)=>{
        if(event.pointerType==='mouse'&&event.button!==0)return;
        pointerStart={id:item.id,y:event.clientY};
        handle.setPointerCapture?.(event.pointerId);
        status.textContent='Arrastrando. Suelta el elemento en la posición deseada.';
      });
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
    let next=current;
    const maxAttempts=Math.max(2,sequence().items.length*2);
    for(let attempt=0;attempt<maxAttempts;attempt+=1){
      mixVariant+=1;
      const candidate=mixed(sequence().items,mixVariant);
      if(!candidate.every((item,pos)=>item.id===current[pos]?.id)){next=candidate;break;}
    }
    current=next;dragging=null;pointerStart=null;sync();redraw();
    status.textContent='Elementos mezclados de nuevo. Arrástralos para ordenar.';
  });
  actions.append(check,reshuffle);
  redrawTabs();sync();redraw();board.append(tabs,list,actions);shell.append(board,status);finishPanel(runtime,shell);return runtime;
}
