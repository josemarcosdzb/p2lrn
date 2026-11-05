// One visual-editing layer for both Studio entry points.
import {createStudioHistory} from './studio-history.js';
import {mountStudioObjectTools} from './studio-object-tools.js';

const TABLE_ACTIONS=[
  ['rowAbove','Fila arriba'],['rowBelow','Fila abajo'],
  ['colLeft','Columna izquierda'],['colRight','Columna derecha'],
  ['deleteRow','Eliminar fila'],['deleteCol','Eliminar columna']
];
const OBJECT_ACTIONS=[
  ['left','Izquierda'],['center','Centrar'],['right','Derecha'],
  ['duplicate','Duplicar'],['up','Subir'],['down','Bajar'],['reset','Restablecer']
];
const el=(doc,tag,cls,text)=>{
  const node=doc.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;
  return node;
};
const button=(doc,label,action)=>{
  const b=el(doc,'button','',label);
  b.type='button';b.dataset.studioAdvancedAction=action;b.title=label;
  b.setAttribute('aria-label',label);return b;
};
export function mountAdvancedStudioTools({bar,root,resolveSurface,onStatus=()=>{}}={}){
  if(!bar||!root||typeof resolveSurface!=='function')
    throw new TypeError('Advanced Studio needs editor chrome and editable surface.');
  const doc=bar.ownerDocument;
  let activeSurface=null,objectTools=null;
  const undo=bar.querySelector('[data-ui-command=undo]');
  const redo=bar.querySelector('[data-ui-command=redo]');
  const tabs=bar.querySelector('[role=tablist]');
  const panels=tabs?.nextElementSibling;
  const insertPanel=panels?.querySelector('[aria-labelledby$="-insert"]');
  const designPanel=panels?.querySelector('[aria-labelledby$="-design"]');
  if(!tabs||!panels||!insertPanel||!designPanel)throw new Error('Studio ribbon structure changed.');
  const tab=el(doc,'button','p2lrn-ribbon-tab','Tabla');
  tab.type='button';tab.hidden=true;tab.tabIndex=0;tab.setAttribute('role','tab');
  const uid=/p2lrn-studio-tab-([0-9]+)-/.exec(tabs.querySelector('[role=tab]')?.id||'')?.[1]||'0';
  tab.id='p2lrn-studio-tab-'+uid+'-table';tab.setAttribute('aria-controls','p2lrn-studio-panel-'+uid+'-table');
  tab.setAttribute('aria-selected','false');
  const panel=el(doc,'div','p2lrn-ribbon-panel');
  panel.id='p2lrn-studio-panel-'+uid+'-table';panel.setAttribute('role','tabpanel');
  panel.setAttribute('aria-labelledby',tab.id);panel.hidden=true;
  const group=el(doc,'div','p2lrn-ribbon-group');
  for(const [action,label] of TABLE_ACTIONS)group.append(button(doc,label,action));
  panel.append(group,el(doc,'span','p2lrn-ribbon-caption','Selecciona una celda para modificar la tabla.'));
  const tableFormat=el(doc,'div','p2lrn-ribbon-group');
  tableFormat.append(el(doc,'span','p2lrn-ribbon-caption','Celda'));
  const cellFill=el(doc,'input');cellFill.type='color';cellFill.value='#dbeafe';
  cellFill.title='Color de fondo de celda';cellFill.setAttribute('aria-label','Color de fondo de celda');
  tableFormat.append(cellFill,button(doc,'Aplicar color','cellFill'));
  for(const [id,title] of [['cellAlignLeft','Alinear izquierda'],['cellAlignCenter','Centrar texto'],['cellAlignRight','Alinear derecha']]){
    tableFormat.append(button(doc,title,id));
  }
  const rowHeight=el(doc,'input');rowHeight.type='number';rowHeight.min='28';rowHeight.max='320';rowHeight.value='48';
  rowHeight.style.cssText='width:68px;min-height:34px;border:1px solid #dbe2eb;border-radius:7px;padding:5px';
  rowHeight.setAttribute('aria-label','Altura de fila en píxeles');
  tableFormat.append(el(doc,'span','p2lrn-ribbon-caption','Alto fila'),rowHeight,button(doc,'Aplicar altura','rowHeight'));
  panel.append(tableFormat);
  tabs.append(tab);panels.append(panel);
  tab.addEventListener('click',()=>{
    for(const sibling of tabs.querySelectorAll('[role=tab]'))sibling.setAttribute('aria-selected',String(sibling===tab));
    for(const sibling of panels.querySelectorAll('[role=tabpanel]'))sibling.hidden=sibling!==panel;
  });
  const tabReset=event=>{
    const clicked=event.target.closest?.('[role=tab]');
    if(!clicked||clicked===tab||!tabs.contains(clicked))return;
    panel.hidden=true;tab.setAttribute('aria-selected','false');
  };
  tabs.addEventListener('click',tabReset,true);
  // One ARIA-compliant arrow-key path also covers the dynamically shown Table tab.
  const tabKeys=event=>{
    const current=event.target.closest?.('[role=tab]');
    if(!current||!tabs.contains(current)||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const visible=[...tabs.querySelectorAll('[role=tab]')].filter(item=>!item.hidden&&!item.disabled);
    if(!visible.length)return;
    event.preventDefault();event.stopImmediatePropagation();
    const index=visible.indexOf(current);
    const next=event.key==='Home'?visible[0]:event.key==='End'?visible.at(-1):
      visible[(index+(event.key==='ArrowRight'?1:-1)+visible.length)%visible.length];
    next.focus();next.click();
  };
  tabs.addEventListener('keydown',tabKeys,true);
  const tableActions=group.querySelectorAll('[data-studio-advanced-action]');
  const palette=designPanel.querySelector('.p2lrn-ribbon-group');
  let designGroup=null,designHint=null;
  function updateSelection({table=null,element=null}={}){
    tab.hidden=!table;
    for(const b of tableActions)b.disabled=!table;
    for(const input of tableFormat.querySelectorAll('button,input'))input.disabled=!table;
    const selected=Boolean(element);
    if(designGroup)designGroup.hidden=!selected;
    if(designHint)designHint.hidden=selected;
    if(palette){palette.hidden=!selected;for(const control of palette.querySelectorAll('button'))control.disabled=!selected;}
    if(!table&&!panel.hidden){
      panel.hidden=true;tab.setAttribute('aria-selected','false');
      const insert=tabs.querySelector('[aria-controls$="-insert"]');
      if(insert)insert.click();
    }
  }
  updateSelection();
  designGroup=el(doc,'div','p2lrn-ribbon-group');
  designGroup.style.cssText='gap:5px;flex-wrap:wrap';
  designGroup.append(el(doc,'span','p2lrn-ribbon-caption','Objeto seleccionado'));
  for(const [action,label] of OBJECT_ACTIONS)designGroup.append(button(doc,label,action));
  const widthInput=el(doc,'input');widthInput.type='number';
  widthInput.min='120';widthInput.max='1600';widthInput.step='10';widthInput.value='420';
  widthInput.style.cssText='width:74px;min-height:34px;border:1px solid #dbe2eb;border-radius:7px;padding:5px';
  widthInput.setAttribute('aria-label','Ancho del elemento en píxeles');
  designGroup.append(el(doc,'span','p2lrn-ribbon-caption','Ancho px'),widthInput,button(doc,'Aplicar ancho','width'));
  designHint=el(doc,'span','p2lrn-ribbon-caption','Selecciona un objeto para editar su diseño.');
  designPanel.insertBefore(designHint,designPanel.firstChild);
  designPanel.append(el(doc,'span','p2lrn-ribbon-divider'),designGroup);
  updateSelection();
  const hint=el(doc,'span','p2lrn-ribbon-caption','Selecciona un bloque; usa Mover o la esquina inferior derecha para cambiar tamaño.');
  insertPanel.append(hint);
  const history=createStudioHistory({onChange:refreshHistoryButtons,onApply:()=>objectTools?.clear()});
  function surface(){
    const value=resolveSurface();
    return value?.isContentEditable&&value.dataset?.studioHtmlSurface==='true'?value:null;
  }
  function refreshHistoryButtons(){
    const enabled=!!surface();
    if(undo)undo.disabled=!enabled||!history.canUndo();
    if(redo)redo.disabled=!enabled||!history.canRedo();
  }
  function refresh(){
    const value=surface();
    if(value!==activeSurface){
      objectTools?.dispose();objectTools=null;
      activeSurface=value;updateSelection();
      if(value){
        history.activate(value);
        const host=value.closest('.studio-content,.sheet,.p2lrn-studio-sheet')||value.parentElement;
        objectTools=mountStudioObjectTools({host,surface:value,onStatus,onSelection:updateSelection});
      }
    }else if(value)objectTools?.refresh();
    refreshHistoryButtons();return value;
  }
  function recordChange(){
    const current=refresh();
    if(current)history.record(current,{kind:'media'});
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
    const key=event.key.toLowerCase();
    if(key!=='z'&&key!=='y')return;
    event.preventDefault();event.stopPropagation();
    refresh();
    const success=(key==='y'||event.shiftKey)?history.redo(current):history.undo(current);
    if(!success)onStatus('No hay cambios en el historial.');
    objectTools?.refresh();refreshHistoryButtons();
  }
  function onUndoClick(event){
    const clicked=event.target.closest?.('[data-ui-command=undo],[data-ui-command=redo]');
    if(!clicked||!bar.contains(clicked))return;
    event.preventDefault();event.stopImmediatePropagation();
    const current=refresh();if(!current)return;
    const ok=clicked.dataset.uiCommand==='undo'?history.undo(current):history.redo(current);
    if(!ok)onStatus('No hay cambios en el historial.');
    objectTools?.refresh();refreshHistoryButtons();
  }
  const onAction=event=>{
    const clicked=event.target.closest?.('[data-studio-advanced-action]');
    if(!clicked||!bar.contains(clicked))return;
    refresh();
    if(!objectTools)return;
    const action=clicked.dataset.studioAdvancedAction;
    const value=action==='width'?Number(widthInput.value):
      action==='cellFill'?cellFill.value:
      action==='rowHeight'?Number(rowHeight.value):null;
    objectTools.perform(action,value);
    refreshHistoryButtons();
  };
  root.addEventListener('input',onInput,true);
  root.addEventListener('keydown',onKeyDown,true);
  bar.addEventListener('click',onUndoClick,true);
  bar.addEventListener('click',onAction);
  return {
    refresh,recordChange,resetHistory,
    selectObject(element){refresh();return objectTools?.select(element);},
    current(){refresh();return objectTools?.current()||null;},
    performObject(action,value){refresh();return objectTools?.perform(action,value);},
    get history(){return history;},
    dispose(){
      root.removeEventListener('input',onInput,true);
      root.removeEventListener('keydown',onKeyDown,true);
      bar.removeEventListener('click',onUndoClick,true);
      bar.removeEventListener('click',onAction);
      tabs.removeEventListener('click',tabReset,true);
      tabs.removeEventListener('keydown',tabKeys,true);
      objectTools?.dispose();panel.remove();tab.remove();designGroup.remove();hint.remove();
    }
  };
}
