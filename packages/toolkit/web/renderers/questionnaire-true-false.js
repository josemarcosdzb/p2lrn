import {TRUE_FALSE_RENDERER} from '../renderer-registry.js';
import {el, setupGame, statusNode, stylesheets} from './game-common.js';
export {stylesheets};

export async function render(options){
  const {game,runtime,shell}=await setupGame({...options,rendererId:TRUE_FALSE_RENDERER});
  const items=game.data.questions;
  let index=0,correctCount=0,finished=false,locked=false;
  const timers=new Set();
  const card=el('section',{class:'p2lrn-vf-card'});
  const status=statusNode('Elige verdadero o falso.');
  const schedule=(fn,ms)=>{const id=window.setTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);};

  const redraw=()=>{
    card.replaceChildren();
    if(finished){
      const reveal=(runtime.payload.presentation?.showFeedback??'never')!=='never';
      card.append(el('h3',{},reveal?`Ronda completada: ${correctCount}/${items.length} aciertos.`:'Ronda enviada. El profesor no ha habilitado mostrar la corrección.'));
      const retry=el('button',{type:'button',class:'p2lrn-game-button'},'Repetir ronda');
      retry.addEventListener('click',()=>{
        if(!runtime.reset()){status.textContent='No quedan intentos disponibles.';return;}
        index=0;correctCount=0;finished=false;locked=false;
        status.textContent='Elige verdadero o falso.';
        redraw();
      });
      card.append(retry);
      return;
    }
    const item=items[index];
    card.append(el('p',{class:'p2lrn-game-description'},`${index+1}/${items.length}`),el('h3',{},item.prompt));
    const actions=el('div',{class:'p2lrn-game-actions'});
    const answer=(value)=>{
      if(locked||finished)return;
      locked=true;
      runtime.applyPatch(item.questionId,value?item.truePatch:item.falsePatch);
      if(item.correct===value)correctCount+=1;
      status.textContent='Respuesta registrada. La corrección se mostrará al terminar, si está habilitada.';
      actions.querySelectorAll('button').forEach((button)=>button.disabled=true);
      if(index>=items.length-1){
        finished=true;
        redraw();
        status.textContent='Ronda terminada. Respuestas enviadas.';
        void runtime.finish();
      }else{
        schedule(()=>{index+=1;locked=false;status.textContent='Elige verdadero o falso.';redraw();},350);
      }
    };
    const yes=el('button',{type:'button',class:'p2lrn-game-choice'},'Verdadero');
    const no=el('button',{type:'button',class:'p2lrn-game-choice'},'Falso');
    yes.addEventListener('click',()=>answer(true));no.addEventListener('click',()=>answer(false));
    actions.append(yes,no);card.append(actions);
  };

  redraw();shell.append(card,status);
  const originalDestroy=runtime.destroy.bind(runtime);
  runtime.destroy=()=>{for(const id of timers)window.clearTimeout(id);timers.clear();originalDestroy();};
  return runtime;
}
