import {studioNestedInsertionContainer} from './visual-layout.js';
import {normalizeStudioShapeCaptions,bezierArrowClip} from './studio-shapes.js';
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
  '.p2lrn-freeform-points{position:absolute;inset:0;pointer-events:none}',
  '.p2lrn-freeform-point{position:absolute;width:18px;height:18px;min-height:18px;min-width:18px;border:2px solid white;box-shadow:0 0 0 1px #1453a0;border-radius:50%;background:#2563eb;pointer-events:auto;cursor:move;transform:translate(-50%,-50%)}',
  '.p2lrn-freeform-point:focus-visible{outline:3px solid #111827;outline-offset:3px}',
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
const isDiagramChild=el=>['diagram-canvas','diagram-group'].includes(el?.parentElement?.dataset?.p2lrnLayout);
export function percentDiagramGeometry(x,y,width,height,containerWidth,containerHeight){
  if([x,y,width,height,containerWidth,containerHeight].some(v=>!Number.isFinite(v))||containerWidth<=0||containerHeight<=0)
    throw new RangeError('Invalid diagram geometry');
  const round=n=>Math.round(n*10000)/10000;
  return {left:round(between(x/containerWidth*100,0,100)),
    top:round(between(y/containerHeight*100,0,100)),
    width:round(between(width/containerWidth*100,1,100)),
    height:round(between(height/containerHeight*100,1,100))};
}
const positionOf=el=>{
  if(isDiagramChild(el)){
    const box=el.parentElement.getBoundingClientRect();
    return {x:positive(parseFloat(el.style.left),0)*box.width/100,
      y:positive(parseFloat(el.style.top),0)*box.height/100};
  }
  return {x:positive(el.dataset.p2lrnObjectX,0),y:positive(el.dataset.p2lrnObjectY,0)};
};
const angleOf=el=>positive(el.dataset.p2lrnObjectRotation,0);
const polygonPoints=art=>{
  const value=art?.style?.clipPath||'';
  if(!/^polygon\(/i.test(value))return [];
  const matches=[...value.matchAll(/([\d.]+)%\s+([\d.]+)%/g)];
  if(matches.length<3||matches.length>64)return [];
  return matches.map(match=>({x:between(Number(match[1]),0,100),y:between(Number(match[2]),0,100)}));
};
const writePolygonPoints=(art,points)=>{
  if(points.length<3||points.length>64||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))
    throw new RangeError('La forma debe tener entre 3 y 64 vértices válidos.');
  art.style.clipPath='polygon('+points.map(p=>p.x.toFixed(2)+'% '+p.y.toFixed(2)+'%').join(',')+')';
};
// Keep translation and rotation in a single authored transform so moving an
// already rotated object never discards its orientation.
export function objectTransform(x,y,angle=0){
  for(const value of [x,y,angle])if(!Number.isFinite(value))throw new TypeError('Invalid object transform');
  return 'translate('+x+'px, '+y+'px)'+(angle?' rotate('+angle+'deg)':'');
}
function applyObjectTransform(el){
  const {x,y}=positionOf(el),angle=angleOf(el);
  el.style.transform=isDiagramChild(el)?(angle?'rotate('+angle+'deg)':'none'):objectTransform(x,y,angle);
}
function setPosition(el,x,y){
  if(isDiagramChild(el)){
    const container=el.parentElement.getBoundingClientRect();
    if(!container.width||!container.height)return;
    const element=el.getBoundingClientRect();
    const left=between(x/container.width*100,0,Math.max(0,100-element.width/container.width*100));
    const top=between(y/container.height*100,0,Math.max(0,100-element.height/container.height*100));
    el.style.left=left.toFixed(4)+'%';el.style.top=top.toFixed(4)+'%';
    el.style.position='absolute';
    delete el.dataset.p2lrnObjectX;delete el.dataset.p2lrnObjectY;
    applyObjectTransform(el);return;
  }
  x=Math.round(between(x,-4000,4000));y=Math.round(between(y,-4000,4000));
  el.dataset.p2lrnObjectX=String(x);el.dataset.p2lrnObjectY=String(y);
  applyObjectTransform(el);
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
  const pointLayer=doc.createElement('div');pointLayer.className='p2lrn-freeform-points';
  frame.append(controls,resize,pointLayer);host.append(frame);
  let selected=null,selectedCell=null,drag=null;
  const selectionSet=new Set();
  const scrollPane=surface.closest('.p2lrn-studio-stage,.studio-editor-stage,.stage');
  const ensureScrollRoom=el=>{
    // Transforms do not grow scrollHeight. Expand only the editor's unsaved
    // surface box, so a moved object below the fold remains reachable.
    const bottom=el.getBoundingClientRect().bottom;
    const area=surface.getBoundingClientRect();
    const needed=Math.max(0,Math.ceil(bottom-area.bottom+96));
    const existing=parseFloat(surface.style.paddingBottom)||0;
    if(needed>existing)surface.style.paddingBottom=(needed+existing)+'px';
  };
  const safeDividerY=(el,desired)=>{
    let y=desired;
    const r=el.getBoundingClientRect(),current=positionOf(el).y;
    for(const separator of surface.querySelectorAll('hr')){
      if(el.contains(separator)||separator.contains(el))continue;
      const b=separator.getBoundingClientRect();
      if(r.bottom<=b.top-8&&r.bottom+(y-current)>b.top-8)
        y=Math.min(y,current+(b.top-8-r.bottom));
      if(r.top>=b.bottom+8&&r.top+(y-current)<b.bottom+8)
        y=Math.max(y,current+(b.bottom+8-r.top));
    }
    return y;
  };
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
  // Recover objects already translated below the flow in an existing lesson.
  for(const object of surface.querySelectorAll(OBJECT_SELECTOR)){
    if(object.getClientRects().length)ensureScrollRoom(object);
  }
  if(normalizeStudioShapeCaptions(surface))emit();
  let renderedFreeform=null;
  function renderPolygonHandles(){
    if(selected?.dataset?.p2lrnShape!=='freeform'||angleOf(selected)!==0){
      pointLayer.replaceChildren();renderedFreeform=null;return;
    }
    const art=selected.querySelector('[data-p2lrn-shape-art]');
    const points=polygonPoints(art);
    if(!points.length){pointLayer.replaceChildren();renderedFreeform=null;return;}
    const outer=selected.getBoundingClientRect(),inside=art.getBoundingClientRect();
    if(renderedFreeform!==selected||pointLayer.children.length!==points.length){
      pointLayer.replaceChildren();renderedFreeform=selected;
      for(const [index] of points.entries()){
        const handle=button(doc,'','vertex','Mover vértice '+(index+1));
        handle.className='p2lrn-freeform-point';handle.dataset.vertexIndex=String(index);
        handle.addEventListener('pointerdown',event=>{
          if(event.button!==0)return;
          event.preventDefault();event.stopPropagation();
          drag={pointerId:event.pointerId,kind:'vertex',target:selected,index,moved:false,
          startX:event.clientX,startY:event.clientY,initialScroll:scrollPane?.scrollTop||0};
          try{pointLayer.setPointerCapture(event.pointerId);}catch{}
        });
        handle.addEventListener('keydown',event=>{
          const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
          if(!delta)return;
          event.preventDefault();
          const current=polygonPoints(art),step=event.shiftKey?5:1;
          current[index]={x:between(current[index].x+delta[0]*step,0,100),
            y:between(current[index].y+delta[1]*step,0,100)};
          writePolygonPoints(art,current);change();
          pointLayer.querySelector('[data-vertex-index="'+index+'"]')?.focus();
        });
        pointLayer.append(handle);
      }
    }
    for(const [index,point] of points.entries()){
      const handle=pointLayer.children[index];
      handle.style.left=(inside.left-outer.left+inside.width*point.x/100)+'px';
      handle.style.top=(inside.top-outer.top+inside.height*point.y/100)+'px';
    }
  }
  function update(){
    if(!isObject(selected,surface)||!selected.getClientRects().length){
      frame.dataset.visible='false';pointLayer.replaceChildren();return;
    }
    const geo=selected.getBoundingClientRect(),container=host.getBoundingClientRect();
    frame.style.left=(geo.left-container.left+host.scrollLeft)+'px';
    frame.style.top=(geo.top-container.top+host.scrollTop)+'px';
    frame.style.width=geo.width+'px';frame.style.height=geo.height+'px';
    frame.dataset.visible='true';
    renderPolygonHandles();
    const table=selected.matches('table');
    // Table operations belong to the unified contextual inspector.
    status.textContent=selectionSet.size>1?selectionSet.size+' OBJETOS':
      table?'TABLA':selected.dataset.p2lrnLayout==='columns'?'COLUMNAS':'OBJETO';
  }
  function select(element,cell=null,extend=false){
    const candidate=isObject(element,surface)?element:null;
    if(!extend||!candidate||selectionSet.size===0){
      selectionSet.clear();
      if(candidate)selectionSet.add(candidate);
      selected=candidate;
    }else if([...selectionSet].every(item=>item.parentElement===candidate.parentElement)){
      if(selectionSet.has(candidate))selectionSet.delete(candidate);
      else selectionSet.add(candidate);
      selected=selectionSet.has(candidate)?candidate:[...selectionSet].at(-1)||null;
    }else{
      onStatus('Para agrupar, selecciona elementos del mismo contenedor.');
      return selected;
    }
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
    if(['alignTop','alignMiddle','alignBottom','distributeX','distributeY'].includes(action)){
      const elements=[...selectionSet].filter(node=>isObject(node,surface));
      if(elements.length<2)throw new Error('Selecciona varios objetos manteniendo Mayús.');
      if(elements.some(node=>node.parentElement!==elements[0].parentElement))
        throw new Error('Los objetos deben compartir el mismo contenedor.');
      const rects=elements.map(node=>node.getBoundingClientRect());
      const reference=rects[0];
      if(action.startsWith('align')){
        const top=action==='alignTop'?reference.top:
          action==='alignMiddle'?(reference.top+reference.bottom)/2:reference.bottom;
        for(let i=1;i<elements.length;i++){
          const r=rects[i],current=action==='alignTop'?r.top:
            action==='alignMiddle'?(r.top+r.bottom)/2:r.bottom;
          const pos=positionOf(elements[i]);
          setPosition(elements[i],pos.x,pos.y+top-current);
        }
      }else{
        if(elements.length<3)throw new Error('Selecciona al menos tres objetos para distribuir.');
        const horizontal=action==='distributeX';
        const items=elements.map((node,i)=>({node,r:rects[i]}))
          .sort((a,b)=>horizontal?a.r.left-b.r.left:a.r.top-b.r.top);
        const begin=horizontal?items[0].r.left:items[0].r.top;
        const end=horizontal?items.at(-1).r.right:items.at(-1).r.bottom;
        const extent=items.reduce((sum,item)=>sum+(horizontal?item.r.width:item.r.height),0);
        const gap=(end-begin-extent)/(items.length-1);
        if(gap<0)throw new Error('No hay espacio suficiente para distribuir los objetos.');
        let cursor=begin;
        for(const [index,item] of items.entries()){
          if(index>0&&index<items.length-1){
            const p=positionOf(item.node),current=horizontal?item.r.left:item.r.top;
            const delta=cursor-current;
            setPosition(item.node,horizontal?p.x+delta:p.x,horizontal?p.y:p.y+delta);
          }
          cursor+=(horizontal?item.r.width:item.r.height)+gap;
        }
      }
      change();return elements;
    }
    if(action==='group'){
      const items=[...selectionSet].filter(node=>surface.contains(node));
      if(items.length<2)throw new Error('Selecciona dos o más objetos manteniendo Mayús.');
      const parent=items[0].parentElement;
      if(items.some(node=>node.parentElement!==parent))throw new Error('Los objetos deben estar en el mismo contenedor.');
      const siblings=[...parent.children];
      items.sort((a,b)=>siblings.indexOf(a)-siblings.indexOf(b));
      const start=siblings.indexOf(items[0]);
      if(siblings.slice(start,start+items.length).some((node,index)=>node!==items[index]))
        throw new Error('Los objetos deben ser consecutivos. Muévelos juntos antes de agrupar.');
      const group=doc.createElement('section');
      const inDiagram=parent.dataset?.p2lrnLayout==='diagram-canvas'||parent.dataset?.p2lrnLayout==='diagram-group';
      group.dataset.p2lrnLayout=inDiagram?'diagram-group':'group';
      group.setAttribute('role','group');group.setAttribute('aria-label','Grupo de objetos');
      if(inDiagram){
        const geometry=items.map(item=>({
          item,left:positive(parseFloat(item.style.left),0),
          top:positive(parseFloat(item.style.top),0),
          width:positive(parseFloat(item.style.width),20),
          height:positive(parseFloat(item.style.height),24)
        }));
        const left=Math.min(...geometry.map(g=>g.left)),top=Math.min(...geometry.map(g=>g.top));
        const right=Math.max(...geometry.map(g=>g.left+g.width));
        const bottom=Math.max(...geometry.map(g=>g.top+g.height));
        const width=Math.max(right-left,1),height=Math.max(bottom-top,1);
        Object.assign(group.style,{position:'absolute',left:left+'%',top:top+'%',
          width:width+'%',height:height+'%',maxWidth:'none',minHeight:'0',margin:'0',
          padding:'0',boxSizing:'border-box',overflow:'visible'});
        items[0].before(group);
        for(const g of geometry){
          group.append(g.item);
          g.item.style.left=((g.left-left)/width*100).toFixed(4)+'%';
          g.item.style.top=((g.top-top)/height*100).toFixed(4)+'%';
          g.item.style.width=(g.width/width*100).toFixed(4)+'%';
          g.item.style.height=(g.height/height*100).toFixed(4)+'%';
        }
      }else{
        Object.assign(group.style,{display:'flow-root',position:'relative',boxSizing:'border-box',
          width:'100%',maxWidth:'100%',padding:'0',margin:'16px 0'});
        items[0].before(group);
        for(const item of items)group.append(item);
      }
      select(group);change();return group;
    }
    if(action==='ungroup'){
      const group=['group','diagram-group'].includes(el.dataset.p2lrnLayout)?el:
        el.closest('[data-p2lrn-layout="group"],[data-p2lrn-layout="diagram-group"]');
      if(!group||!surface.contains(group))throw new Error('Selecciona un grupo para desagrupar.');
      const children=[...group.childNodes];
      if(group.dataset.p2lrnLayout==='diagram-group'){
        const left=positive(parseFloat(group.style.left),0),top=positive(parseFloat(group.style.top),0);
        const width=positive(parseFloat(group.style.width),100),height=positive(parseFloat(group.style.height),100);
        for(const child of children){
          if(!child.style)continue;
          const cx=positive(parseFloat(child.style.left),0),cy=positive(parseFloat(child.style.top),0);
          const cw=positive(parseFloat(child.style.width),100),ch=positive(parseFloat(child.style.height),100);
          child.style.left=(left+cx*width/100).toFixed(4)+'%';
          child.style.top=(top+cy*height/100).toFixed(4)+'%';
          child.style.width=(cw*width/100).toFixed(4)+'%';
          child.style.height=(ch*height/100).toFixed(4)+'%';
        }
      }
      group.replaceWith(...children);
      select(children.find(node=>isObject(node,surface))||null);change();return children;
    }
    if(action==='layerHide'){
      el.style.visibility=el.style.visibility==='hidden'?'visible':'hidden';
      change();return el;
    }
    if(action==='layerLock'){
      const locked=el.dataset.p2lrnLayerLocked==='true';
      el.dataset.p2lrnLayerLocked=locked?'false':'true';
      el.style.pointerEvents=locked?'auto':'none';
      change();return el;
    }
    if(action==='duplicate'){
      const clone=el.cloneNode(true);for(const node of [clone,...clone.querySelectorAll('[id]')])node.removeAttribute('id');
      el.after(clone);select(clone);change();return clone;
    }
    if(action==='remove'){el.remove();select(null);emit();return null;}
    if(action==='front'){
      const parent=el.parentElement;
      const caret=parent?.querySelector(':scope > p[data-p2lrn-end-caret]');
      if(caret&&caret!==el)caret.before(el);
      else parent?.append(el);
      change();return el;
    }
    if(action==='back'){
      el.parentElement?.prepend(el);change();return el;
    }
    if(action==='up'){
      const previous=el.previousElementSibling;if(previous){previous.before(el);change();}return el;
    }
    if(action==='down'){
      const next=el.nextElementSibling;if(next){next.after(el);change();}return el;
    }
    if(action==='reset'){setPosition(el,0,0);change();return el;}
    if(action==='rotate'){
      if(!el.matches('[data-p2lrn-layout="shape"], [data-p2lrn-layout="text-box"], figure'))
        throw new Error('La rotación solo está disponible para formas, imágenes y cuadros de texto.');
      const degrees=Number(value);
      if(!Number.isFinite(degrees)||Math.abs(degrees)>3600)
        throw new Error('Introduce un ángulo válido entre -3600 y 3600 grados.');
      const normalized=((Math.round(degrees)%360)+360)%360;
      el.dataset.p2lrnObjectRotation=String(normalized);
      applyObjectTransform(el);ensureScrollRoom(el);change();return el;
    }
    if(action==='rotateStep')return act('rotate',angleOf(el)+Number(value||0));
    if(action==='bezierLeft'||action==='bezierRight'){
      if(el.dataset.p2lrnShape!=='bezier-arrow')throw new Error('Selecciona una flecha curva ajustable.');
      const number=Number(value);
      if(!Number.isFinite(number)||number<0||number>100)
        throw new RangeError('La altura debe estar entre 0 y 100.');
      const left=action==='bezierLeft'?number:positive(el.dataset.p2lrnBezierLeft,18);
      const right=action==='bezierRight'?number:positive(el.dataset.p2lrnBezierRight,18);
      const art=el.querySelector('[data-p2lrn-shape-art]');
      if(!art)throw new Error('No se ha encontrado la flecha curva.');
      art.style.clipPath=bezierArrowClip(left,right);
      el.dataset.p2lrnBezierLeft=String(left);
      el.dataset.p2lrnBezierRight=String(right);
      change();return el;
    }
    if(action==='curve'){
      if(el.dataset.p2lrnShape!=='curved-arrow')throw new Error('Selecciona una flecha curva.');
      const bend=Number(value);
      if(!Number.isFinite(bend)||bend<0||bend>100)throw new RangeError('Curvatura entre 0 y 100.');
      const art=el.querySelector('[data-p2lrn-shape-art]');
      if(!art)throw new Error('La flecha curva no tiene contorno.');
      art.style.borderRadius='0 0 '+Math.round(bend)+'% 0';
      el.dataset.p2lrnCurve=String(Math.round(bend));
      change();return el;
    }
    if(action==='nudge'){
      const pos=positionOf(el),offset=value||{x:0,y:0};
      const y=safeDividerY(el,pos.y+offset.y);
      setPosition(el,pos.x+offset.x,y);ensureScrollRoom(el);change();return el;
    }
    if(action==='width'){
      const scene=isDiagramChild(el)?el.parentElement.getBoundingClientRect():null;
      const px=between(positive(value,el.getBoundingClientRect().width),scene?12:120,scene?scene.width:Math.max(120,surface.clientWidth));
      el.style.width=scene?(px/scene.width*100).toFixed(4)+'%':Math.round(px)+'px';
      el.style.maxWidth=scene?'none':'100%';change();return el;
    }
    if(action==='height'){
      if(el.matches('table'))throw new Error('La altura de las tablas se regula con sus filas.');
      const scene=isDiagramChild(el)?el.parentElement.getBoundingClientRect():null;
      const height=between(positive(value,el.getBoundingClientRect().height),scene?12:40,scene?scene.height:1800);
      if(scene){el.style.height=(height/scene.height*100).toFixed(4)+'%';el.style.minHeight='0';}
      else el.style.minHeight=Math.round(height)+'px';
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
    if(element&&surface.contains(element)&&element.dataset.p2lrnLayerLocked!=='true')select(element,event.target.closest?.('td,th'),event.shiftKey);
    else if(!event.shiftKey)select(null);
  };
  function startDrag(event,kind){
    if(!current()||event.button!==0)return;
    event.preventDefault();event.stopPropagation();
    const target=current(),geo=target.getBoundingClientRect();
    drag={pointerId:event.pointerId,kind,target,startX:event.clientX,startY:event.clientY,
      position:positionOf(target),width:geo.width,height:geo.height,moved:false,
      initialScroll:scrollPane?.scrollTop||0};
    try{event.currentTarget.setPointerCapture?.(event.pointerId);}catch{}
  }
  function onPointerMove(event){
    if(!drag||drag.pointerId!==event.pointerId)return;
    event.preventDefault();
    const dx=event.clientX-drag.startX;
    const el=drag.target,viewport=scrollPane?.getBoundingClientRect();
    // Scroll inside the existing Studio stage while carrying an object.
    if(viewport&&drag.kind==='drag'){
      if(event.clientY>viewport.bottom-48)scrollPane.scrollTop+=24;
      else if(event.clientY<viewport.top+48)scrollPane.scrollTop-=24;
    }
    const dy=event.clientY-drag.startY+((scrollPane?.scrollTop||0)-drag.initialScroll);
    if(drag.kind==='vertex'){
      const art=el.querySelector('[data-p2lrn-shape-art]');
      const bounds=art?.getBoundingClientRect();
      const points=polygonPoints(art);
      if(!bounds?.width||!bounds?.height||!points[drag.index])return;
      points[drag.index]={x:between((event.clientX-bounds.left)/bounds.width*100,0,100),
        y:between((event.clientY-bounds.top)/bounds.height*100,0,100)};
      writePolygonPoints(art,points);drag.moved=true;update();return;
    }
    if(drag.kind==='drag'){
      const cur=el.getBoundingClientRect(),box=(isDiagramChild(el)?el.parentElement:surface).getBoundingClientRect();
      const minX=drag.position.x+box.left-cur.left+8;
      const maxX=drag.position.x+box.right-cur.right-8;
      const minY=drag.position.y+box.top-cur.top+8;
      const proposed=Math.max(minY,drag.position.y+dy);
      setPosition(el,between(drag.position.x+dx,minX,maxX),safeDividerY(el,proposed));
      ensureScrollRoom(el);
    }else{
      const maxWidth=Math.max(120,surface.clientWidth);
      if(isDiagramChild(el)){
        const bounds=el.parentElement.getBoundingClientRect();
        el.style.width=(between(drag.width+dx,12,bounds.width)/bounds.width*100).toFixed(4)+'%';
        el.style.height=(between(drag.height+dy,12,bounds.height)/bounds.height*100).toFixed(4)+'%';
        el.style.minHeight='0';el.style.maxWidth='none';
      }else{
        el.style.width=Math.round(between(drag.width+dx,120,maxWidth))+'px';
        el.style.maxWidth='100%';
        if(!el.matches('table'))el.style.minHeight=Math.round(between(drag.height+dy,40,1800))+'px';
      }
    }
    if(drag.kind==='drag'&&!isDiagramChild(el))markDropTarget(findDropTarget(event,el));
    drag.moved=true;update();
  }
  function finishDrag(event){
    if(!drag||drag.pointerId!==event.pointerId)return;
    const {moved,kind,target}=drag;drag=null;
    try{event.currentTarget.releasePointerCapture?.(event.pointerId);}catch{}
    // Re-hit-test on release because nested layouts can shift during a drag.
    if(moved&&kind==='drag'&&!isDiagramChild(target))markDropTarget(findDropTarget(event,target));
    const parent=dropTarget;markDropTarget(null);
    if(moved&&kind==='drag'&&parent&&parent!==target.parentElement&&!target.contains(parent)){
      parent.append(target);setPosition(target,0,0);
      select(target);onStatus('Elemento anidado dentro del contenedor de destino.');
    }else if(moved&&kind==='drag'){
      const holder=target.parentElement;
      if(holder?.matches?.('[data-p2lrn-layout]:not([data-p2lrn-layout="drag-drop"])')){
        const bounds=target.getBoundingClientRect(),space=holder.getBoundingClientRect();
        const within=bounds.left>=space.left-6&&bounds.right<=space.right+6&&
          bounds.top>=space.top-6&&bounds.bottom<=space.bottom+6;
        if(!within){
          // A visibly detached blue square must no longer move with its old
          // parent. Preserve its screen position when making it a sibling.
          holder.after(target);
          const after=target.getBoundingClientRect(),pos=positionOf(target);
          setPosition(target,pos.x+bounds.left-after.left,pos.y+bounds.top-after.top);
          select(target);onStatus('Objeto separado de su contenedor anterior.');
        }
      }
    }
    if(moved){ensureScrollRoom(target);change();}
  }
  const handle=controls.querySelector('[data-object-action=drag]');
  handle.addEventListener('pointerdown',event=>startDrag(event,'drag'));
  resize.addEventListener('pointerdown',event=>startDrag(event,'resize'));
  pointLayer.addEventListener('pointermove',onPointerMove);
  pointLayer.addEventListener('pointerup',finishDrag);
  pointLayer.addEventListener('pointercancel',finishDrag);
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
