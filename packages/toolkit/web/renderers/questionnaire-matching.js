import {MATCHING_RENDERER} from '../renderer-registry.js';
import {el, setupGame, statusNode, stylesheets} from './game-common.js';
export {stylesheets};

function derange(items) {
  if (items.length < 2) return [...items];
  const result = [...items];
  const evenLimit = result.length % 2 === 0 ? result.length : result.length - 3;
  for (let i = 0; i < evenLimit; i += 2) [result[i], result[i + 1]] = [result[i + 1], result[i]];
  if (result.length % 2 === 1 && result.length >= 3) {
    const n = result.length;
    [result[n - 3], result[n - 2], result[n - 1]] = [result[n - 2], result[n - 1], result[n - 3]];
  }
  return result;
}

export async function render(options) {
  const {game, runtime, shell} = await setupGame({...options, rendererId: MATCHING_RENDERER});
  const pairs = game.data.pairs;
  const board = el('div', {class: 'p2lrn-match-board'});
  const svg = el('svg', {class: 'p2lrn-match-connections', 'aria-hidden': 'true', focusable: 'false'});
  const columns = el('div', {class: 'p2lrn-match-grid'});
  const left = el('div', {class: 'p2lrn-match-column'});
  const right = el('div', {class: 'p2lrn-match-column'});
  const status = statusNode('Selecciona un elemento de la izquierda y después su pareja de la derecha.');
  let selected = null;
  const links = new Map();
  const leftButtons = new Map();
  const rightButtons = new Map();
  let resizeObserver = null;
  let frame = 0;

  const redraw = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const rect = board.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
      svg.replaceChildren();
      for (const [id, target] of links) {
        const l = leftButtons.get(id);
        const r = rightButtons.get(target);
        if (!l || !r) continue;
        const lr = l.getBoundingClientRect();
        const rr = r.getBoundingClientRect();
        const x1 = lr.right - rect.left;
        const y1 = lr.top + lr.height / 2 - rect.top;
        const x2 = rr.left - rect.left;
        const y2 = rr.top + rr.height / 2 - rect.top;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(x1));
        line.setAttribute('y1', String(y1));
        line.setAttribute('x2', String(x2));
        line.setAttribute('y2', String(y2));
        line.setAttribute('class', 'p2lrn-match-line');
        line.setAttribute('stroke', ['#2563eb','#a855f7','#059669','#d97706','#db2777'][pairs.findIndex(item=>item.id===id)%5]);
        const c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c1.setAttribute('cx', String(x1));
        c1.setAttribute('cy', String(y1));
        c1.setAttribute('r', '4');
        c1.setAttribute('class', 'p2lrn-match-dot');
        const c2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c2.setAttribute('cx', String(x2));
        c2.setAttribute('cy', String(y2));
        c2.setAttribute('r', '4');
        c2.setAttribute('class', 'p2lrn-match-dot');
        svg.append(line, c1, c2);
      }
    });
  };

  const refreshLinks = () => {
    const colors=['#2563eb','#a855f7','#059669','#d97706','#db2777'];
    leftButtons.forEach((node,id)=>{
      const linked=links.has(id),color=colors[pairs.findIndex(item=>item.id===id)%colors.length];
      node.classList.toggle('is-solved',linked);
      node.style.borderColor=linked?color:'';
      node.style.backgroundColor=linked?color+'18':'';
    });
    rightButtons.forEach((node,id)=>{
      const owner=[...links].find(([,target])=>target===id)?.[0];
      const linked=Boolean(owner),color=colors[pairs.findIndex(item=>item.id===owner)%colors.length];
      node.classList.toggle('is-solved',linked);
      node.style.borderColor=linked?color:'';
      node.style.backgroundColor=linked?color+'18':'';
    });
    redraw();
  };
  const chooseLeft = (pair) => {
    selected = pair;
    leftButtons.forEach((node,id)=>node.classList.toggle('is-selected',id===pair.id));
    status.textContent='Selecciona su pareja. Puedes cambiar la relación antes de finalizar.';
  };
  const chooseRight = (pair) => {
    if(!selected){status.textContent='Selecciona primero un elemento de la izquierda.';return;}
    const source=selected;
    for(const [id,target] of [...links])if(target===pair.id&&id!==source.id){
      links.delete(id);
      const previous=pairs.find(item=>item.id===id);
      if(previous)runtime.applyPatch(previous.questionId,{kind:'pair-set',leftId:previous.patch.leftId,rightId:''});
    }
    links.set(source.id,pair.id);
    runtime.applyPatch(source.questionId,{kind:'pair-set',leftId:source.patch.leftId,rightId:pair.patch.rightId});
    selected=null;
    leftButtons.forEach(node=>node.classList.remove('is-selected'));
    refreshLinks();
    status.textContent=`Relaciones establecidas: ${links.size} de ${pairs.length}. Puedes modificarlas sin conocer la corrección.`;
  };

  for (const pair of pairs) {
    const button = el('button', {type: 'button', class: 'p2lrn-game-card'}, pair.left);
    button.dataset.p2lrnMatchLeft = pair.id;
    button.addEventListener('click', () => chooseLeft(pair));
    leftButtons.set(pair.id, button);
    left.append(button);
  }
  for (const pair of derange(pairs)) {
    const button = el('button', {type: 'button', class: 'p2lrn-game-card'}, pair.right);
    button.dataset.p2lrnMatchRight = pair.id;
    button.addEventListener('click', () => chooseRight(pair));
    rightButtons.set(pair.id, button);
    right.append(button);
  }

  const actions=el('div',{class:'p2lrn-game-actions'});
  const finish=el('button',{type:'button',class:'p2lrn-game-button'},'Finalizar actividad');
  finish.addEventListener('click',async()=>{if(links.size!==pairs.length){status.textContent='Relaciona todos los elementos antes de finalizar.';return;}const score=await runtime.finish();if(score){status.textContent='Actividad enviada.';finish.disabled=true;}});
  actions.append(finish);
  columns.append(left, right);
  board.append(svg, columns);
  shell.append(board, status, actions);

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(redraw);
    resizeObserver.observe(board);
    leftButtons.forEach((node) => resizeObserver.observe(node));
    rightButtons.forEach((node) => resizeObserver.observe(node));
  }
  globalThis.addEventListener?.('resize', redraw);
  redraw();

  const originalDestroy = runtime.destroy.bind(runtime);
  runtime.destroy = () => {
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    globalThis.removeEventListener?.('resize', redraw);
    originalDestroy();
  };
  return runtime;
}
