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
    ['up','Adelantar'],['down','Atrasar'],['duplicate','Duplicar'],
    ['reset','Restablecer posición'],['remove','Eliminar objeto']
  ],'objeto').details);
  const size=actionMenu(doc,'Tamaño',[],'tamano');
  const widthInput=numberField(doc,'Ancho del elemento en píxeles',420,120,1600);
  const heightInput=numberField(doc,'Altura mínima del elemento en píxeles',100,40,1800);
  size.popup.append(element(doc,'span','p2lrn-ribbon-caption','Ancho px'),widthInput,button(doc,'Aplicar ancho','width'));
  size.popup.append(element(doc,'span','p2lrn-ribbon-caption','Alto px'),heightInput,button(doc,'Aplicar alto','height'));
  objectGroup.append(size.details);
  const rotation=actionMenu(doc,'Girar',[],'giro');
  const rotationInput=numberField(doc,'Ángulo del objeto en grados',0,-3600,3600);
  rotationInput.step='1';
  rotation.popup.append(element(doc,'span','p2lrn-ribbon-caption','Grados'),rotationInput,
    button(doc,'Aplicar giro','rotate'),button(doc,'Girar 15° a la izquierda','rotateLeft'),
    button(doc,'Girar 15° a la derecha','rotateRight'));
  objectGroup.append(rotation.details);
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
    if(table)context.append(tableGroup,palette,objectGroup);
    else context.append(objectGroup,palette,tableGroup);
    const kind=table?'Tabla':node?.dataset.p2lrnLayout==='text-box'?'Cuadro de texto':
      node?.dataset.p2lrnLayout==='shape'?'Forma':'Bloque';
    title.textContent='Editar '+kind.toLowerCase();
    tableGroup.hidden=!table;
    heightInput.disabled=Boolean(table);
    const canRotate=Boolean(node?.matches?.('[data-p2lrn-layout="shape"],[data-p2lrn-layout="text-box"],figure'));
    rotation.details.hidden=!canRotate;
    rotationInput.value=String(Number(node?.dataset?.p2lrnObjectRotation)||0);
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
    const value=action==='width'?Number(widthInput.value):
      action==='height'?Number(heightInput.value):
      action==='rotate'?Number(rotationInput.value):
      action==='rotateLeft'?-15:
      action==='rotateRight'?15:
      action==='cellFill'?cellFill.value:
      action==='rowHeight'?Number(rowHeight.value):null;
    objectTools.perform(action==='rotateLeft'||action==='rotateRight'?'rotateStep':action,value);
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
