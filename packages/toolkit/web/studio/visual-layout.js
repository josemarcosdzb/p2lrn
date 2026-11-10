import {createStudioShape,getStudioShape,STUDIO_SHAPES} from './studio-shapes.js';
import {createStudioDropActivity} from './studio-drop-activity.js';
import {studioUiText} from './studio-ui-i18n.js';
// Shared visual composition tools for HTML lessons.
// The saved output is ordinary semantic HTML: no scripts or embedded runtimes.
const BLOCKS=Object.freeze([
  ['section','Sección','Sección visual con título y texto'],
  ['columns','Dos columnas','Comparación visual en dos columnas'],
  ['three-columns','Tres columnas','Composición adaptable con tres paneles'],
  ['diagram-canvas','Lienzo de diagrama','Composición proporcional con elementos superpuestos y editables'],
  ['callout','Destacado','Recuadro para ideas importantes'],
  ['table','Tabla','Tabla editable de dos columnas'],
  ['text-box','Cuadro de texto','Texto independiente que puedes mover y redimensionar'],
  ['shape','Forma','Forma visual editable y redimensionable'],
  ['dropdown','Desplegable','Contenido que se abre o se cierra con clic o teclado'],
  ['drag-drop','Arrastrar y soltar','Actividad con zonas sobre imagen y bandeja de fichas'],
  ['divider','Separador','Separador horizontal'],
]);
const setStyle=(node,properties)=>{Object.assign(node.style,properties);return node;};
const elt=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=studioUiText(text,node.ownerDocument);return node;};
function makeBlock(kind){
  if(kind==='diagram-canvas'){
    const wrap=elt('section');
    wrap.dataset.p2lrnLayout='diagram-scroll';
    wrap.setAttribute('role','region');
    wrap.setAttribute('aria-label',studioUiText('Diagrama desplazable horizontalmente en pantallas pequeñas',wrap.ownerDocument));
    setStyle(wrap,{width:'100%',maxWidth:'min(100%, calc(100vw - 48px))',overflowX:'auto',overflowY:'hidden',
      boxSizing:'border-box',margin:'18px 0',padding:'0'});
    const scene=elt('section');
    scene.dataset.p2lrnLayout='diagram-canvas';
    scene.setAttribute('role','group');
    scene.setAttribute('aria-label',studioUiText('Lienzo de diagrama editable',scene.ownerDocument));
    setStyle(scene,{position:'relative',display:'block',width:'100%',minWidth:'640px',
      aspectRatio:'16 / 9',boxSizing:'border-box',margin:'18px 0',padding:'0',
      border:'1px solid #cbd5e1',borderRadius:'12px',backgroundColor:'#f8fbff',
      overflow:'hidden',containerType:'inline-size'});
    wrap.append(scene);return wrap;
  }
  if(kind==='divider'){
    const hr=elt('hr');
    setStyle(hr,{display:'block',boxSizing:'border-box',width:'100%',height:'0',
      border:'0',borderTop:'2px solid #94a3b8',margin:'30px 0',clear:'both'});
    hr.setAttribute('aria-label',studioUiText('Separador de secciones',hr.ownerDocument));
    return hr;
  }
  if(kind==='drag-drop')return createStudioDropActivity(document);
  if(kind==='dropdown'){
    const details=elt('details');details.dataset.p2lrnLayout='dropdown';details.open=true;
    setStyle(details,{width:'100%',maxWidth:'100%',boxSizing:'border-box',margin:'16px 0',padding:'12px 16px',border:'1px solid #94a3b8',borderRadius:'9px',backgroundColor:'#f8fafc'});
    const summary=elt('summary','Pulsa para desplegar');
    setStyle(summary,{cursor:'pointer',fontSize:'18px',fontWeight:'650',color:'#0f172a'});
    const body=elt('div');setStyle(body,{padding:'10px 0',lineHeight:'1.6'});
    body.append(elt('p','Escribe aquí el contenido del desplegable.'));
    details.append(summary,body);return details;
  }
  if(kind.startsWith('shape:')){
    const id=kind.slice(6);
    if(!getStudioShape(id))throw new RangeError('Forma no reconocida.');
    return createStudioShape(document,id);
  }
  if(kind==='text-box'){
    const box=elt('section');box.dataset.p2lrnLayout='text-box';
    setStyle(box,{width:'420px',maxWidth:'100%',boxSizing:'border-box',minHeight:'96px',padding:'18px',margin:'16px 0',border:'1px dashed #94a3b8',borderRadius:'10px',backgroundColor:'#fff'});
    box.append(elt('p','Escribe aquí. Puedes mover y redimensionar este cuadro.'));
    return box;
  }
  if(kind==='shape')return createStudioShape(document,'rectangle');
  if(kind==='table'){
    const table=elt('table');table.setAttribute('data-p2lrn-layout','table');
    setStyle(table,{width:'100%',borderCollapse:'collapse',margin:'20px 0'});
    const tbody=elt('tbody');
    for(let row=0;row<3;row++){
      const tr=elt('tr');
      for(let col=0;col<2;col++){
        const cell=elt(row===0?'th':'td',row===0?'Encabezado': 'Contenido');
        setStyle(cell,{border:'1px solid #d0d5dd',padding:'12px',textAlign:'left'});
        tr.append(cell);
      }
      tbody.append(tr);
    }
    table.append(tbody);return table;
  }
  const section=elt('section');section.setAttribute('data-p2lrn-layout',kind);
  setStyle(section,{margin:'22px 0',padding:'22px',boxSizing:'border-box',maxWidth:'100%',borderRadius:'12px'});
  if(kind==='callout'){
    setStyle(section,{backgroundColor:'#eff6ff',borderLeft:'4px solid #2563eb'});
    section.append(elt('h2','Idea clave'),elt('p','Escribe aquí el contenido destacado.'));
  }else if(kind==='columns'||kind==='three-columns'){
    const three=kind==='three-columns';
    const heading=elt('h2',three?'Composición visual':'Comparación');
    const grid=elt('div');
    setStyle(grid,{display:'grid',gridTemplateColumns:three?'repeat(auto-fit,minmax(min(100%,180px),1fr))':'repeat(auto-fit,minmax(min(100%,220px),1fr))',gap:'18px'});
    for(const title of (three?['Panel izquierdo','Panel central','Panel derecho']:['Primera columna','Segunda columna'])){
      const cell=elt('div');
      setStyle(cell,{padding:'16px',boxSizing:'border-box',minWidth:'0',border:'1px solid #d0d5dd',borderRadius:'8px'});
      cell.append(elt('h3',title),elt('p','Escribe aquí.'));
      grid.append(cell);
    }
    section.append(heading,grid);
  }else{
    setStyle(section,{backgroundColor:'#f8fafc',border:'1px solid #d0d5dd'});
    section.append(elt('h2','Título de sección'),elt('p','Añade texto, imágenes y actividades relacionadas.'));
  }
  return section;
}
const VISUAL_CONTAINER='[data-p2lrn-layout],td,th';
const normalizeElement=node=>node?.nodeType===1?node:node?.parentElement||null;

