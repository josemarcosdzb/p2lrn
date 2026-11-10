// Unified contextual editing for BOTH Studio hosts; formatting remains in Formato.
import {createStudioHistory} from './studio-history.js';
import {mountStudioObjectTools} from './studio-object-tools.js';

const TABLE_ACTIONS=[
  ['rowAbove','Fila arriba'],['rowBelow','Fila abajo'],
  ['colLeft','Columna izquierda'],['colRight','Columna derecha'],
  ['deleteRow','Quitar fila'],['deleteCol','Quitar columna']
];
const OBJECT_ACTIONS=[
  ['left','Izquierda'],['center','Centrar'],['right','Derecha'],
  ['duplicate','Duplicar'],['up','Adelantar'],['down','Atrasar'],
  ['reset','Restablecer'],['remove','Eliminar']
];
function element(doc,tag,className='',text){
  const el=doc.createElement(tag);if(className)el.className=className;
  if(text!==undefined)el.textContent=text;return el;
}
function button(doc,label,action){
  const el=element(doc,'button','',label);el.type='button';el.dataset.studioAdvancedAction=action;
  el.title=label;el.setAttribute('aria-label',label);return el;
}
function numberField(doc,label,value,min,max){
  const el=element(doc,'input');el.type='number';el.min=String(min);el.max=String(max);
  el.step='10';el.value=String(value);el.style.cssText='width:70px;min-height:34px;border:1px solid #dbe2eb;border-radius:7px;padding:5px';
  el.setAttribute('aria-label',label);return el;
}
function actionMenu(doc,label,items,kind){
  const details=element(doc,'details','p2lrn-context-menu');
  details.dataset.studioContextMenu=kind;
  const summary=element(doc,'summary','',label);
  const popup=element(doc,'div','p2lrn-context-menu-pop');
  for(const [action,text] of items)popup.append(button(doc,text,action));
  details.append(summary,popup);return {details,popup};
}

