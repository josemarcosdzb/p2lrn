// Shared, dependency-free visual composition tools for HTML lessons.
// The saved output is ordinary semantic HTML: no scripts or embedded runtimes.
const BLOCKS=Object.freeze([
  ['section','Sección','Sección visual con título y texto'],
  ['columns','Dos columnas','Comparación visual en dos columnas'],
  ['callout','Destacado','Recuadro para ideas importantes'],
  ['table','Tabla','Tabla editable de dos columnas'],
  ['divider','Separador','Separador horizontal'],
]);
const setStyle=(node,properties)=>{Object.assign(node.style,properties);return node;};
const elt=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
function makeBlock(kind){
  if(kind==='divider')return elt('hr');
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
  setStyle(section,{margin:'22px 0',padding:'22px',borderRadius:'12px'});
  if(kind==='callout'){
    setStyle(section,{backgroundColor:'#eff6ff',borderLeft:'4px solid #2563eb'});
    section.append(elt('h2','Idea clave'),elt('p','Escribe aquí el contenido destacado.'));
  }else if(kind==='columns'){
    const heading=elt('h2','Comparación');
    const grid=elt('div');
    setStyle(grid,{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'18px'});
    for(const title of ['Primera columna','Segunda columna']){
      const cell=elt('div');
      setStyle(cell,{padding:'16px',border:'1px solid #d0d5dd',borderRadius:'8px'});
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
function insertAtSelection(surface,block){
  const selection=surface.ownerDocument.getSelection();
  if(selection?.rangeCount&&surface.contains(selection.anchorNode)){
    let top=selection.anchorNode;
    while(top&&top.parentNode!==surface)top=top.parentNode;
    if(top&&top.parentNode===surface)top.after(block);
    else surface.append(block);
  }else surface.append(block);
  // Ensure the insertion is serialized by the existing Studio change handler.
  surface.dispatchEvent(new Event('input',{bubbles:true}));
  return block;
}
export function insertVisualLayoutBlock(surface,kind,{anchorNode=null}={}){
  if(!surface?.isContentEditable)throw new Error('Selecciona una lección HTML editable.');
  if(!BLOCKS.some(([id])=>id===kind))throw new RangeError('Bloque visual desconocido.');
  const block=makeBlock(kind);
  if(anchorNode&&surface.contains(anchorNode)){
    let top=anchorNode;
    while(top&&top.parentNode!==surface)top=top.parentNode;
    if(top?.parentNode===surface)top.after(block);
    else surface.append(block);
    surface.dispatchEvent(new Event('input',{bubbles:true}));
  }else insertAtSelection(surface,block);
  return block;
}
export function mountVisualLayoutTools({host,surface,onStatus}={}){
  if(!host||!surface)throw new TypeError('Studio visual tools require host and editable surface.');
  const bar=elt('div');bar.className='p2lrn-layout-toolbar';
  bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Insertar diseño visual');
  setStyle(bar,{display:'flex',flexWrap:'wrap',gap:'7px',alignItems:'center',padding:'10px',margin:'0 0 12px',border:'1px solid #d0d5dd',borderRadius:'9px',backgroundColor:'#fff'});
  const heading=elt('strong','Diseño visual');setStyle(heading,{fontSize:'13px',marginRight:'8px'});bar.append(heading);
  for(const [kind,label,help] of BLOCKS){
    const button=elt('button',label);button.type='button';button.title=help;
    button.setAttribute('aria-label','Insertar '+label.toLowerCase());
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