// Resolve an actual nested HTML container, never an overlay.
export function studioNestedInsertionContainer(surface,{anchorNode=null,targetElement=null}={}){
  if(!surface?.isContentEditable)return null;
  const target=normalizeElement(targetElement);
  const anchor=normalizeElement(anchorNode);
  const from=target&&surface.contains(target)?target:anchor&&surface.contains(anchor)?anchor:null;
  if(!from)return null;
  const scope=from.closest?.(VISUAL_CONTAINER);
  if(!scope||!surface.contains(scope))return null;
  if(scope.matches('td,th'))return scope;
  const kind=scope.dataset.p2lrnLayout;
  // A drag/drop exercise is an interactive component, not a general layout
  // container. Clicking its empty background must insert AFTER the exercise.
  if(kind==='drag-drop')return null;
  // A selected shape remains an object, never a container for a second shape.
  // Insert diagram objects at the same scene level to preserve layer ordering.
  if(['shape','text-box'].includes(kind)){
    const diagram=scope.closest('[data-p2lrn-layout="diagram-canvas"], [data-p2lrn-layout="diagram-group"]');
    if(diagram)return diagram;
  }
  if(kind==='table'||scope.tagName==='TABLE'){
    const inside=anchor?.closest?.('td,th');
    return inside&&scope.contains(inside)?inside:scope.querySelector('td,th');
  }
  if(kind==='columns'||kind==='three-columns'){
    const grid=scope.querySelector(':scope > div');
    if(!grid)return scope;
    const column=[...grid.children].find(child=>child.contains(anchor));
    return column||grid.firstElementChild||scope;
  }
  if(kind==='divider'||scope.tagName==='HR')return scope.parentElement===surface?null:scope.parentElement;
  return scope;
}
// Keep a real editable paragraph after the final block so an author can put
// the caret beneath a full-height image, video, table or interactive exercise.
// Only blank paragraphs are reused; existing authored content is never cleared.
export function ensureStudioEndCaret(surface){
  if(!surface?.isContentEditable)return null;
  const root=surface.querySelector(':scope > [data-p2lrn-lesson-canvas]')||surface;
  let tail=root.querySelector(':scope > p[data-p2lrn-end-caret]');
  if(tail?.textContent?.trim()){
    tail.removeAttribute('data-p2lrn-end-caret');
    tail.removeAttribute('aria-label');
    tail=null;
  }
  if(!tail){
    const last=root.lastElementChild;
    if(last?.tagName==='P'&&!last.textContent?.trim())tail=last;
  }
  if(!tail){
    tail=surface.ownerDocument.createElement('p');
    tail.append(surface.ownerDocument.createElement('br'));
  }
  tail.setAttribute('data-p2lrn-end-caret','1');
  tail.setAttribute('aria-label',studioUiText('Escribir o insertar después de la última actividad',tail.ownerDocument));
  if(!tail.hasChildNodes())tail.append(surface.ownerDocument.createElement('br'));
  if(root.lastElementChild!==tail)root.append(tail);
  return tail;
}
export function prepareStudioDiagramChild(parent,element){
  if(!['diagram-canvas','diagram-group'].includes(parent?.dataset?.p2lrnLayout))return false;
  if(!element?.matches?.('[data-p2lrn-layout="shape"],[data-p2lrn-layout="text-box"],figure'))return false;
  const index=parent.querySelectorAll(':scope > [data-p2lrn-layout],:scope > figure').length;
  const left=8+(index%4)*22,top=10+(Math.floor(index/4)%3)*28;
  Object.assign(element.style,{position:'absolute',left:left+'%',top:top+'%',
    width:'20%',height:'24%',minHeight:'0',maxWidth:'none',margin:'0',padding:'0',
    boxSizing:'border-box'});
  if(element.dataset.p2lrnLayout==='shape'){
    const art=element.querySelector(':scope > [data-p2lrn-shape-art]');
    if(art){art.style.minHeight='0';art.style.height='100%';art.style.flex='1 1 auto';}
  }
  if(element.dataset.p2lrnLayout==='text-box'){
    element.style.fontSize='clamp(12px, 1.7cqw, 22px)';
    element.style.overflow='hidden';
  }
  return true;
}
export function insertStudioNestedElement(surface,element,{anchorNode=null,targetElement=null}={}){
  const parent=studioNestedInsertionContainer(surface,{anchorNode,targetElement});
  if(!parent)return null;
  const anchor=normalizeElement(anchorNode);
  if(parent.dataset?.p2lrnLayout==='diagram-canvas'){
    prepareStudioDiagramChild(parent,element);
    parent.append(element);
  }else if(anchor&&parent.contains(anchor)&&anchor!==parent){
    let direct=anchor;
    while(direct?.parentElement!==parent)direct=direct?.parentElement;
    if(direct?.parentElement===parent)direct.after(element);
    else parent.append(element);
  }else parent.append(element);
  ensureStudioEndCaret(surface);
  surface.dispatchEvent(new Event('input',{bubbles:true}));
  return parent;
}
function insertAtSelection(surface,block,{anchorNode=null,targetElement=null}={}){
  // A new scene is always a lesson-level surface. Nesting it inside the
  // previously selected table/shape makes the entire diagram only 240px wide.
  if(block?.dataset?.p2lrnLayout==='diagram-scroll'){
    const contentRoot=surface.querySelector(':scope > [data-p2lrn-lesson-canvas]')||surface;
    const selected=normalizeElement(targetElement||anchorNode);
    let direct=selected&&contentRoot.contains(selected)?selected:null;
    while(direct&&direct.parentElement!==contentRoot)direct=direct.parentElement;
    if(direct?.parentElement===contentRoot)direct.after(block);
    else contentRoot.append(block);
    ensureStudioEndCaret(surface);
    surface.dispatchEvent(new Event('input',{bubbles:true}));
    return block;
  }
  if(insertStudioNestedElement(surface,block,{anchorNode,targetElement}))return block;
  const domRoot=surface.getRootNode();
  const selection=typeof domRoot.getSelection==='function'?domRoot.getSelection():surface.ownerDocument.getSelection();
  const contentRoot=surface.querySelector(':scope > [data-p2lrn-lesson-canvas]')||surface;
  const pointer=anchorNode&&contentRoot.contains(anchorNode)?anchorNode:
    selection?.rangeCount&&contentRoot.contains(selection.anchorNode)?selection.anchorNode:null;
  // The editor may wrap the whole lesson in one canvas. Find the direct child
  // under the actual caret, not the outer canvas (which would force append or
  // an earlier selected object). This also works for the trailing paragraph.
  let direct=normalizeElement(pointer);
  while(direct&&direct.parentElement!==contentRoot)direct=direct.parentElement;
  if(direct?.parentElement===contentRoot)direct.after(block);
  else contentRoot.append(block);
  ensureStudioEndCaret(surface);
  surface.dispatchEvent(new Event('input',{bubbles:true}));
  return block;
}
export function insertVisualLayoutBlock(surface,kind,{anchorNode=null,targetElement=null}={}){
  if(!surface?.isContentEditable)throw new Error('Selecciona una lección HTML editable.');
  if(!BLOCKS.some(([id])=>id===kind)&&!(kind.startsWith('shape:')&&getStudioShape(kind.slice(6))))throw new RangeError('Bloque visual desconocido.');
  return insertAtSelection(surface,makeBlock(kind),{anchorNode,targetElement});
}
export function mountVisualLayoutTools({host,surface,onStatus}={}){
  if(!host||!surface)throw new TypeError('Studio visual tools require host and editable surface.');
  const bar=elt('div');bar.className='p2lrn-layout-toolbar';
  bar.setAttribute('role','toolbar');bar.setAttribute('aria-label',studioUiText('Insertar diseño visual',bar.ownerDocument));
  setStyle(bar,{display:'flex',flexWrap:'wrap',gap:'7px',alignItems:'center',padding:'10px',margin:'0 0 12px',border:'1px solid #d0d5dd',borderRadius:'9px',backgroundColor:'#fff'});
  const heading=elt('strong','Diseño visual');setStyle(heading,{fontSize:'13px',marginRight:'8px'});bar.append(heading);
  for(const [kind,label,help] of BLOCKS){
    const button=elt('button',label);button.type='button';button.title=help;
    button.setAttribute('aria-label',studioUiText('Insertar',button.ownerDocument)+' '+studioUiText(label,button.ownerDocument).toLowerCase());
    setStyle(button,{minHeight:'34px',padding:'6px 10px',border:'1px solid #cfd5de',borderRadius:'6px',backgroundColor:'#fff',cursor:'pointer'});
    button.addEventListener('mousedown',(event)=>event.preventDefault());
    button.addEventListener('click',()=>{
      if(!surface.isContentEditable){onStatus?.('Selecciona una lección HTML editable.');return;}
      const block=insertAtSelection(surface,makeBlock(kind));
      if(block.matches('section,table'))block.scrollIntoView({block:'nearest'});
      onStatus?.('Elemento visual insertado. Edita su contenido directamente.');
    });
    bar.append(button);
  }
  if(surface.parentNode===host)host.insertBefore(bar,surface);
  else host.prepend(bar);
  return {toolbar:bar,dispose(){bar.remove();}};
}
export const VISUAL_LAYOUT_BLOCKS=BLOCKS.map(([id,label])=>({id,label}));
export {STUDIO_SHAPES};