export function mountAdvancedStudioTools({bar,root,resolveSurface,onStatus=()=>{}}={}){
  if(!bar||!root||typeof resolveSurface!=='function')
    throw new TypeError('Advanced Studio requires a ribbon and an editable surface.');
  const doc=bar.ownerDocument;
  const context=bar.querySelector('[data-studio-context-tools]');
  const title=context?.querySelector('.p2lrn-ribbon-context-heading');
  const palette=context?.querySelector('.p2lrn-object-colors');
  const formatTab=bar.querySelector('[role=tab][aria-controls$="-home"]');
  const undo=bar.querySelector('[data-ui-command=undo]');
  const redo=bar.querySelector('[data-ui-command=redo]');
  if(!context||!title||!palette||!formatTab)
    throw new Error('Unified Studio context toolbar markup is missing.');

  const objectGroup=element(doc,'div','p2lrn-ribbon-group p2lrn-context-object');
  objectGroup.setAttribute('role','group');objectGroup.setAttribute('aria-label','Posición, tamaño y orden del objeto');
  objectGroup.append(actionMenu(doc,'Objeto',[
    ['left','Alinear izquierda'],['center','Centrar'],['right','Alinear derecha'],
    ['up','Adelantar'],['down','Atrasar'],['front','Traer al frente'],['back','Enviar al fondo'],
    ['group','Agrupar seleccionados'],['ungroup','Desagrupar'],['duplicate','Duplicar'],
    ['alignTop','Alinear arriba'],['alignMiddle','Alinear al centro vertical'],
    ['alignBottom','Alinear abajo'],['distributeX','Distribuir horizontalmente'],
    ['distributeY','Distribuir verticalmente'],
    ['reset','Restablecer posición'],['remove','Eliminar objeto']
  ],'objeto').details);
  const size=actionMenu(doc,'Tamaño',[],'tamano');
  const widthInput=numberField(doc,'Ancho del elemento en píxeles',420,120,1600);
  const heightInput=numberField(doc,'Altura mínima del elemento en píxeles',100,40,1800);
  size.popup.append(element(doc,'span','p2lrn-ribbon-caption','Ancho px'),widthInput,button(doc,'Aplicar ancho','width'));
  size.popup.append(element(doc,'span','p2lrn-ribbon-caption','Alto px'),heightInput,button(doc,'Aplicar alto','height'));
  objectGroup.append(size.details);
  const typography=actionMenu(doc,'Texto del diagrama',[],'texto-diagrama');
  const textScale=numberField(doc,'Tamaño de texto proporcional al lienzo (cqw)',1.7,0.8,9.5);
  textScale.step='0.1';
  typography.popup.append(element(doc,'span','p2lrn-ribbon-caption','Texto proporcional (cqw)'),
    textScale,button(doc,'Aplicar tamaño proporcional','fontScale'),
    button(doc,'Centrar texto','textCenter'),
    button(doc,'Alinear texto a la izquierda','textLeft'));
  objectGroup.append(typography.details);
  const rotation=actionMenu(doc,'Girar',[],'giro');
  const rotationInput=numberField(doc,'Ángulo del objeto en grados',0,-3600,3600);
  rotationInput.step='1';
  rotation.popup.append(element(doc,'span','p2lrn-ribbon-caption','Grados'),rotationInput,
    button(doc,'Aplicar giro','rotate'),button(doc,'Girar 15° a la izquierda','rotateLeft'),
    button(doc,'Girar 15° a la derecha','rotateRight'));
  objectGroup.append(rotation.details);
  const curve=actionMenu(doc,'Curvatura',[],'curvatura');
  const curveInput=numberField(doc,'Curvatura de la flecha en porcentaje',75,0,100);
  curveInput.step='1';
  curve.popup.append(element(doc,'span','p2lrn-ribbon-caption','Curvatura %'),curveInput,
    button(doc,'Aplicar curvatura','curve'));
  objectGroup.append(curve.details);
  const bezier=actionMenu(doc,'Editar curva',[],'bezier');
  const bezierLeft=numberField(doc,'Altura del primer punto de control',18,0,100);
  const bezierRight=numberField(doc,'Altura del segundo punto de control',18,0,100);
  bezierLeft.step='1';bezierRight.step='1';
  bezier.popup.append(element(doc,'span','p2lrn-ribbon-caption','Curva izquierda'),bezierLeft,
    button(doc,'Aplicar curva izquierda','bezierLeft'),
    element(doc,'span','p2lrn-ribbon-caption','Curva derecha'),bezierRight,
    button(doc,'Aplicar curva derecha','bezierRight'));
  objectGroup.append(bezier.details);
  const layers=actionMenu(doc,'Capas',[],'capas');
  layers.popup.style.maxHeight='350px';
  layers.popup.style.overflowY='auto';
  layers.popup.style.minWidth='240px';
  objectGroup.append(layers.details);
  function updateLayers(node){
    const scene=node?.matches?.('[data-p2lrn-layout="diagram-canvas"],[data-p2lrn-layout="diagram-group"]')?
      node:node?.closest?.('[data-p2lrn-layout="diagram-canvas"],[data-p2lrn-layout="diagram-group"]');
    layers.details.hidden=!scene;
    if(!scene)return;
    layers.popup.replaceChildren();
    const entries=[...scene.children].filter(child=>
      child.matches?.('[data-p2lrn-layout],figure,img[data-p2lrn-lesson-image],video[data-p2lrn-lesson-video]'));
    for(const [index,entry] of entries.entries()){
      const row=element(doc,'div','p2lrn-layer-entry');
      row.style.cssText='display:flex;align-items:center;gap:4px;min-height:34px';
      const name=entry.dataset.p2lrnShape||entry.dataset.p2lrnLayout||
        (entry.matches('img')?'Imagen':entry.matches('video')?'Vídeo':entry.localName);
      const text=entry.dataset.p2lrnLayout==='text-box'?
        (entry.textContent||'Texto').trim().slice(0,26):
        entry.matches('img')?(entry.alt||'Imagen').slice(0,26):name;
      const media=entry.matches('img[data-p2lrn-lesson-image],video[data-p2lrn-lesson-video]');
      const saveMedia=()=>surface()?.dispatchEvent(new Event('input',{bubbles:true}));
      const choose=element(doc,'button','',String(index+1)+' · '+text);
      choose.type='button';choose.title='Seleccionar '+text;
      choose.setAttribute('aria-label','Seleccionar capa '+text);
      choose.style.cssText='flex:1;text-align:left';
      choose.addEventListener('click',()=>{
        if(media)entry.click();
        else objectTools?.select(entry);
        layers.details.open=false;
      });
      const hide=element(doc,'button','',entry.style.visibility==='hidden'?'Mostrar':'Ocultar');
      hide.type='button';hide.setAttribute('aria-label',(entry.style.visibility==='hidden'?'Mostrar ':'Ocultar ')+text);
      hide.addEventListener('click',()=>{
        if(media){
          entry.style.visibility=entry.style.visibility==='hidden'?'visible':'hidden';
          saveMedia();
        }else{objectTools?.select(entry);objectTools?.perform('layerHide');}
        updateLayers(entry);layers.details.open=true;
      });
      const lock=element(doc,'button','',entry.dataset.p2lrnLayerLocked==='true'?'Desbloquear':'Bloquear');
      lock.type='button';lock.setAttribute('aria-label',(entry.dataset.p2lrnLayerLocked==='true'?'Desbloquear ':'Bloquear ')+text);
      lock.addEventListener('click',()=>{
        if(media){
          const locked=entry.dataset.p2lrnLayerLocked==='true';
          entry.dataset.p2lrnLayerLocked=locked?'false':'true';
          entry.style.pointerEvents=locked?'auto':'none';saveMedia();
        }else{objectTools?.select(entry);objectTools?.perform('layerLock');}
        updateLayers(entry);layers.details.open=true;
      });
      const moveLayer=(direction)=>{
        const sibling=direction<0?entry.previousElementSibling:entry.nextElementSibling;
        if(!sibling)return;
        if(direction<0)sibling.before(entry);
        else sibling.after(entry);
        saveMedia();
        updateLayers(entry);layers.details.open=true;
      };
      const down=element(doc,'button','','Bajar');down.type='button';
      down.title='Enviar capa detrás';down.setAttribute('aria-label','Enviar detrás '+text);
      down.addEventListener('click',()=>moveLayer(-1));
      const up=element(doc,'button','','Subir');up.type='button';
      up.title='Traer capa delante';up.setAttribute('aria-label','Traer delante '+text);
      up.addEventListener('click',()=>moveLayer(1));
      row.append(choose,down,up,hide,lock);layers.popup.append(row);
    }
  }
  const tableGroup=element(doc,'div','p2lrn-ribbon-group p2lrn-context-table');
  tableGroup.setAttribute('role','group');tableGroup.setAttribute('aria-label','Estructura y estilo de tabla');
  const rows=actionMenu(doc,'Filas',[
    ['rowAbove','Insertar fila arriba'],['rowBelow','Insertar fila abajo'],['deleteRow','Eliminar fila']
  ],'filas');
  const columns=actionMenu(doc,'Columnas',[
    ['colLeft','Insertar columna izquierda'],['colRight','Insertar columna derecha'],['deleteCol','Eliminar columna']
  ],'columnas');
  const cells=actionMenu(doc,'Celda',[
    ['cellAlignLeft','Alinear celda a la izquierda'],
    ['cellAlignCenter','Centrar celda'],
    ['cellAlignRight','Alinear celda a la derecha']
  ],'celda');
  const cellFill=element(doc,'input');cellFill.type='color';cellFill.value='#dbeafe';
  cellFill.title='Color de fondo de la celda';cellFill.setAttribute('aria-label','Color de fondo de celda');
  cells.popup.append(element(doc,'span','p2lrn-ribbon-caption','Color'),cellFill,button(doc,'Aplicar color','cellFill'));
  const rowHeight=numberField(doc,'Altura de fila en píxeles',48,28,320);
  cells.popup.append(element(doc,'span','p2lrn-ribbon-caption','Alto fila'),rowHeight,button(doc,'Aplicar altura','rowHeight'));
  tableGroup.append(rows.details,columns.details,cells.details);
  context.append(tableGroup,objectGroup);
  let activeSurface=null,objectTools=null,currentSelection=null;
  const history=createStudioHistory({onChange:refreshHistoryButtons,onApply:()=>objectTools?.clear()});
  function surface(){
    const candidate=resolveSurface();
    return candidate?.isContentEditable&&candidate.dataset?.studioHtmlSurface==='true'?candidate:null;
  }
  function refreshHistoryButtons(){
    const enabled=!!surface();
    if(undo)undo.disabled=!enabled||!history.canUndo();
    if(redo)redo.disabled=!enabled||!history.canRedo();
  }
  function updateSelection({table=null,element:node=null}={}){
    currentSelection=node||null;
    const selected=Boolean(node);
    context.hidden=!selected;
    if(!selected)return;
    updateLayers(node);
    if(table)context.append(tableGroup,palette,objectGroup);
    else context.append(objectGroup,palette,tableGroup);
    const kind=table?'Tabla':node?.dataset.p2lrnLayout==='text-box'?'Cuadro de texto':
      node?.dataset.p2lrnLayout==='shape'?'Forma':'Bloque';
    title.textContent='Editar '+kind.toLowerCase();
    tableGroup.hidden=!table;
    heightInput.disabled=Boolean(table);
    const canRotate=Boolean(node?.matches?.('[data-p2lrn-layout="shape"],[data-p2lrn-layout="text-box"],figure'));
    rotation.details.hidden=!canRotate;
    typography.details.hidden=node?.dataset?.p2lrnLayout!=='text-box'||
      !['diagram-canvas','diagram-group'].includes(node?.parentElement?.dataset?.p2lrnLayout);
    textScale.value=String(Number(node?.style?.fontSize?.match(/([\d.]+)cqw/)?.[1]??1.7));
    rotationInput.value=String(Number(node?.dataset?.p2lrnObjectRotation)||0);
    curve.details.hidden=node?.dataset?.p2lrnShape!=='curved-arrow';
    curveInput.value=String(Number(node?.dataset?.p2lrnCurve??75));
    bezier.details.hidden=node?.dataset?.p2lrnShape!=='bezier-arrow';
    bezierLeft.value=String(Number(node?.dataset?.p2lrnBezierLeft??18));
    bezierRight.value=String(Number(node?.dataset?.p2lrnBezierRight??18));
    objectGroup.querySelector('[data-studio-advanced-action=height]').disabled=Boolean(table);
    const width=Math.round(node?.getBoundingClientRect()?.width||420);
    widthInput.value=String(Math.max(120,width));
    if(!formatTab.getAttribute('aria-selected')||formatTab.getAttribute('aria-selected')==='false')formatTab.click();
  }
  updateSelection();
  function refresh(){
    const current=surface();
    if(current!==activeSurface){
      objectTools?.dispose();objectTools=null;activeSurface=current;updateSelection();
      if(current){
        history.activate(current);
        const host=current.closest('.studio-content,.sheet,.p2lrn-studio-sheet')||current.parentElement;
        objectTools=mountStudioObjectTools({host,surface:current,onStatus,onSelection:updateSelection});
      }
    }else if(current)objectTools?.refresh();
    refreshHistoryButtons();
    return current;
  }
  function recordChange(){
    const current=refresh();if(current)history.record(current,{kind:'media'});
  }
  function resetHistory(){
    objectTools?.dispose();objectTools=null;activeSurface=null;
    history.reset();updateSelection();refreshHistoryButtons();
  }
  function onInput(event){
    const current=surface();
    if(!current||!current.contains(event.target)||history.restoring)return;
    refresh();
    const typing=event.isTrusted&&/^(insertText|deleteContentBackward|deleteContentForward)$/.test(event.inputType||'');
    history.record(current,{kind:typing?'typing':'command'});
    objectTools?.refresh();
  }
  function onKeyDown(event){
    const current=surface();
    if(!current||!current.contains(event.target)||!(event.ctrlKey||event.metaKey)||event.altKey)return;
    const key=event.key.toLowerCase();if(key!=='z'&&key!=='y')return;
    event.preventDefault();event.stopPropagation();
    refresh();
    const ok=key==='y'||event.shiftKey?history.redo(current):history.undo(current);
    if(!ok)onStatus('No hay cambios en el historial.');
    objectTools?.refresh();refreshHistoryButtons();
  }
  function onUndoClick(event){
    const target=event.target.closest?.('[data-ui-command=undo],[data-ui-command=redo]');
    if(!target||!bar.contains(target))return;
    event.preventDefault();event.stopImmediatePropagation();
    const current=refresh();if(!current)return;
    const ok=target.dataset.uiCommand==='undo'?history.undo(current):history.redo(current);
    if(!ok)onStatus('No hay cambios en el historial.');
    objectTools?.refresh();refreshHistoryButtons();
  }
  function onAction(event){
    const target=event.target.closest?.('[data-studio-advanced-action]');
    if(!target||!bar.contains(target))return;
    refresh();if(!objectTools)return;
    const action=target.dataset.studioAdvancedAction;
    const value=action==='fontScale'?Number(textScale.value):
      action==='width'?Number(widthInput.value):
      action==='height'?Number(heightInput.value):
      action==='rotate'?Number(rotationInput.value):
      action==='curve'?Number(curveInput.value):
      action==='bezierLeft'?Number(bezierLeft.value):
      action==='bezierRight'?Number(bezierRight.value):
      action==='rotateLeft'?-15:
      action==='rotateRight'?15:
      action==='cellFill'?cellFill.value:
      action==='rowHeight'?Number(rowHeight.value):null;
    objectTools.perform(action==='rotateLeft'||action==='rotateRight'?'rotateStep':action,value);
    if(currentSelection)updateLayers(currentSelection);
    const menu=target.closest('.p2lrn-context-menu');if(menu)menu.open=false;
    refreshHistoryButtons();
  }
  const closeOtherMenus=event=>{
    const summary=event.target.closest?.('.p2lrn-context-menu>summary');
    if(!summary)return;
    for(const menu of context.querySelectorAll('.p2lrn-context-menu'))if(menu!==summary.parentElement)menu.open=false;
  };
  context.addEventListener('click',closeOtherMenus);
  const dismissOutside=event=>{
    for(const menu of context.querySelectorAll('.p2lrn-context-menu[open]')){
      if(!menu.contains(event.target))menu.open=false;
    }
  };
  const dismissEscape=event=>{
    if(event.key!=='Escape')return;
    const opened=[...context.querySelectorAll('.p2lrn-context-menu[open]')];
    if(opened.length){
      for(const menu of opened)menu.open=false;
      opened.at(-1).querySelector('summary')?.focus();
      event.preventDefault();event.stopPropagation();
    }
  };
  root.addEventListener('pointerdown',dismissOutside,true);
  root.addEventListener('keydown',dismissEscape,true);
  root.addEventListener('input',onInput,true);
  root.addEventListener('keydown',onKeyDown,true);
  bar.addEventListener('click',onUndoClick,true);
  bar.addEventListener('click',onAction);
  return {
    refresh,recordChange,resetHistory,
    selectObject(node){refresh();return objectTools?.select(node);},
    current(){refresh();return objectTools?.current()||null;},
    insertionTarget(){refresh();return objectTools?.cell||objectTools?.current()||null;},
    performObject(action,value){refresh();return objectTools?.perform(action,value);},
    get history(){return history;},
    dispose(){
      root.removeEventListener('input',onInput,true);
      root.removeEventListener('keydown',onKeyDown,true);
      bar.removeEventListener('click',onUndoClick,true);
      bar.removeEventListener('click',onAction);
      context.removeEventListener('click',closeOtherMenus);
      root.removeEventListener('pointerdown',dismissOutside,true);
      root.removeEventListener('keydown',dismissEscape,true);
      objectTools?.dispose();objectGroup.remove();tableGroup.remove();
    }
  };
}
