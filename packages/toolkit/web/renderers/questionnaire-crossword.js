import {CROSSWORD_RENDERER} from '../renderer-registry.js';
import {normalizeWord} from '../questionnaire-games-core.js';
import {el, setupGame, statusNode, stylesheets} from './game-common.js';
export {stylesheets};

const cellKey=(row,col)=>String(row)+':'+String(col);
const cellsFor=(entry)=>Array.from({length:entry.word.length},(_,index)=>({
  row:entry.row+(entry.direction==='V'?index:0),
  col:entry.col+(entry.direction==='H'?index:0),
}));
const labelFor=(entry)=>(entry.direction==='H'?'Horizontal ':'Vertical ')+entry.number+': '+entry.clue;

export async function render(options){
  const {game,runtime,shell}=await setupGame({...options,rendererId:CROSSWORD_RENDERER});
  const {grid,entries,numbers}=game.data;
  const status=statusNode('Elige una pista y completa sus casillas. Usa las flechas para moverte.');
  const inputs=new Map(),cells=new Map(),clueButtons=new Map(),entryCells=new Map();
  let activeEntry=null,completed=false;
  const memberships=new Map();
  for(const entry of entries){
    const keys=cellsFor(entry).map(({row,col})=>cellKey(row,col));
    entryCells.set(entry.id,keys);
    for(const key of keys)memberships.set(key,[...(memberships.get(key)??[]),entry]);
  }

  const scroll=el('div',{class:'p2lrn-grid-scroll p2lrn-crossword-wrap'});
  const board=el('table',{class:'p2lrn-crossword-grid','aria-label':'Tablero del crucigrama'});
  board.style.setProperty('--p2lrn-crossword-columns',String(grid[0]?.length??1));
  const body=document.createElement('tbody');
  grid.forEach((row,r)=>{
    const tr=document.createElement('tr');
    row.forEach((letter,c)=>{
      const td=document.createElement('td');
      if(!letter){
        td.append(el('span',{class:'p2lrn-crossword-block','aria-hidden':'true'}));
        tr.append(td);
        return;
      }
      const key=cellKey(r,c);
      const cell=el('label',{class:'p2lrn-crossword-cell'});
      const number=numbers[key];
      if(number)cell.append(el('span',{class:'p2lrn-crossword-number','aria-hidden':'true'},number));
      const input=el('input',{
        type:'text',maxlength:'1',autocomplete:'off',autocapitalize:'characters',spellcheck:'false',
        'aria-label':'Casilla fila '+(r+1)+', columna '+(c+1)+(number?', número '+number:''),
      });
      inputs.set(key,input);cells.set(key,cell);
      cell.append(input);td.append(cell);tr.append(td);
    });
    body.append(tr);
  });
  board.append(body);scroll.append(board);

  const current=el('p',{class:'p2lrn-crossword-current','aria-live':'polite'},'');
  const clues=el('div',{class:'p2lrn-clues'});
  for(const [direction,title] of [['H','Horizontales'],['V','Verticales']]){
    const group=el('section',{class:'p2lrn-crossword-clue-group'});
    group.append(el('h3',{},title));
    const list=el('ol',{class:'p2lrn-crossword-clue-list'});
    for(const entry of entries.filter(item=>item.direction===direction).sort((a,b)=>a.number-b.number)){
      const li=el('li');
      li.value=entry.number;
      const button=el('button',{type:'button',class:'p2lrn-crossword-clue','aria-pressed':'false'},entry.clue);
      button.setAttribute('aria-label',labelFor(entry));
      clueButtons.set(entry.id,button);
      button.addEventListener('click',()=>selectEntry(entry,true));
      li.append(button);list.append(li);
    }
    group.append(list);clues.append(group);
  }

  function selectEntry(entry,focus=false,targetKey=null){
    activeEntry=entry;
    const keys=entryCells.get(entry.id)??[];
    const activeKey=targetKey??keys[0];
    for(const [key,cell] of cells){
      cell.classList.toggle('is-active-word',keys.includes(key));
      cell.classList.toggle('is-active-cell',key===activeKey);
    }
    for(const [id,button] of clueButtons){
      const selected=id===entry.id;
      button.classList.toggle('is-current',selected);
      button.setAttribute('aria-pressed',String(selected));
    }
    current.textContent=labelFor(entry);
    if(focus){
      const key=targetKey??keys.find(candidate=>!inputs.get(candidate)?.value)??keys[0];
      inputs.get(key)?.focus();
    }
  }

  function selectCell(key){
    const possibilities=memberships.get(key)??[];
    if(!possibilities.length)return;
    const entry=possibilities.includes(activeEntry)?activeEntry:possibilities[0];
    selectEntry(entry,false,key);
  }

  for(const [key,input] of inputs){
    input.addEventListener('focus',()=>selectCell(key));
    input.addEventListener('click',()=>selectCell(key));
    input.addEventListener('input',()=>{
      input.value=normalizeWord(input.value).slice(-1);
      const entry=(entryCells.get(activeEntry?.id)??[]).includes(key)?activeEntry:memberships.get(key)?.[0];
      if(!entry||!input.value)return;
      const keys=entryCells.get(entry.id);
      const next=keys[keys.indexOf(key)+1];
      if(next)selectEntry(entry,true,next);
    });
    input.addEventListener('keydown',(event)=>{
      const keys=entryCells.get(activeEntry?.id)??[];
      const index=keys.indexOf(key);
      if(event.key==='Backspace'&&!input.value&&index>0){
        event.preventDefault();selectEntry(activeEntry,true,keys[index-1]);return;
      }
      if(event.key==='Enter'&&activeEntry){
        event.preventDefault();
        const next=keys[Math.min(keys.length-1,Math.max(0,index+1))];
        if(next)selectEntry(activeEntry,true,next);
        return;
      }
      const step={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]}[event.key];
      if(step){
        event.preventDefault();
        const [r,c]=key.split(':').map(Number);
        let nr=r+step[0],nc=c+step[1],target=null;
        while(nr>=0&&nr<grid.length&&nc>=0&&nc<(grid[0]?.length??0)){
          if(inputs.has(cellKey(nr,nc))){target=cellKey(nr,nc);break;}
          nr+=step[0];nc+=step[1];
        }
        if(target){
          const desired=step[0]?'V':'H';
          const nextEntry=memberships.get(target)?.find(item=>item.direction===desired)
            ??memberships.get(target)?.[0];
          if(nextEntry)selectEntry(nextEntry,true,target);
        }
      }
    });
  }

  const actions=el('div',{class:'p2lrn-game-actions'});
  const check=el('button',{type:'button',class:'p2lrn-game-button'},'Finalizar actividad');
  const reset=el('button',{type:'button',class:'p2lrn-game-button'},'Reiniciar');
  check.addEventListener('click',async()=>{
    if(completed)return;
    completed=true;
    for(const entry of entries){
      const typed=(entryCells.get(entry.id)??[]).map(key=>normalizeWord(inputs.get(key)?.value??'')).join('');
      if(typed===entry.word)runtime.applyPatch(entry.questionId,entry.patch);
    }
    inputs.forEach(input=>{input.readOnly=true;});
    check.disabled=true;
    const score=await runtime.finish({allowMissingRequired:true});
    const reveal=(runtime.payload.presentation?.showFeedback??'never')!=='never';
    status.textContent=score&&reveal
      ?'Crucigrama entregado: '+score.pointsEarned+'/'+score.pointsPossible+' puntos.'
      :'Crucigrama entregado. La corrección no está disponible para el alumno.';
  });
  reset.addEventListener('click',()=>{
    if(completed&&runtime.reset()===false){
      status.textContent='No quedan intentos para reiniciar este crucigrama.';return;
    }
    inputs.forEach(input=>{input.value='';input.readOnly=false;input.parentElement?.classList.remove('is-solved');});
    completed=false;check.disabled=false;
    status.textContent='Crucigrama reiniciado.';
    if(entries[0])selectEntry(entries[0],true);
  });
  actions.append(check,reset);
  shell.append(scroll,current,clues,actions,status);
  if(entries[0])selectEntry(entries[0]);
  return runtime;
}
