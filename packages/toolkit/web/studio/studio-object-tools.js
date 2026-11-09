import {studioNestedInsertionContainer} from './visual-layout.js';
import {normalizeStudioShapeCaptions} from './studio-shapes.js';
// One object toolbar shared by Studio web and the embedded NPM component.
// Editing controls are outside the saved HTML; only standard HTML and
// constrained inline styles are serialized to a P2LRN lesson.
const OBJECT_SELECTOR='[data-p2lrn-layout],table,figure';
const MAX_ROWS=80,MAX_COLUMNS=20;
const STYLES=[
 '.p2lrn-object-selection{position:absolute;pointer-events:none;border:2px solid #4776b6;border-radius:5px;box-sizing:border-box;z-index:45;display:none}',
 '.p2lrn-object-selection[data-visible=true]{display:block}',
 '.p2lrn-object-controls{position:absolute;bottom:calc(100% + 8px);left:0;display:flex;flex-wrap:wrap;align-items:center;gap:4px;width:max-content;max-width:min(680px,calc(100vw - 40px));padding:5px;background:#fff;border:1px solid #cbd5e1;border-radius:9px;box-shadow:0 8px 25px #0f172a26;pointer-events:auto}',
 '.p2lrn-object-controls button{display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:5px 8px;border:1px solid transparent;border-radius:6px;background:#fff;color:#344054;font:600 11px/1.2 system-ui,sans-serif;cursor:pointer;white-space:nowrap}',
 '.p2lrn-object-controls button:hover{background:#edf4fc;border-color:#d2deeb}',
 '.p2lrn-object-controls button:focus-visible,.p2lrn-object-resize:focus-visible{outline:2px solid #2563eb;outline-offset:2px}',
 '.p2lrn-object-controls button[data-object-action=drag]{background:#edf4fc;border-color:#d2deeb;cursor:grab}',
 '.p2lrn-object-controls button[data-object-action=drag]:active{cursor:grabbing}',
 '.p2lrn-object-controls .p2lrn-object-label{color:#64748b;font-size:10px;padding:0 6px;font-family:system-ui,sans-serif}',
 '.p2lrn-object-resize{position:absolute;right:-8px;bottom:-8px;pointer-events:auto;width:17px;height:17px;padding:0;border:2px solid #fff;border-radius:4px;background:#4776b6;box-shadow:0 0 0 1px #4776b6;cursor:nwse-resize}',
  '.p2lrn-studio-drop-target{outline:2px dashed #3a73bd!important;outline-offset:3px!important}'
].join('\n');
const between=(x,min,max)=>Math.max(min,Math.min(max,x));
const positive=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
function cellStyle(cell){cell.style.border='1px solid #cbd5e1';cell.style.padding='12px';cell.style.textAlign='left';}
function validTable(table){
  if(!table?.rows?.length)throw new Error('Selecciona una tabla con celdas.');
  if([...table.rows].some(row=>[...row.cells].some(cell=>cell.rowSpan!==1||cell.colSpan!==1)))
    throw new Error('No se modifican tablas con celdas combinadas; primero descombínalas.');
  const width=table.rows[0].cells.length;
  if(!width||[...table.rows].some(row=>row.cells.length!==width))
    throw new Error('La tabla tiene filas con diferente número de columnas.');
  return width;
}
export function modifyStudioTable(table,action,{cell=null}={}){
  const width=validTable(table),rows=table.rows.length;
  const target=cell&&table.contains(cell)?cell:table.rows[Math.min(1,rows-1)].cells[0];
  const r=target.parentElement.rowIndex,c=target.cellIndex;
  const doc=table.ownerDocument;
  let nextCell=null;
  if(action==='rowAbove'||action==='rowBelow'){
    if(rows>=MAX_ROWS)throw new Error('Esta tabla ya tiene 80 filas.');
    const index=action==='rowAbove'&&r>0?r:r+1;
    const newRow=table.insertRow(between(index,0,rows));
    for(let i=0;i<width;i++){const td=newRow.insertCell(-1);cellStyle(td);td.textContent='';}
    nextCell=newRow.cells[c]||newRow.cells[0];
  }else if(action==='colLeft'||action==='colRight'){
    if(width>=MAX_COLUMNS)throw new Error('Esta tabla ya tiene 20 columnas.');
    const index=action==='colLeft'?c:c+1;
    for(const row of [...table.rows]){
      const td=doc.createElement(row.cells[0]?.tagName==='TH'?'th':'td');cellStyle(td);
      row.insertBefore(td,row.cells[index]||null);
      if(row.rowIndex===r)nextCell=td;
    }
  }else if(action==='deleteRow'){
    if(rows<=1)throw new Error('Una tabla debe conservar al menos una fila.');
    table.deleteRow(r);nextCell=table.rows[between(r,0,table.rows.length-1)]?.cells[between(c,0,width-1)];
  }else if(action==='deleteCol'){
    if(width<=1)throw new Error('Una tabla debe conservar al menos una columna.');
    for(const row of [...table.rows])row.deleteCell(c);
    nextCell=table.rows[between(r,0,rows-1)].cells[between(c,0,width-2)];
  }else throw new RangeError('Operación de tabla desconocida.');
  return nextCell||null;
}
function button(doc,label,action,title=label){
  const el=doc.createElement('button');el.type='button';el.textContent=label;
  el.dataset.objectAction=action;el.title=title;el.setAttribute('aria-label',title);return el;
}
const isObject=(node,surface)=>Boolean(node&&surface.contains(node)&&node.matches?.(OBJECT_SELECTOR));
const positionOf=el=>({x:positive(el.dataset.p2lrnObjectX,0),y:positive(el.dataset.p2lrnObjectY,0)});
function setPosition(el,x,y){
  x=Math.round(between(x,-4000,4000));y=Math.round(between(y,-4000,4000));
  el.dataset.p2lrnObjectX=String(x);el.dataset.p2lrnObjectY=String(y);
  el.style.transform='translate('+x+'px, '+y+'px)';
}
export function mountStudioObjectTools({host,surface,onStatus=()=>{},onSelection=()=>{}}={}){
  if(!host||!surface?.isContentEditable)throw new TypeError('Object tools require an editable HTML surface.');
  const doc=surface.ownerDocument,root=host.getRootNode();
  const styleRoot=root.nodeType===9?doc.head:root;
  if(!styleRoot.querySelector('[data-p2lrn-object-style]')){
    const style=doc.createElement('style');style.dataset.p2lrnObjectStyle='1';style.textContent=STYLES;styleRoot.append(style);
  }
  if(getComputedStyle(host).position==='static')host.style.position='relative';
  const frame=doc.createElement('div');frame.className='p2lrn-object-selection';
  frame.setAttribute('aria-label','Objeto seleccionado');
  const controls=doc.createElement('div');controls.className='p2lrn-object-controls';
  controls.setAttribute('role','toolbar');controls.setAttribute('aria-label','Posición y tamaño del objeto');
  const status=doc.createElement('span');status.className='p2lrn-object-label';controls.append(status);
  // Movement and resizing are the only floating controls. All other actions
  // are available once in Formato, beside typography and table properties.
  controls.append(button(doc,'Mover','drag','Arrastrar objeto'));
  const resize=button(doc,'','resize','Arrastrar para redimensionar objeto');
  resize.className='p2lrn-object-resize';
  frame.append(controls,resize);host.append(frame);
  let selected=null,selectedCell=null,drag=null;
  let dropTarget=null;
  function findDropTarget(event,source){
    const hits=(root.elementsFromPoint?.(event.clientX,event.clientY)||
      doc.elementsFromPoint?.(event.clientX,event.clientY)||[]);
    for(const hit of hits){
      if(!surface.contains(hit)||source.contains(hit))continue;
      const candidate=hit.closest?.('td,th,[data-p2lrn-layout]');
      if(!candidate||!surface.contains(candidate)||candidate===source||candidate.contains(source))continue;
      const parent=studioNestedInsertionContainer(surface,{targetElement:candidate,anchorNode:hit});
      if(parent&&parent!==source.parentElement&&parent!==source&&!source.contains(parent))return parent;
    }
    return null;
  }
  function markDropTarget(next){
    if(dropTarget===next)return;
    dropTarget?.classList.remove('p2lrn-studio-drop-target');
    dropTarget=next;
    dropTarget?.classList.add('p2lrn-studio-drop-target');
  }
  const emit=()=>surface.dispatchEvent(new Event('input',{bubbles:true}));
  if(normalizeStudioShapeCaptions(surface))emit();
  function update(){
    if(!isObject(selected,surface)||!selected.getClientRects().length){
      frame.dataset.visible='false';return;
    }
    const geo=selected.getBoundingClientRect(),container=host.getBoundingClientRect();
    frame.style.left=(geo.left-container.left+host.scrollLeft)+'px';
    frame.style.top=(geo.top-container.top+host.scrollTop)+'px';
    frame.style.width=geo.width+'px';frame.style.height=geo.height+'px';
    frame.dataset.visible='true';
    const table=selected.matches('table');
    // Table operations belong to the unified contextual inspector.
    status.textContent=table?'TABLA':selected.dataset.p2lrnLayout==='columns'?'COLUMNAS':'OBJETO';
  }
  function select(element,cell=null){
    selected=isObject(element,surface)?element:null;
    selectedCell=selected?.matches('table')?(cell?.closest?.('td,th')||selected.querySelector('td,th')):null;
    update();
    onSelection({element:selected,table:selected?.matches('table')?selected:null,cell:selectedCell});
    return selected;
  }
  const current=()=>selected&&surface.contains(selected)?selected:null;
  const change=()=>{emit();update();};
  function act(action,value){
    const el=current();
    if(!el)throw new Error('Selecciona antes un bloque, tabla o forma.');
    if(['rowAbove','rowBelow','colLeft','colRight','deleteRow','deleteCol'].includes(action)){
      if(!el.matches('table'))throw new Error('Selecciona una celda de tabla.');
      selectedCell=modifyStudioTable(el,action,{cell:selectedCell});change();return el;
    }
    if(action==='cellFill'){
      if(!el.matches('table')||!selectedCell)throw new Error('Selecciona una celda de la tabla.');
      const color=String(value||'');if(!/^#[0-9a-f]{6}$/i.test(color))throw new Error('Color de celda no válido.');
      selectedCell.style.backgroundColor=color;change();return el;
    }
    if(action==='cellAlignLeft'||action==='cellAlignCenter'||action==='cellAlignRight'){
      if(!el.matches('table')||!selectedCell)throw new Error('Selecciona una celda de la tabla.');
      selectedCell.style.textAlign=action==='cellAlignLeft'?'left':action==='cellAlignCenter'?'center':'right';
      change();return el;
    }
    if(action==='rowHeight'){
      if(!el.matches('table')||!selectedCell)throw new Error('Selecciona una celda de la tabla.');
      selectedCell.parentElement.style.height=Math.round(between(positive(value,42),28,320))+'px';
      change();return el;
    }
    if(action==='duplicate'){
      const clone=el.cloneNode(true);for(const node of [clone,...clone.querySelectorAll('[id]')])node.removeAttribute('id');
      el.after(clone);select(clone);change();return clone;
    }
    if(action==='remove'){el.remove();select(null);emit();return null;}
    if(action==='up'){
      const previous=el.previousElementSibling;if(previous){previous.before(el);change();}return el;
    }
    if(action==='down'){
      const next=el.nextElementSibling;if(next){next.after(el);change();}return el;
    }
    if(action==='reset'){setPosition(el,0,0);change();return el;}
    if(action==='nudge'){
      const pos=positionOf(el),offset=value||{x:0,y:0};
      setPosition(el,pos.x+offset.x,pos.y+offset.y);change();return el;
    }
    if(action==='width'){
      const px=between(positive(value,el.getBoundingClientRect().width),120,Math.max(120,surface.clientWidth));
      el.style.width=Math.round(px)+'px';el.style.maxWidth='100%';change();return el;
    }
    if(action==='height'){
      if(el.matches('table'))throw new Error('La altura de las tablas se regula con sus filas.');
      el.style.minHeight=Math.round(between(positive(value,el.getBoundingClientRect().height),40,1800))+'px';
      change();return el;
    }
    if(['left','center','right'].includes(action)){
      const pos=positionOf(el);setPosition(el,0,pos.y);
      el.style.marginLeft=action==='left'?'0':'auto';
      el.style.marginRight=action==='right'?'0':'auto';
      change();return el;
    }
    throw new RangeError('Herramienta de objeto desconocida.');
  }
  function perform(action,value){
    try{return act(action,value);}
    catch(error){onStatus(error.message);return false;}
  }
  const onClick=event=>{
    if(!surface.contains(event.target))return;
    // Media has its own persistent editing inspector; do not also expose
    // the enclosing section's object tools when selecting an image/video.
    if(event.target.closest?.('img[data-p2lrn-lesson-image],video[data-p2lrn-lesson-video]')){select(null);return;}
    const element=event.target.closest?.(OBJECT_SELECTOR);
    if(element&&surface.contains(element))select(element,event.target.closest?.('td,th'));
    else select(null);
  };
  function startDrag(event,kind){
    if(!current()||event.button!==0)return;
    event.preventDefault();event.stopPropagation();
    const target=current(),geo=target.getBoundingClientRect();
    drag={pointerId:event.pointerId,kind,target,startX:event.clientX,startY:event.clientY,
      position:positionOf(target),width:geo.width,height:geo.height,moved:false};
    try{event.currentTarget.setPointerCapture?.(event.pointerId);}catch{}
  }
  function onPointerMove(event){
    if(!drag||drag.pointerId!==event.pointerId)return;
    event.preventDefault();
    const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY,el=drag.target;
    if(drag.kind==='drag'){
      const cur=el.getBoundingClientRect(),box=surface.getBoundingClientRect();
      const minX=drag.position.x+box.left-cur.left+8;
      const maxX=drag.position.x+box.right-cur.right-8;
      const minY=drag.position.y+box.top-cur.top+8;
      setPosition(el,between(drag.position.x+dx,minX,maxX),Math.max(minY,drag.position.y+dy));
    }else{
      const maxWidth=Math.max(120,surface.clientWidth);
      el.style.width=Math.round(between(drag.width+dx,120,maxWidth))+'px';
      el.style.maxWidth='100%';
      if(!el.matches('table'))el.style.minHeight=Math.round(between(drag.height+dy,40,1800))+'px';
    }
    if(drag.kind==='drag')markDropTarget(findDropTarget(event,el));
    drag.moved=true;update();
  }
  function finishDrag(event){
    if(!drag||drag.pointerId!==event.pointerId)return;
    const {moved,kind,target}=drag;drag=null;
    try{event.currentTarget.releasePointerCapture?.(event.pointerId);}catch{}
    // Re-hit-test on release because nested layouts can shift during a drag.
    if(moved&&kind==='drag')markDropTarget(findDropTarget(event,target));
    const parent=dropTarget;markDropTarget(null);
    if(moved&&kind==='drag'&&parent&&parent!==target.parentElement&&!target.contains(parent)){
      parent.append(target);setPosition(target,0,0);
      select(target);onStatus('Elemento anidado dentro del contenedor de destino.');
    }
    if(moved)change();
  }
  const handle=controls.querySelector('[data-object-action=drag]');
  handle.addEventListener('pointerdown',event=>startDrag(event,'drag'));
  resize.addEventListener('pointerdown',event=>startDrag(event,'resize'));
  for(const part of [handle,resize]){
    part.addEventListener('pointermove',onPointerMove);
    part.addEventListener('pointerup',finishDrag);
    part.addEventListener('pointercancel',finishDrag);
  }
  controls.addEventListener('click',event=>{
    const action=event.target.closest?.('[data-object-action]')?.dataset.objectAction;
    if(!action||action==='drag')return;
    event.preventDefault();perform(action);
  });
  controls.addEventListener('keydown',event=>{
    if(!event.target.closest?.('[data-object-action=drag]'))return;
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(delta){event.preventDefault();perform('nudge',{x:delta[0]*(event.shiftKey?10:2),y:delta[1]*(event.shiftKey?10:2)});}
  });
  surface.addEventListener('click',onClick);
  const scroll=()=>update();
  doc.addEventListener('scroll',scroll,true);
  const win=doc.defaultView;win?.addEventListener('resize',scroll);
  let resizeObserver=null;
  if(typeof ResizeObserver!=='undefined'){
    resizeObserver=new ResizeObserver(()=>{if(selected)update();});resizeObserver.observe(surface);
  }
  return {element:frame,select,current,perform,get table(){return current()?.matches('table')?current():null;},
    get cell(){return selectedCell;},refresh:update,clear(){select(null);},
    dispose(){
      markDropTarget(null);
      resizeObserver?.disconnect();surface.removeEventListener('click',onClick);
      doc.removeEventListener('scroll',scroll,true);win?.removeEventListener('resize',scroll);frame.remove();
    }
  };
}
