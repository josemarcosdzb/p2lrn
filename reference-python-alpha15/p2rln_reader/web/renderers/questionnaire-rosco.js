import {ROSCO_RENDERER} from '../renderer-registry.js';
import {normalizeWord} from '../questionnaire-games-core.js';
import {actionButton, el, setupGame, statusNode, stylesheets} from './game-common.js';
export {stylesheets};

export async function render(options) {
  const {game,runtime,shell}=await setupGame({...options,rendererId:ROSCO_RENDERER});const elements=game.data.elements;let index=0;const solved=new Set();
  const ring=el('div',{class:'p2rln-rosco','aria-label':'Letras del rosco'});const letterNodes=new Map();for(const item of elements){const node=el('span',{class:'p2rln-rosco-letter'},item.letter);letterNodes.set(item.id,node);ring.append(node);}const challenge=el('section',{class:'p2rln-rosco-challenge'});const label=el('p');const clue=el('h3');const input=el('input',{type:'text',class:'p2rln-game-input',autocomplete:'off'});const status=statusNode('Responde o pasa a la siguiente letra.');const actions=el('div',{class:'p2rln-game-actions'});
  const nextUnsolved=(from)=>{for(let step=0;step<elements.length;step+=1){const candidate=(from+step)%elements.length;if(!solved.has(elements[candidate].id))return candidate;}return -1;};
  const redraw=()=>{letterNodes.forEach((node,id)=>{node.classList.toggle('is-solved',solved.has(id));node.classList.remove('is-current');});if(solved.size===elements.length){challenge.replaceChildren(el('h3',{},'Rosco completado.'));void runtime.finish().then((score)=>{if(score)status.textContent=`Rosco completado: ${score.pointsEarned}/${score.pointsPossible} puntos.`;});return;}index=nextUnsolved(index);const item=elements[index];letterNodes.get(item.id)?.classList.add('is-current');label.textContent=item.mode==='starts'?`Empieza por ${item.letter}`:`Contiene la ${item.letter}`;clue.textContent=item.clue;input.value='';input.focus();};
  const check=actionButton('Comprobar',()=>{const item=elements[index];if(normalizeWord(input.value)!==item.word){status.textContent='Respuesta incorrecta. Puedes intentarlo de nuevo o pasar.';return;}solved.add(item.id);runtime.applyPatch(item.questionId,item.patch);status.textContent=`Correcta. ${solved.size}/${elements.length}.`;index=(index+1)%elements.length;redraw();});
  const pass=actionButton('Pasar',()=>{index=(index+1)%elements.length;status.textContent='Pregunta aplazada.';redraw();},'p2rln-game-button');input.addEventListener('keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();check.click();}});actions.append(check,pass);challenge.append(label,clue,input,actions);shell.append(ring,challenge,status);redraw();return runtime;
}
