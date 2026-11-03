import {playerUiText} from './ui-i18n.js';
import {MEMORY_RENDERER} from '../renderer-registry.js';
import {hashText, shuffleDeterministic} from '../questionnaire-games-core.js';
import {el, setupGame, statusNode, stylesheets} from './game-common.js';
export {stylesheets};

function separationScore(cards){
  const positions=new Map();
  cards.forEach((card,index)=>{const list=positions.get(card.pairId)??[];list.push(index);positions.set(card.pairId,list);});
  const distances=[...positions.values()].filter((list)=>list.length===2).map(([a,b])=>Math.abs(a-b));
  return {min:distances.length?Math.min(...distances):0,total:distances.reduce((sum,value)=>sum+value,0)};
}

function layoutCards(cards,seed){
  let best=shuffleDeterministic(cards,seed);
  let score=separationScore(best);
  for(let variant=1;variant<=48;variant+=1){
    const candidate=shuffleDeterministic(cards,(seed+Math.imul(variant,0x9e3779b1))>>>0);
    const next=separationScore(candidate);
    if(next.min>score.min||(next.min===score.min&&next.total>score.total)){best=candidate;score=next;}
  }
  return best;
}

export async function render(options) {
  const {game, runtime, shell} = await setupGame({...options, rendererId: MEMORY_RENDERER});
  const pairs=game.data.pairs;
  const base=pairs.flatMap((pair)=>[
    {key:`${pair.id}:l`,pairId:pair.id,side:'l',text:pair.left,patch:pair.patch,questionId:pair.questionId},
    {key:`${pair.id}:r`,pairId:pair.id,side:'r',text:pair.right,patch:pair.patch,questionId:pair.questionId},
  ]);
  const cards=layoutCards(base,hashText(base.map((card)=>card.key).join('|')));
  const board=el('div',{class:'p2lrn-memory-grid'});
  const status=statusNode(playerUiText('Memoriza las cartas: se ocultarán en 3 segundos.'));
  const solved=new Set();
  const buttons=new Map();
  let selected=[];
  let locked=true;
  let preview=true;
  const timers=new Set();

  const schedule=(fn,ms)=>{
    const id=window.setTimeout(()=>{timers.delete(id);fn();},ms);
    timers.add(id);
    return id;
  };
  const refresh=()=>{
    for(const card of cards){
      const button=buttons.get(card.key);
      const visible=preview||solved.has(card.pairId)||selected.some((item)=>item.key===card.key);
      button.textContent=visible?card.text:'?';
      button.setAttribute('aria-label',visible?card.text:playerUiText('Carta oculta'));
      button.disabled=preview||locked||solved.has(card.pairId);
      button.classList.toggle('is-selected',selected.some((item)=>item.key===card.key));
      button.classList.toggle('is-solved',solved.has(card.pairId));
      button.classList.toggle('is-preview',preview);
    }
  };

  const choose=(card)=>{
    if(preview||locked||solved.has(card.pairId)||selected.some((item)=>item.key===card.key)) return;
    if(selected.length===0){selected=[card];refresh();return;}
    const first=selected[0];
    selected=[first,card];
    locked=true;
    refresh();
    if(first.pairId===card.pairId&&first.side!==card.side){
      solved.add(card.pairId);
      runtime.applyPatch(card.questionId,card.patch);
      status.textContent=playerUiText('Pareja correcta.');
      schedule(()=>{
        selected=[];
        locked=false;
        refresh();
        if(solved.size===pairs.length){
          status.textContent=playerUiText('Memoria completada.');
          void runtime.finish().then((score)=>{const reveal=(runtime.payload.presentation?.showFeedback??'never')!=='never';if(score&&reveal)status.textContent=playerUiText(`Memoria completada: ${score.pointsEarned}/${score.pointsPossible} puntos.`);else status.textContent=playerUiText('Memoria completada. Actividad enviada.');});
        }else status.textContent=playerUiText(`Pareja correcta. ${solved.size}/${pairs.length} parejas.`);
      },350);
      return;
    }
    status.textContent=playerUiText('No forman pareja.');
    schedule(()=>{
      selected=[];
      locked=false;
      refresh();
      status.textContent=playerUiText(`Descubre dos cartas y forma parejas. ${solved.size}/${pairs.length} parejas.`);
    },700);
  };

  for(const card of cards){
    const button=el('button',{type:'button',class:'p2lrn-game-card'},card.text);
    button.addEventListener('click',()=>choose(card));
    buttons.set(card.key,button);
    board.append(button);
  }
  shell.append(board,status);
  refresh();
  schedule(()=>{
    preview=false;
    locked=false;
    status.textContent=playerUiText('Descubre dos cartas y forma parejas.');
    refresh();
  },3000);

  const originalDestroy=runtime.destroy.bind(runtime);
  runtime.destroy=()=>{for(const id of timers)window.clearTimeout(id);timers.clear();originalDestroy();};
  return runtime;
}
