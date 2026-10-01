import {ROSCO_RENDERER} from '../renderer-registry.js';
import {normalizeWord} from '../questionnaire-games-core.js';
import {el, setupGame, statusNode, stylesheets} from './game-common.js';
export {stylesheets};

export async function render(options){
  const {game,runtime,shell}=await setupGame({...options,rendererId:ROSCO_RENDERER});
  const elements=game.data.elements;
  let index=0,locked=false;
  const states=new Map();
  const timers=new Set();
  const ring=el('div',{class:'p2lrn-rosco','aria-label':'Letras del rosco'});
  const letterNodes=new Map();
  const challenge=el('section',{class:'p2lrn-rosco-challenge'});
  const label=el('p');
  const clue=el('h3');
  const input=el('input',{type:'text',class:'p2lrn-game-input',autocomplete:'off',placeholder:'Respuesta'});
  const status=statusNode('Escribe la respuesta o pasa a otra letra.');
  const actions=el('div',{class:'p2lrn-game-actions'});
  const check=el('button',{type:'button',class:'p2lrn-game-button'},'Comprobar');
  const pass=el('button',{type:'button',class:'p2lrn-game-button'},'Pasar');

  const schedule=(fn,ms)=>{const id=window.setTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);};
  const completed=()=>states.size;
  const nextPending=(from)=>{
    if(!elements.length)return 0;
    for(let step=1;step<=elements.length;step+=1){const candidate=(from+step)%elements.length;if(!states.has(elements[candidate].id))return candidate;}
    return from;
  };
  const finishIfDone=()=>{
    if(completed()!==elements.length)return false;
    challenge.querySelectorAll('input,button').forEach((node)=>node.disabled=true);
    status.textContent=`Rosco completado. ${completed()}/${elements.length} resueltas.`;
    void runtime.finish().then((score)=>{if(score)status.textContent=`Rosco completado. ${completed()}/${elements.length} resueltas · ${score.pointsEarned}/${score.pointsPossible} puntos.`;});
    return true;
  };
  const redraw=()=>{
    letterNodes.forEach((node,id)=>{
      const state=states.get(id);
      node.classList.toggle('is-solved',state==='correct');
      node.classList.toggle('is-wrong',state==='wrong');
      node.classList.remove('is-current');
      node.disabled=Boolean(state)||locked;
    });
    if(finishIfDone())return;
    const item=elements[index];
    letterNodes.get(item.id)?.classList.add('is-current');
    label.textContent=item.mode==='starts'?`Empieza por ${item.letter}`:`Contiene ${item.letter}`;
    clue.textContent=item.clue;
    input.value='';
    input.disabled=locked||states.has(item.id);
    check.disabled=locked||states.has(item.id);
    pass.disabled=locked||completed()>=elements.length;
    input.focus();
  };

  elements.forEach((item,itemIndex)=>{
    const node=el('button',{type:'button',class:'p2lrn-rosco-letter','aria-label':`Letra ${item.letter}`},item.letter);
    node.addEventListener('click',()=>{if(locked||states.has(item.id))return;index=itemIndex;status.textContent='Escribe la respuesta o pasa a otra letra.';redraw();});
    letterNodes.set(item.id,node);ring.append(node);
  });

  check.addEventListener('click',()=>{
    const item=elements[index];
    if(!item||!input.value.trim()||locked||states.has(item.id))return;
    const correct=normalizeWord(input.value)===item.word;
    states.set(item.id,correct?'correct':'wrong');
    if(correct)runtime.applyPatch(item.questionId,item.patch);
    status.textContent=correct?'Respuesta correcta.':`Respuesta esperada: ${item.answer??item.word}.`;
    locked=true;redraw();
    schedule(()=>{index=nextPending(index);locked=false;redraw();},250);
  });
  pass.addEventListener('click',()=>{
    if(locked||completed()>=elements.length)return;
    index=nextPending(index);
    status.textContent='Letra aplazada.';
    redraw();
  });
  input.addEventListener('keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();check.click();}});
  actions.append(check,pass);challenge.append(label,clue,input,actions);shell.append(ring,challenge,status);redraw();

  const originalDestroy=runtime.destroy.bind(runtime);
  runtime.destroy=()=>{for(const id of timers)window.clearTimeout(id);timers.clear();originalDestroy();};
  return runtime;
}
