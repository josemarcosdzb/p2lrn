import {VISUAL_LAYOUT_BLOCKS,insertVisualLayoutBlock} from './visual-layout.js';

// Canonical Studio chrome. Both the hosted Studio and @p2lrn/studio mount
// this exact control tree and CSS; platform-specific commands stay adapters.
export const STUDIO_COMMAND_BAR_VERSION='1';
const PALETTE=Object.freeze([
  ['white','Blanco','#ffffff'],['fog','Niebla','#f1f5f9'],
  ['blue','Azul','#eff6ff'],['sand','Arena','#fef3c7']
]);
const FONT_FAMILIES=['Arial','Calibri','Georgia','Verdana','Times New Roman'];
const FONT_SIZES=[12,14,16,18,20,24,28,32,40,48];
const BLOCK_STYLES=[['p','Párrafo'],['h1','Título 1'],['h2','Título 2'],['h3','Título 3'],['blockquote','Cita']];
let instance=0;
const CSS=[
  '.p2lrn-studio-unified{display:block!important;padding:0!important;border:1px solid #dbe2eb!important;border-radius:13px!important;background:#fff!important;box-shadow:0 6px 22px rgba(15,23,42,.06)!important;overflow:visible!important;min-width:0!important}',
  '.p2lrn-studio-unified[hidden]{display:none!important}',
  '.p2lrn-studio-unified > :not(.p2lrn-studio-ribbon){display:none!important}',
  '.p2lrn-studio-ribbon,.p2lrn-studio-ribbon *{box-sizing:border-box}',
  '.p2lrn-studio-ribbon{font:500 13px/1.35 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1f2937;min-width:0}',
  '.p2lrn-ribbon-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 15px;border-bottom:1px solid #e8edf3}',
  '.p2lrn-ribbon-identity{display:flex;align-items:center;gap:10px;min-width:0}',
  '.p2lrn-ribbon-mark{display:grid;place-items:center;flex:none;width:33px;height:33px;border-radius:9px;background:#111827;color:#fff;font-weight:800;letter-spacing:-.08em;font-size:14px}',
  '.p2lrn-ribbon-name{display:grid;gap:1px;min-width:0}',
  '.p2lrn-ribbon-name strong{font-size:13px;letter-spacing:-.02em}',
  '.p2lrn-ribbon-name small{color:#667085;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:330px}',
  '.p2lrn-ribbon-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;justify-content:flex-end}',
  '.p2lrn-studio-ribbon button,.p2lrn-studio-ribbon select,.p2lrn-studio-ribbon input{font:inherit}',
  '.p2lrn-studio-ribbon button,.p2lrn-studio-ribbon .p2lrn-file-menu>summary,.p2lrn-studio-ribbon .p2lrn-import-menu>summary{min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #dbe2eb;border-radius:7px;background:#fff;color:#344054;padding:7px 10px;cursor:pointer;text-decoration:none;white-space:nowrap}',
  '.p2lrn-studio-ribbon button:hover:not(:disabled),.p2lrn-studio-ribbon summary:hover{background:#f4f7fa;border-color:#bac6d5}',
  '.p2lrn-studio-ribbon button:focus-visible,.p2lrn-studio-ribbon summary:focus-visible,.p2lrn-studio-ribbon select:focus-visible,.p2lrn-studio-ribbon input:focus-visible{outline:2px solid #4b77bf;outline-offset:2px}',
  '.p2lrn-studio-ribbon button:disabled{opacity:.48;cursor:not-allowed}',
  '.p2lrn-studio-ribbon button.p2lrn-primary{background:#1f2937;color:white;border-color:#1f2937;font-weight:650}',
  '.p2lrn-studio-ribbon button.p2lrn-primary:hover:not(:disabled){background:#344054}',
  '.p2lrn-studio-ribbon button[aria-pressed=true]{background:#eaf1fa;border-color:#b7c9e4;color:#1d4c83}',
  '.p2lrn-ribbon-tabs{display:flex;align-items:center;gap:5px;padding:6px 14px 0;border-bottom:1px solid #e8edf3;overflow-x:auto}',
  '.p2lrn-studio-ribbon .p2lrn-ribbon-tab{background:transparent;border:0;border-bottom:2px solid transparent;border-radius:0;min-height:36px;padding:8px 15px;color:#667085;font-weight:600}',
  '.p2lrn-studio-ribbon .p2lrn-ribbon-tab[aria-selected=true]{color:#243e64;border-bottom-color:#243e64}',
  '.p2lrn-ribbon-panel{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:11px 15px;min-height:64px}',
  '.p2lrn-ribbon-panel[hidden]{display:none!important}',
  '.p2lrn-ribbon-group{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
  '.p2lrn-ribbon-divider{width:1px;height:28px;background:#e5e9f0;flex:none}',
  '.p2lrn-ribbon-field{display:grid;gap:3px;font-size:10px;font-weight:650;color:#667085}',
  '.p2lrn-studio-ribbon select{height:35px;min-width:85px;max-width:155px;border:1px solid #dbe2eb;border-radius:7px;background:#fff;color:#344054;padding:0 7px}',
  '.p2lrn-ribbon-icon{font-weight:750;min-width:34px;padding:6px!important}',
  '.p2lrn-ribbon-icon[data-italic=true]{font-style:italic}',
  '.p2lrn-ribbon-icon[data-underline=true]{text-decoration:underline}',
  '.p2lrn-ribbon-icon[data-strike=true]{text-decoration:line-through}',
  '.p2lrn-ribbon-color{display:flex;align-items:center;gap:4px;min-height:34px;padding:3px 7px;border:1px solid #dbe2eb;border-radius:7px;color:#344054}',
  '.p2lrn-ribbon-color input{width:25px;height:25px;border:0;background:transparent;padding:0;cursor:pointer}',
  '.p2lrn-ribbon-caption{font-size:11px;color:#667085}',
  '.p2lrn-file-menu,.p2lrn-import-menu{position:relative}',
  '.p2lrn-file-menu>summary,.p2lrn-import-menu>summary{list-style:none}',
  '.p2lrn-file-menu>summary::-webkit-details-marker,.p2lrn-import-menu>summary::-webkit-details-marker{display:none}',
  '.p2lrn-file-pop{position:absolute;z-index:100;top:calc(100% + 8px);left:0;display:grid;gap:5px;width:235px;max-width:calc(100vw - 30px);background:#fff;border:1px solid #dbe2eb;border-radius:10px;padding:8px;box-shadow:0 18px 35px rgba(15,23,42,.13)}',
  '.p2lrn-file-pop button{justify-content:flex-start!important;border:0!important;width:100%}',
  '.p2lrn-file-pop label{font-size:11px;color:#667085;display:grid;gap:5px;padding:5px}',
  '.p2lrn-file-pop input{width:100%;min-height:34px;border:1px solid #dbe2eb;border-radius:7px;padding:5px 8px}',
  '.p2lrn-file-pop .p2lrn-menu-separator{border-top:1px solid #edf0f4;margin:3px 0}',
  '.p2lrn-import-menu .add-pop{position:absolute!important;top:calc(100% + 7px)!important;left:0!important;z-index:120!important;width:min(680px,calc(100vw - 38px))!important;max-height:min(76vh,650px);overflow:auto;background:white;border:1px solid #dbe2eb;border-radius:10px;box-shadow:0 20px 45px rgba(15,23,42,.16)}',
  '.p2lrn-import-menu .add-help{display:none!important}',
  '.p2lrn-ribbon-swatch{width:17px;height:17px;display:inline-block;border-radius:5px;border:1px solid #d0d5dd;flex:none}',
  '.p2lrn-studio-workspace{display:grid!important;grid-template-columns:minmax(230px,260px) minmax(0,1fr)!important;gap:12px!important;min-height:630px}',
  '.p2lrn-studio-workspace[hidden]{display:none!important}',
  '.p2lrn-studio-outline{min-width:0;border:1px solid #e2e7ee;border-radius:11px;background:#fff;overflow:auto}',
  '.p2lrn-studio-canvas{min-width:0;border:1px solid #e2e7ee;border-radius:11px;background:#f0f3f7;overflow:hidden}',
  '.p2lrn-studio-stage{min-height:630px;padding:20px;background:#f0f3f7}',
  '.p2lrn-studio-sheet{width:100%;max-width:1040px;min-height:520px;margin:0 auto;padding:30px;background:#fff;border:1px solid #e5e9ef;border-radius:9px;box-shadow:0 3px 13px rgba(15,23,42,.045);overflow-wrap:anywhere}',
  '.p2lrn-studio-sheet-head{display:grid;gap:7px;padding-bottom:20px;margin-bottom:22px;border-bottom:1px solid #edf0f4}',
  '.p2lrn-studio-sheet-head h1{font-size:clamp(24px,3vw,35px);font-weight:700;letter-spacing:-.035em;line-height:1.16}',
  '.p2lrn-studio-sheet-head p{font-size:14px;color:#667085}',
  '.p2lrn-studio-outline-title{padding:15px;border-bottom:1px solid #edf0f4;background:#fafbfd;display:grid;gap:4px}',
  '.p2lrn-studio-outline-title small{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#667085}',
  '.p2lrn-studio-outline-title strong{font-size:13px}',
  '.p2lrn-studio-sheet :is(.studio-wysiwyg,.surface){min-height:360px;font-size:16px;line-height:1.7;color:#253044}',
  '.p2lrn-studio-sheet :is(img,video,table){max-width:100%}',
  '@media(max-width:860px){.p2lrn-studio-workspace{grid-template-columns:minmax(0,1fr)!important}.p2lrn-studio-outline{max-height:260px}.p2lrn-ribbon-top{align-items:flex-start}.p2lrn-studio-stage{padding:12px}.p2lrn-studio-sheet{padding:18px}.p2lrn-ribbon-actions{justify-content:flex-start}}',
  '@media(max-width:520px){.p2lrn-ribbon-top{padding:10px}.p2lrn-ribbon-panel{padding:10px}.p2lrn-ribbon-name small{max-width:180px}.p2lrn-ribbon-group{gap:4px}.p2lrn-ribbon-divider{display:none}}'
].join('\n');

