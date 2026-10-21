import {ROSCO_RENDERER} from '../renderer-registry.js';
import {normalizeWord} from '../questionnaire-games-core.js';
import {el, setupGame, statusNode, stylesheets} from './game-common.js';
export {stylesheets};

export async function render(options){
  const {game,runtime,shell}=await setupGame({...options,rendererId:ROSCO_RENDERER});
  const elements=game.data.elements;
  let index=0,locked=false,ended=false;
  const states=new Map(),timers=new Set(),letterNodes=new Map();
  const layout=el('div',{class:'p2lrn-rosco-layout'});
  const board=el('section',{class:'p2lrn-rosco-board','aria-label':'Progreso del rosco'});
  const ring=el('div',{class:'p2lrn-rosco',role:'group','aria-label':'Letras del rosco'});
  const center=el('div',{class:'p2lrn-rosco-center','aria-live':'polite'});
  const progress=el('strong',{class:'p2lrn-rosco-progress'},'0 / '+elements.length);
  center.append(progress,el('span',{},'respondidas'));
  ring.append(center);
  const legend=el('p',{class:'p2lrn-rosco-legend'},'Selecciona una letra para responder o usa «Pasar».');
  board.append(ring,legend);
  const challenge=el('section',{class:'p2lrn-rosco-challenge'});
  const label=el('p',{class:'p2lrn-rosco-prompt'});
  const clue=el('h3');
  const input=el('input',{
    type:'text',class:'p2lrn-game-input',autocomplete:'off',spellcheck:'false',
    'aria-label':'Respuesta del rosco',placeholder:'Escribe tu respuesta',
  });
  const status=statusNode('Escribe la respuesta o pasa a otra letra.');
  const actions=el('div',{class:'p2lrn-game-actions'});
  const check=el('button',{type:'button',class:'p2lrn-game-button'},'Comprobar');
  const pass=el('button',{type:'button',class:'p2lrn-game-button'},'Pasar');
  const reset=el('button',{type:'button',class:'p2lrn-game-button'},'Reiniciar');
  const stats=el('p',{class:'p2lrn-rosco-stats','aria-live':'polite'});
  const schedule=(fn,ms)=>{
    const id=window.setTimeout(()=>{timers.delete(id);fn();},ms);
    timers.add(id);
  };
  const clearTimers=()=>{for(const id of timers)window.clearTimeout(id);timers.clear();};
  const nextPending=(from)=>{
    for(let step=1;step<=elements.length;step+=1){
      const candidate=(from+step)%elements.length;
      if(!states.has(elements[candidate].id))return candidate;
    }
    return from;
  };
  const tally=()=>{
    const correct=[...states.values()].filter(state=>state==='correct').length;
    const wrong=[...states.values()].filter(state=>state==='wrong').length;
    progress.textContent=states.size+' / '+elements.length;
    stats.textContent=correct+' aciertos · '+wrong+' fallos · '+(elements.length-states.size)+' pendientes';
  };
  const finishIfDone=()=>{
    if(ended||states.size!==elements.length)return ended;
    ended=true;
    input.disabled=true;check.disabled=true;pass.disabled=true;
    const correct=[...states.values()].filter(state=>state==='correct').length;
    status.textContent='Rosco completado: '+correct+' aciertos de '+elements.length+'.';
    void runtime.finish({allowMissingRequired:true}).then(score=>{
      if(score)status.textContent='Rosco completado: '+correct+' aciertos de '+elements.length+' · '+score.pointsEarned+'/'+score.pointsPossible+' puntos.';
    });
    return true;
  };
  const redraw=()=>{
    tally();
    letterNodes.forEach((node,id)=>{
      const state=states.get(id);
      node.classList.toggle('is-solved',state==='correct');
      node.classList.toggle('is-wrong',state==='wrong');
      node.classList.toggle('is-current',!state&&elements[index]?.id===id);
      node.disabled=Boolean(state)||locked;
      node.setAttribute('aria-label','Letra '+node.textContent+(state==='correct'?', acertada':state==='wrong'?', fallada':!state&&elements[index]?.id===id?', actual':', pendiente'));
      if(!state&&elements[index]?.id===id)node.setAttribute('aria-current','true');
      else node.removeAttribute('aria-current');
    });
    if(finishIfDone())return;
    const item=elements[index];
    label.textContent=item.mode==='starts'?'Empieza por '+item.letter:'Contiene la '+item.letter;
    clue.textContent=item.clue;
    input.value='';
    input.disabled=locked||states.has(item.id);
    check.disabled=locked||states.has(item.id);
    pass.disabled=locked||states.has(item.id);
    if(!locked)input.focus();
  };

  elements.forEach((item,itemIndex)=>{
    const node=el('button',{type:'button',class:'p2lrn-rosco-letter','aria-label':'Letra '+item.letter},item.letter);
    // Every question gets one position on the circumference; six questions
    // form a six-point rosco, rather than inventing missing alphabet entries.
    const theta=-Math.PI/2+(Math.PI*2*itemIndex/Math.max(1,elements.length));
    node.style.left=(50+42*Math.cos(theta))+'%';
    node.style.top=(50+42*Math.sin(theta))+'%';
    node.addEventListener('click',()=>{
      if(locked||states.has(item.id))return;
      index=itemIndex;
      status.textContent='Letra seleccionada: '+item.letter+'.';
      redraw();
    });
    letterNodes.set(item.id,node);ring.append(node);
  });

  check.addEventListener('click',()=>{
    const item=elements[index];
    if(!item||!input.value.trim()||locked||states.has(item.id))return;
    const correct=normalizeWord(input.value)===item.word;
    states.set(item.id,correct?'correct':'wrong');
    if(correct)runtime.applyPatch(item.questionId,item.patch);
    status.textContent=correct?'Respuesta correcta.':'Respuesta incorrecta. La respuesta era: '+(item.answer??item.word)+'.';
    locked=true;redraw();
    schedule(()=>{
      locked=false;
      if(states.size<elements.length)index=nextPending(index);
      redraw();
    },1100);
  });
  pass.addEventListener('click',()=>{
    if(locked||ended)return;
    index=nextPending(index);
    status.textContent='Letra aplazada. Puedes volver cuando quieras.';
    redraw();
  });
  reset.addEventListener('click',()=>{
    if(runtime.reset()===false){
      status.textContent='No quedan intentos para reiniciar el rosco.';return;
    }
    clearTimers();states.clear();index=0;locked=false;ended=false;
    status.textContent='Rosco reiniciado.';
    redraw();
  });
  input.addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();check.click();}
  });
  actions.append(check,pass,reset);
  challenge.append(label,clue,input,actions,stats);
  layout.append(board,challenge);
  shell.append(layout,status);
  redraw();

  const originalDestroy=runtime.destroy.bind(runtime);
  runtime.destroy=()=>{clearTimers();originalDestroy();};
  return runtime;
}
