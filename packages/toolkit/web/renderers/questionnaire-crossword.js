import {CROSSWORD_RENDERER} from '../renderer-registry.js';
import {normalizeWord} from '../questionnaire-games-core.js';
import {el, setupGame, statusNode, stylesheets} from './game-common.js';
export {stylesheets};

function cellKey(row,col){return `${row}:${col}`;}
function cellsFor(entry){const cells=[];for(let i=0;i<entry.word.length;i+=1)cells.push({row:entry.row+(entry.direction==='V'?i:0),col:entry.col+(entry.direction==='H'?i:0)});return cells;}

export async function render(options){
  const {game,runtime,shell}=await setupGame({...options,rendererId:CROSSWORD_RENDERER});
  const data=game.data;
  const status=statusNode('Completa las casillas y comprueba el resultado.');
  const inputs=new Map();
  let completed=false;

  const table=el('table',{class:'p2lrn-crossword-grid','aria-label':'Crucigrama'});
  const body=document.createElement('tbody');
  data.grid.forEach((row,r)=>{
    const tr=document.createElement('tr');
    row.forEach((letter,c)=>{
      const td=document.createElement('td');
      if(!letter){td.append(el('span',{class:'p2lrn-crossword-block','aria-hidden':'true'}));tr.append(td);return;}
      const cell=el('label',{class:'p2lrn-crossword-cell'});
      const number=data.numbers[cellKey(r,c)];
      if(number)cell.append(el('span',{class:'p2lrn-crossword-number'},number));
      const input=el('input',{type:'text',maxlength:'1','aria-label':`Fila ${r+1}, columna ${c+1}`});
      input.addEventListener('input',()=>{input.value=normalizeWord(input.value).slice(-1);});
      inputs.set(cellKey(r,c),input);cell.append(input);td.append(cell);tr.append(td);
    });
    body.append(tr);
  });
  table.append(body);
  const scroll=el('div',{class:'p2lrn-grid-scroll'});scroll.append(table);

  const clues=el('div',{class:'p2lrn-clues'});
  for(const [direction,title] of [['H','Horizontales'],['V','Verticales']]){
    const group=document.createElement('div');group.append(el('h3',{},title));
    const ol=document.createElement('ol');
    for(const entry of data.entries.filter((item)=>item.direction===direction).sort((a,b)=>a.number-b.number)){
      const li=document.createElement('li');li.value=entry.number;li.textContent=entry.clue;ol.append(li);
    }
    group.append(ol);clues.append(group);
  }

  const actions=el('div',{class:'p2lrn-game-actions'});
  const check=el('button',{type:'button',class:'p2lrn-game-button'},'Comprobar');
  const reset=el('button',{type:'button',class:'p2lrn-game-button'},'Reiniciar');
  check.addEventListener('click',()=>{
    let total=0,correct=0;
    data.grid.forEach((row,r)=>row.forEach((letter,c)=>{
      if(!letter)return;
      total+=1;
      if(normalizeWord(inputs.get(cellKey(r,c))?.value??'')===letter)correct+=1;
    }));
    if(correct===total&&!completed){
      completed=true;
      for(const entry of data.entries)runtime.applyPatch(entry.questionId,entry.patch);
      status.textContent='Crucigrama completado correctamente.';
      void runtime.finish().then((score)=>{if(score)status.textContent=`Crucigrama completado: ${score.pointsEarned}/${score.pointsPossible} puntos.`;});
    }else if(correct===total){
      status.textContent='Crucigrama completado correctamente.';
    }else status.textContent=`${correct} de ${total} letras están correctas.`;
  });
  reset.addEventListener('click',()=>{
    inputs.forEach((input)=>{input.value='';input.parentElement?.classList.remove('is-solved');});
    if(completed)runtime.reset();
    completed=false;
    status.textContent='Crucigrama reiniciado.';
  });
  actions.append(check,reset);
  shell.append(scroll,clues,actions,status);return runtime;
}