function node(doc,tag,cls,text){
  const el=doc.createElement(tag);
  if(cls)el.className=cls;
  if(text!==undefined)el.textContent=text;
  return el;
}
function button(doc,label,{title,cls,action,pressed}={}){
  const el=node(doc,'button',cls||'',label);
  el.type='button';if(title)el.title=title;if(action)el.dataset.uiAction=action;
  if(pressed!==undefined)el.setAttribute('aria-pressed',String(pressed));
  return el;
}
function select(doc,items,label){
  const el=node(doc,'select');el.setAttribute('aria-label',label);
  for(const [key,text] of items){
    const o=node(doc,'option','',text);o.value=String(key);el.append(o);
  }
  return el;
}
export function applyUnifiedStudioWorkspace({workspace,outline,canvas,stage,sheet}={}){
  for(const [item,cls] of [[workspace,'p2lrn-studio-workspace'],[outline,'p2lrn-studio-outline'],[canvas,'p2lrn-studio-canvas'],[stage,'p2lrn-studio-stage'],[sheet,'p2lrn-studio-sheet']])
    if(item)item.classList.add(cls);
}
export function mountStudioCommandBar({mount,resolveSurface,actions={},onStatus=()=>{},addContentElement=null}={}){
  if(!mount||typeof resolveSurface!=='function')throw new TypeError('Studio necesita un contenedor y un editor activo.');
  const doc=mount.ownerDocument;
  const root=mount.getRootNode();
  const styleHost=root.nodeType===9?doc.head:root;
  if(!styleHost.querySelector('[data-p2lrn-shared-studio-style]')){
    const style=node(doc,'style');style.dataset.p2lrnSharedStudioStyle=STUDIO_COMMAND_BAR_VERSION;style.textContent=CSS;styleHost.append(style);
  }
  mount.classList.add('p2lrn-studio-unified');
  const bar=node(doc,'div','p2lrn-studio-ribbon');
  const top=node(doc,'div','p2lrn-ribbon-top');
  const identity=node(doc,'div','p2lrn-ribbon-identity');
  const mark=node(doc,'div','p2lrn-ribbon-mark','P');
  const name=node(doc,'div','p2lrn-ribbon-name');
  name.append(node(doc,'strong','', 'P2LRN Studio'));
  const documentName=node(doc,'small','', 'Editor visual de cursos');
  name.append(documentName);identity.append(mark,name);top.append(identity);
  const topActions=node(doc,'div','p2lrn-ribbon-actions');
  const fileMenu=node(doc,'details','p2lrn-file-menu');
  fileMenu.append(node(doc,'summary','','Archivo'));
  const filePop=node(doc,'div','p2lrn-file-pop');
  const fileItems=[
    ['create','Nuevo curso'],['open','Abrir .p2lrn'],
    ['save','Guardar'],['export','Descargar .p2lrn'],
    ['offline','Entrega offline'],['review','Revisar entrega']
  ];
  for(const [id,label] of fileItems){if(actions[id])filePop.append(button(doc,label,{action:id}));}
  if(actions.openUrl){
    const field=node(doc,'label','','Abrir desde URL');
    const url=node(doc,'input');url.type='url';url.placeholder='https://.../curso.p2lrn';
    url.setAttribute('aria-label','URL del curso P2LRN');
    const openUrl=button(doc,'Abrir URL',{action:'openUrl'});
    openUrl.addEventListener('click',()=>{if(url.value.trim())void run('openUrl',url.value.trim());else onStatus('Introduce primero una URL válida.');});
    // Open URL bypasses the generic action router to pass its input.
    openUrl.removeAttribute('data-ui-action');
    field.append(url,openUrl);filePop.append(field);
  }
  fileMenu.append(filePop);
  topActions.append(fileMenu);
  if(actions.create)topActions.append(button(doc,'Nuevo',{action:'create'}));
  if(actions.open)topActions.append(button(doc,'Abrir',{action:'open'}));
  const save=button(doc,'Guardar',{action:'save'});
  if(actions.save)topActions.append(save);
  const preview=button(doc,'Vista alumno',{action:'preview',pressed:false});
  if(actions.preview)topActions.append(preview);
  const exportButton=button(doc,'Exportar .p2lrn',{action:'export',cls:'p2lrn-primary'});
  if(actions.export)topActions.append(exportButton);
  top.append(topActions);bar.append(top);
  const tabs=node(doc,'div','p2lrn-ribbon-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Herramientas de edición');
  const panels=node(doc,'div');
  const tabDefs=[['home','Inicio'],['insert','Insertar'],['design','Diseño']];
  const tabControls=[];
  const panelMap=new Map();
  const uid=++instance;
  const activateTab=(id)=>{
    for(const [key,tab] of tabControls){const active=key===id;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;panelMap.get(key).hidden=!active;}
  };
  for(const [id,title] of tabDefs){
    const tab=button(doc,title,{cls:'p2lrn-ribbon-tab'});
    tab.setAttribute('role','tab');tab.id='p2lrn-studio-tab-'+uid+'-'+id;
    tab.setAttribute('aria-controls','p2lrn-studio-panel-'+uid+'-'+id);
    const panel=node(doc,'div','p2lrn-ribbon-panel');
    panel.id='p2lrn-studio-panel-'+uid+'-'+id;panel.setAttribute('role','tabpanel');
    panel.setAttribute('aria-labelledby',tab.id);
    tab.addEventListener('click',()=>activateTab(id));
    tab.addEventListener('keydown',(event)=>{
      if(event.key!=='ArrowRight'&&event.key!=='ArrowLeft')return;
      event.preventDefault();
      const index=tabDefs.findIndex(([key])=>key===id);
      const next=tabControls[(index+(event.key==='ArrowRight'?1:-1)+tabDefs.length)%tabDefs.length][1];
      next.focus();next.click();
    });
    tabs.append(tab);panels.append(panel);tabControls.push([id,tab]);panelMap.set(id,panel);
  }
  activateTab('home');bar.append(tabs,panels);
  const home=panelMap.get('home'),insert=panelMap.get('insert'),design=panelMap.get('design');
  const group=(parent)=>{
    const g=node(doc,'div','p2lrn-ribbon-group');parent.append(g);return g;
  };
  const field=(parent,label,control)=>{
    const f=node(doc,'label','p2lrn-ribbon-field');
    f.append(node(doc,'span','',label),control);parent.append(f);return control;
  };
  const styleGroup=group(home);
  const block=field(styleGroup,'Párrafo',select(doc,BLOCK_STYLES,'Estilo de párrafo'));
  const font=field(styleGroup,'Fuente',select(doc,FONT_FAMILIES.map(v=>[v,v]),'Tipo de letra'));font.value='Calibri';
  const size=field(styleGroup,'Tamaño',select(doc,FONT_SIZES.map(v=>[v,String(v)]),'Tamaño de letra'));size.value='20';
  home.append(node(doc,'span','p2lrn-ribbon-divider'));
  const formatGroup=group(home);
  const formatButtons=[
    ['bold','B','Negrita'],['italic','I','Cursiva'],['underline','U','Subrayado'],['strikeThrough','S','Tachado'],
    ['justifyLeft','≡','Alinear a la izquierda'],['justifyCenter','≣','Centrar'],
    ['justifyRight','☷','Alinear a la derecha'],['insertUnorderedList','• Lista','Lista con viñetas'],
    ['insertOrderedList','1. Lista','Lista numerada'],['undo','↶','Deshacer'],['redo','↷','Rehacer']
  ];
  const commandButtons=new Map();
  for(const [id,label,title] of formatButtons){
    const b=button(doc,label,{title,cls:'p2lrn-ribbon-icon'});
    b.dataset.uiCommand=id;
    if(id==='italic')b.dataset.italic='true';
    if(id==='underline')b.dataset.underline='true';
    if(id==='strikeThrough')b.dataset.strike='true';
    b.addEventListener('mousedown',(event)=>event.preventDefault());
    b.addEventListener('click',()=>applyCommand(id));
    formatGroup.append(b);commandButtons.set(id,b);
  }
  home.append(node(doc,'span','p2lrn-ribbon-divider'));
  const colorGroup=group(home);
  for(const [label,value,cmd] of [['Texto','#1f2937','foreColor'],['Resaltar','#fff2ae','hiliteColor']]){
    const wrapper=node(doc,'label','p2lrn-ribbon-color');
    wrapper.append(node(doc,'span','',label));
    const input=node(doc,'input');input.type='color';input.value=value;input.title=label;input.setAttribute('aria-label','Color: '+label);
    input.addEventListener('input',()=>applyCommand(cmd,input.value));
    wrapper.append(input);colorGroup.append(wrapper);
  }
  const structure=group(insert);
  for(const [action,title] of [['addUnit','+ Unidad'],['addLesson','+ Lección']])
    if(actions[action])structure.append(button(doc,title,{action}));
  if(addContentElement){
    addContentElement.classList.add('p2lrn-import-menu');
    for(const el of addContentElement.querySelectorAll('[data-help]'))if(!el.title)el.title=el.dataset.help;
    structure.append(addContentElement);
  }else if(actions.addContent)structure.append(button(doc,'Añadir actividad',{action:'addContent'}));
  insert.append(node(doc,'span','p2lrn-ribbon-divider'));
  const layouts=group(insert);
  for(const item of VISUAL_LAYOUT_BLOCKS){
    const b=button(doc,item.label,{title:'Insertar '+item.label.toLowerCase()});
    b.dataset.uiLayout=item.id;
    b.addEventListener('mousedown',(event)=>event.preventDefault());
    b.addEventListener('click',()=>addLayout(item.id));
    layouts.append(b);
  }
  const colors=group(design);
  colors.append(node(doc,'span','p2lrn-ribbon-caption','Fondo del bloque seleccionado'));
  for(const [,label,color] of PALETTE){
    const b=button(doc,label,{title:'Aplicar fondo '+label.toLowerCase()});
    const swatch=node(doc,'span','p2lrn-ribbon-swatch');swatch.style.backgroundColor=color;
    b.prepend(swatch);b.addEventListener('mousedown',(e)=>e.preventDefault());
    b.addEventListener('click',()=>colorBlock(color));colors.append(b);
  }

  let savedRange=null,savedSurface=null,lastVisualBlock=null,previewMode=false,hasDocument=false;
  function surface(){
    const value=resolveSurface();
    return value?.isContentEditable&&value.dataset?.studioHtmlSurface==='true'?value:null;
  }
  function selection(){
    const rootSelection=root!==doc&&typeof root.getSelection==='function'?root.getSelection():null;
    return rootSelection??doc.getSelection();
  }
  function remember(){
    const s=surface(),sel=selection();
    if(!s||!sel?.rangeCount||!sel.anchorNode||!s.contains(sel.anchorNode))return;
    savedSurface=s;savedRange=sel.getRangeAt(0).cloneRange();
  }
  function restore(s){
    const prior=savedRange&&savedSurface===s&&s.contains(savedRange.commonAncestorContainer)?savedRange.cloneRange():null;
    s.focus();
    const sel=selection();
    if(prior&&sel){sel.removeAllRanges();sel.addRange(prior);}
    return sel;
  }
  function changed(s){
    s.dispatchEvent(new Event('input',{bubbles:true}));
    remember();
  }
  function applyCommand(name,value=null){
    const s=surface();
    if(!s){onStatus('Selecciona una lección HTML para aplicar formato.');return;}
    restore(s);
    const commandDoc=s.ownerDocument;
    if(typeof commandDoc.execCommand!=='function'){onStatus('El navegador no permite aplicar este formato.');return;}
    if(['fontName','fontSize','foreColor','hiliteColor'].includes(name))
      commandDoc.execCommand('styleWithCSS',false,true);
    const ok=commandDoc.execCommand(name,false,value);
    if(!ok){onStatus('No se pudo aplicar '+name+'. Selecciona texto e inténtalo de nuevo.');return;}
    if(name==='fontSize'){
      for(const element of s.querySelectorAll('[style]'))
        if(element.style.fontSize==='xxx-large')element.style.fontSize=value+'px';
      for(const element of [...s.querySelectorAll('font[size="7"]')]){
        const span=commandDoc.createElement('span');span.style.fontSize=value+'px';span.append(...element.childNodes);
        element.replaceWith(span);
      }
    }
    changed(s);
    refreshButtons();
  }
  function refreshButtons(){
    const enabled=Boolean(surface())&&!previewMode;
    for(const b of commandButtons.values())b.disabled=!enabled;
    for(const cmd of ['bold','italic','underline','strikeThrough']){
      const b=commandButtons.get(cmd);if(!b)continue;
      let selected=false;
      try{selected=enabled&&doc.queryCommandState?.(cmd)===true;}catch{}
      b.setAttribute('aria-pressed',String(selected));
    }
  }
  function addLayout(kind){
    const s=surface();
    if(!s){onStatus('Selecciona una lección HTML para insertar un bloque visual.');return;}
    const anchor=savedSurface===s&&savedRange&&s.contains(savedRange.commonAncestorContainer)?savedRange.commonAncestorContainer:null;
    try{lastVisualBlock=insertVisualLayoutBlock(s,kind,{anchorNode:anchor});onStatus('Bloque insertado. Puedes editarlo directamente.');}
    catch(error){onStatus(error.message);}
  }
  function colorBlock(color){
    const s=surface();
    if(!s){onStatus('Selecciona una lección con un bloque visual.');return;}
    let anchor=savedSurface===s&&savedRange&&s.contains(savedRange.commonAncestorContainer)?savedRange.commonAncestorContainer:null;
    if(anchor?.nodeType===3)anchor=anchor.parentElement;
    const block=anchor?.closest?.('[data-p2lrn-layout]')||lastVisualBlock;
    if(!block||!s.contains(block)){onStatus('Selecciona un bloque visual antes de cambiar su fondo.');return;}
    block.style.backgroundColor=color;changed(s);
    onStatus('Diseño del bloque actualizado.');
  }
  async function run(name,...args){
    if(!hasDocument&&!['create','open','openUrl'].includes(name)){onStatus('Abre o crea un curso primero.');return;}
    if(typeof actions[name]!=='function')return;
    try{await actions[name](...args);if(name==='preview')setPreviewMode(true);if(name==='edit')setPreviewMode(false);fileMenu.open=false;}
    catch(error){onStatus(String(error?.message??error));}
  }
  bar.addEventListener('click',(event)=>{
    const target=event.target.closest?.('[data-ui-action]');
    if(!target||!bar.contains(target))return;
    const action=target.dataset.uiAction;
    if(action==='preview'&&previewMode)void run('edit');
    else void run(action);
  });
  block.addEventListener('change',()=>applyCommand('formatBlock',block.value));
  font.addEventListener('change',()=>applyCommand('fontName',font.value));
  size.addEventListener('change',()=>applyCommand('fontSize',size.value));
  doc.addEventListener('selectionchange',remember);
  if(root!==doc)root.addEventListener('selectionchange',remember);
  mount.append(bar);
  function setPreviewMode(value){
    previewMode=Boolean(value);
    preview.textContent=previewMode?'Volver a editar':'Vista alumno';
    preview.dataset.uiAction=previewMode?'edit':'preview';
    preview.setAttribute('aria-pressed',String(previewMode));
    refreshButtons();
  }
  function setDocument(value,label=''){
    hasDocument=Boolean(value);
    documentName.textContent=label||'Editor visual de cursos';
    for(const b of bar.querySelectorAll('[data-ui-action]')){
      const action=b.dataset.uiAction;
      b.disabled=!hasDocument&&!['create','open','openUrl'].includes(action);
    }
    refreshButtons();
  }
  setDocument(false);
  return {
    element:bar,
    setDocument,
    setPreviewMode,
    refresh:refreshButtons,
    openTab:activateTab,
    dispose(){
      doc.removeEventListener('selectionchange',remember);
      if(root!==doc)root.removeEventListener('selectionchange',remember);
      bar.remove();
    }
  };
}
