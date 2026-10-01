import {WORD_SEARCH_RENDERER} from '../renderer-registry.js';
import {normalizeWord} from '../questionnaire-games-core.js';
import {el, setupGame, statusNode, stylesheets} from './game-common.js';
export {stylesheets};

function key(row, col) { return `${row}:${col}`; }

function lineCells(start,end) {
  const dr=end.row-start.row;
  const dc=end.col-start.col;
  if(dr===0&&dc===0) return [start];
  const adr=Math.abs(dr), adc=Math.abs(dc);
  if(!(dr===0||dc===0||adr===adc)) return [];
  const steps=Math.max(adr,adc);
  const sr=dr===0?0:dr/adr;
  const sc=dc===0?0:dc/adc;
  return Array.from({length:steps+1},(_,index)=>({row:start.row+sr*index,col:start.col+sc*index}));
}

function sameCells(a,b) {
  if(a.length!==b.length) return false;
  return a.every((cell,index)=>cell.row===b[index].row&&cell.col===b[index].col);
}

export async function render(options) {
  const {game, runtime, shell} = await setupGame({...options, rendererId: WORD_SEARCH_RENDERER});
  const {grid, words} = game.data;
  const found = new Set();
  const foundCells = new Set();
  const buttons = new Map();
  const clueInputs = new Map();
  let anchor = null;
  let dragStart = null;
  let dragEnd = null;
  let dragging = false;

  const status = statusNode('Arrastra sobre una palabra, o pulsa la primera y la última letra. También puedes escribir la respuesta en su pista.');
  const table = el('table', {class: 'p2lrn-word-grid', 'aria-label': 'Sopa de letras'});
  const body = document.createElement('tbody');

  const redraw = () => {
    buttons.forEach((button, cellKey)=>{
      button.classList.toggle('is-solved',foundCells.has(cellKey));
      button.classList.remove('is-start','is-preview');
    });
    if(anchor) buttons.get(key(anchor.row,anchor.col))?.classList.add('is-start');
    if(dragStart&&dragEnd){
      for(const cell of lineCells(dragStart,dragEnd)) buttons.get(key(cell.row,cell.col))?.classList.add('is-preview');
    }
    for(const word of words){
      const input=clueInputs.get(word.id);
      if(input){
        input.classList.toggle('is-solved',found.has(word.id));
        if(found.has(word.id)) input.disabled=true;
      }
    }
  };

  const solveWord = (word) => {
    if(found.has(word.id)) return;
    found.add(word.id);
    word.cells.forEach((cell)=>foundCells.add(key(cell.row,cell.col)));
    runtime.applyPatch(word.questionId,word.patch);
    const input=clueInputs.get(word.id);
    if(input&&!input.value) input.value=word.answer??word.word;
    redraw();
    status.textContent=`Respuesta encontrada. ${found.size}/${words.length}.`;
    if(found.size===words.length){
      void runtime.finish().then((score)=>{
        status.textContent=score
          ? `Sopa completada: ${score.pointsEarned}/${score.pointsPossible} puntos.`
          : 'Sopa completada.';
      });
    }
  };

  const resolveSegment=(start,end)=>{
    const cells=lineCells(start,end);
    if(cells.length<2) return false;
    const reverse=[...cells].reverse();
    const match=words.find((word)=>!found.has(word.id)&&(sameCells(cells,word.cells)||sameCells(reverse,word.cells)));
    if(!match){
      status.textContent='Ese tramo no corresponde a una respuesta completa.';
      return false;
    }
    solveWord(match);
    return true;
  };

  const rootHit=(x,y)=>{
    const root=table.getRootNode();
    const node=typeof root.elementFromPoint==='function'?root.elementFromPoint(x,y):document.elementFromPoint(x,y);
    const button=node?.closest?.('button[data-p2lrn-cell]');
    if(!button||!table.contains(button)) return null;
    return {row:Number(button.dataset.row),col:Number(button.dataset.col)};
  };

  grid.forEach((row, r) => {
    const tr = document.createElement('tr');
    row.forEach((letter, c) => {
      const td = document.createElement('td');
      const button = el('button', {
        type: 'button',
        class: 'p2lrn-game-cell',
        'aria-label': `Fila ${r+1}, columna ${c+1}, ${letter}`,
        'data-p2lrn-cell':'1',
        'data-row':r,
        'data-col':c,
      }, letter);
      buttons.set(key(r,c), button);
      button.addEventListener('pointerdown',(event)=>{
        event.preventDefault();
        dragging=true;
        dragStart={row:r,col:c};
        dragEnd={row:r,col:c};
        redraw();
      });
      tr.append(td);
      td.append(button);
    });
    body.append(tr);
  });
  table.append(body);

  table.addEventListener('pointermove',(event)=>{
    if(!dragging||!dragStart) return;
    const cell=rootHit(event.clientX,event.clientY);
    if(!cell) return;
    dragEnd=cell;
    redraw();
  });
  table.addEventListener('pointerup',(event)=>{
    if(!dragging||!dragStart) return;
    const end=rootHit(event.clientX,event.clientY)??dragEnd??dragStart;
    const start=dragStart;
    dragging=false;
    dragStart=null;
    dragEnd=null;
    if(start.row!==end.row||start.col!==end.col){
      anchor=null;
      resolveSegment(start,end);
    }else if(anchor){
      const first=anchor;
      anchor=null;
      resolveSegment(first,end);
    }else{
      anchor=end;
      status.textContent='Primera letra seleccionada. Pulsa la última o arrastra hasta ella.';
    }
    redraw();
  });
  table.addEventListener('pointercancel',()=>{
    dragging=false;
    dragStart=null;
    dragEnd=null;
    redraw();
  });

  const scroll = el('div', {class: 'p2lrn-grid-scroll'});
  scroll.append(table);
  const clues = el('div', {class: 'p2lrn-clues'});
  const group = document.createElement('div');
  group.append(el('h3', {}, 'Pistas'));
  const ol = document.createElement('ol');
  words.forEach((word) => {
    const li = el('li',{class:'p2lrn-word-clue'});
    const label=el('label');
    label.append(el('span',{},word.clue));
    const input=el('input',{
      type:'text',
      class:'p2lrn-game-input p2lrn-word-answer',
      autocomplete:'off',
      spellcheck:'false',
      'aria-label':`Respuesta: ${word.clue}`,
    });
    input.addEventListener('input',()=>{
      const typed=normalizeWord(input.value);
      if(typed&&typed===word.word) solveWord(word);
    });
    clueInputs.set(word.id,input);
    label.append(input);
    li.append(label);
    ol.append(li);
  });
  group.append(ol);
  clues.append(group);
  shell.append(scroll, clues, status);
  redraw();
  return runtime;
}
