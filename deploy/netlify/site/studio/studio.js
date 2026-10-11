import {P2LRNStudioDocument} from './runtime/authoring-document.js';
import {exportP2LRNPackage} from './runtime/package-export.js';
import {createP2LRNStudioDocument} from './runtime/new-document.js';
import {saveLatestDraft,loadLatestDraft,clearLatestDraft} from './runtime/browser-drafts.js';

const createCourseButton=document.querySelector('[data-create-course]');
const addUnitButton=document.querySelector('[data-add-unit]');
const addLessonButton=document.querySelector('[data-add-lesson]');
const fileInput=document.querySelector('[data-file]');
const urlInput=document.querySelector('[data-url]');
const openUrlButton=document.querySelector('[data-open-url]');
const toolbar=document.querySelector('[data-toolbar]');
const workspace=document.querySelector('[data-workspace]');
const tree=document.querySelector('[data-tree]');
const packageName=document.querySelector('[data-package-name]');
const editorStage=document.querySelector('[data-editor-stage]');
const previewStage=document.querySelector('[data-preview-stage]');
const player=document.querySelector('[data-player]');
const status=document.querySelector('[data-studio-status]');
const changeCount=document.querySelector('[data-change-count]');
const editButton=document.querySelector('[data-mode-edit]');
const previewButton=document.querySelector('[data-mode-preview]');
const exportButton=document.querySelector('[data-export]');
const blockSelect=document.querySelector('[data-block]');
const foreColor=document.querySelector('[data-fore-color]');
const backColor=document.querySelector('[data-back-color]');
const saveDraftButton=document.querySelector('[data-save-draft]');
const recoverDraftButton=document.querySelector('[data-recover-draft]');
const clearDraftButton=document.querySelector('[data-clear-draft]');
const draftMenu=document.querySelector('[data-draft-menu]');
const saveState=document.querySelector('[data-save-state]');
const unsavedWarning=document.querySelector('[data-unsaved-warning]');

let studio=null;
let selectedId=null;
let sourceObjectUrl=null;
let previewObjectUrl=null;
let activeEditable=null;
let mode='edit';
let draftMetadata=null;
let savedRevision=0;
let exportedRevision=0;

const titleOf=(entity)=>studio?.title(entity.id)??entity.id;
const setStatus=(value)=>{status.textContent=value;};
const hasUnsavedChanges=()=>Boolean(studio&&studio.changeCount>savedRevision&&studio.changeCount>exportedRevision);
const updateChanges=()=>{
  if(!studio){
    changeCount.textContent='Sin cambios';
    saveState.textContent='No guardado';
    if(unsavedWarning)unsavedWarning.hidden=true;
    return;
  }
  changeCount.textContent=studio.changeCount?`${studio.changeCount} cambio${studio.changeCount===1?'':'s'}`:'Sin cambios';
  const unsaved=hasUnsavedChanges();
  if(saveState){
    if(unsaved)saveState.textContent='No guardado';
    else if(studio.changeCount&&exportedRevision>=studio.changeCount)saveState.textContent='Exportado';
    else if(studio.changeCount&&savedRevision>=studio.changeCount)saveState.textContent='Guardado en este navegador';
    else saveState.textContent='Sin cambios';
  }
  if(unsavedWarning)unsavedWarning.hidden=!unsaved;
};
async function persistDraft(){
  if(!studio)return;
  setStatus('Guardando borrador local…');
  const exported=await exportP2LRNPackage(studio);
  draftMetadata=await saveLatestDraft({
    name:exported.filename,
    bytes:exported.bytes,
    selectedId,
    contentRoot:exported.manifest.integrity?.contentRoot??null,
  });
  savedRevision=studio.changeCount;
  if(draftMenu)draftMenu.hidden=false;
  updateChanges();
  setStatus('Borrador guardado sólo en este navegador');
}

function revokeUrls(){
  if(sourceObjectUrl){URL.revokeObjectURL(sourceObjectUrl);sourceObjectUrl=null;}
  if(previewObjectUrl){URL.revokeObjectURL(previewObjectUrl);previewObjectUrl=null;}
}
function sanitizeHtml(text){
  const doc=new DOMParser().parseFromString(String(text),'text/html');
  doc.querySelectorAll('script,iframe,object,embed,form,meta[http-equiv],base').forEach((node)=>node.remove());
  doc.querySelectorAll('*').forEach((node)=>{
    for(const attr of [...node.attributes]){
      const name=attr.name.toLowerCase(),value=attr.value.trim().toLowerCase();
      if(name.startsWith('on')||((name==='href'||name==='src')&&value.startsWith('javascript:')))node.removeAttribute(attr.name);
    }
  });
  return doc;
}
function markActive(node){
  activeEditable=node;
  editorStage.querySelectorAll('[data-active-editable=true]').forEach((item)=>item.removeAttribute('data-active-editable'));
  if(node)node.dataset.activeEditable='true';
}
function bindEditable(node,onInput){
  node.contentEditable='true';node.spellcheck=true;
  node.addEventListener('focus',()=>markActive(node));
  node.addEventListener('input',()=>{onInput();updateChanges();});
}

function renderTree(){
  tree.replaceChildren();
  const root=studio.entity(studio.rootId);
  const seen=new Set();
  const walk=(entity,parent)=>{
    if(!entity||seen.has(entity.id))return;
    seen.add(entity.id);
    const wrap=document.createElement('div');wrap.className='studio-tree-node';
    const button=document.createElement('button');button.type='button';button.dataset.entityId=entity.id;
    button.innerHTML='<span class="type"></span><span class="title"></span>';
    button.querySelector('.type').textContent=entity.type;
    button.querySelector('.title').textContent=titleOf(entity);
    if(entity.id===selectedId)button.setAttribute('aria-current','true');
    button.addEventListener('click',()=>{selectedId=entity.id;renderTree();void renderEditor();if(mode==='preview')void refreshPreview();});
    wrap.append(button);parent.append(wrap);
    if(entity.children?.length){
      const children=document.createElement('div');children.className='studio-tree-children';wrap.append(children);
      entity.children.forEach((id)=>walk(studio.entity(id),children));
    }
  };
  walk(root,tree);
}
async function renderEditor(){
  editorStage.replaceChildren();activeEditable=null;
  const entity=studio.entity(selectedId);
  if(!entity)return;
  const sheet=document.createElement('article');sheet.className='studio-sheet';
  const head=document.createElement('header');head.className='studio-sheet-head';
  const type=document.createElement('span');type.className='studio-entity-type';type.textContent=entity.type;
  const title=document.createElement('h1');title.className='studio-title';title.textContent=titleOf(entity);
  bindEditable(title,()=>{try{studio.setTitle(entity.id,title.textContent||'');renderTree();}catch(error){setStatus(error.message);}});
  const description=document.createElement('p');description.className='studio-description';description.textContent=entity.description?.es??entity.description?.en??'';
  description.dataset.placeholder='Descripción';
  bindEditable(description,()=>studio.setDescription(entity.id,description.textContent||''));
  head.append(type,title,description);sheet.append(head);
  const content=document.createElement('div');content.className='studio-content';sheet.append(content);
  editorStage.append(sheet);

  if(entity.type!=='activity'){
    content.append(Object.assign(document.createElement('div'),{className:'studio-readonly',textContent:'Selecciona una actividad para editar su contenido. El título y la descripción de este nodo sí son editables.'}));
    return;
  }
  const editable=await studio.readEditableText(entity.id);
  if(!editable){
    const message=document.createElement('div');message.className='studio-readonly';
    message.textContent='Este contenido se reproduce con el Player pero no se edita internamente en Studio 1. SCORM, H5P, cmi5, QTI, multimedia y paquetes externos permanecen encapsulados.';
    content.append(message);
    const inline=document.createElement('p2lrn-player');inline.className='studio-inline-player';inline.setAttribute('src',studio.sourceUrl);inline.setAttribute('node',entity.id);content.append(inline);
    return;
  }
  if(editable.mediaType==='text/plain'){
    const surface=document.createElement('pre');surface.className='studio-wysiwyg';surface.textContent=editable.text;
    bindEditable(surface,()=>studio.setPayloadText(editable.path,surface.textContent||''));content.append(surface);return;
  }
  const source=sanitizeHtml(editable.text);
  const surface=document.createElement('article');surface.className='studio-wysiwyg';surface.innerHTML=source.body.innerHTML;
  bindEditable(surface,()=>{
    source.body.innerHTML=surface.innerHTML;
    studio.setPayloadText(editable.path,'<!doctype html>\n'+source.documentElement.outerHTML);
  });
  content.append(surface);
}

async function buildVerifiedPreview(){
  const exported=await exportP2LRNPackage(studio);
  const api=await window.P2LRNReady;
  const buffer=exported.bytes.buffer.slice(exported.bytes.byteOffset,exported.bytes.byteOffset+exported.bytes.byteLength);
  await api.openPackageBytes(buffer);
  return exported;
}
async function refreshPreview(){
  if(!studio||!selectedId)return;
  setStatus('Generando vista alumno…');
  const exported=await buildVerifiedPreview();
  if(previewObjectUrl)URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl=URL.createObjectURL(new Blob([exported.bytes],{type:'application/vnd.p2lrn+zip'}));
  player.setAttribute('src',previewObjectUrl);player.setAttribute('node',selectedId);
  await player.reload?.();
  setStatus('Vista alumno');
}
async function setMode(next){
  if(!studio)return;
  mode=next;
  const preview=next==='preview';
  editorStage.hidden=preview;previewStage.hidden=!preview;
  editButton.setAttribute('aria-pressed',String(!preview));previewButton.setAttribute('aria-pressed',String(preview));
  editButton.classList.toggle('primary',!preview);previewButton.classList.toggle('primary',preview);
  if(preview)await refreshPreview();else setStatus('Editando copia local');
}
async function activateStudio(document,{name,recoveredSelectedId=null}={}){
  studio=document;
  selectedId=recoveredSelectedId&&studio.entity(recoveredSelectedId)?recoveredSelectedId:studio.rootId;
  savedRevision=0;exportedRevision=0;
  packageName.textContent=name||studio.sourceName||'curso.p2lrn';
  toolbar.hidden=false;workspace.hidden=false;
  renderTree();await renderEditor();updateChanges();await setMode('edit');
}
async function openPackage(pkg,{name,url,recoveredSelectedId=null}){
  return activateStudio(new P2LRNStudioDocument(pkg,{sourceName:name,sourceUrl:url}),{name,recoveredSelectedId});
}
async function createNewCourse(){
  revokeUrls();
  const document=createP2LRNStudioDocument({title:'Curso nuevo',language:'es'});
  await activateStudio(document,{name:document.sourceName});
  setStatus('Curso nuevo listo para editar');
}
function structureParent(){
  const current=studio?.entity(selectedId);if(!current)return studio?.rootId??null;
  if(['course','unit'].includes(current.type))return current.id;
  return studio.parentId(current.id)??studio.rootId;
}
async function addUnit(){
  if(!studio)return;
  const created=studio.addUnit(structureParent(),{title:'Nueva unidad',language:'es'});selectedId=created.id;
  renderTree();await renderEditor();updateChanges();setStatus('Unidad añadida');
}
async function addLesson(){
  if(!studio)return;
  const created=studio.addLesson(structureParent(),{title:'Nueva lección',language:'es'});selectedId=created.id;
  renderTree();await renderEditor();updateChanges();setStatus('Lección añadida');
}
async function openLocal(file){
  revokeUrls();
  setStatus('Verificando paquete…');
  const bytes=await file.arrayBuffer();
  const api=await window.P2LRNReady;
  const pkg=await api.openPackageBytes(bytes);
  sourceObjectUrl=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.p2lrn+zip'}));
  await openPackage(pkg,{name:file.name||'curso.p2lrn',url:sourceObjectUrl});
}
async function openRemote(){
  const raw=urlInput.value.trim();if(!raw)return;
  setStatus('Verificando paquete…');
  const url=new URL(raw,location.href).href;
  if(!['http:','https:'].includes(new URL(url).protocol))throw new Error('Studio sólo abre URLs http/https.');
  const api=await window.P2LRNReady;
  const pkg=await api.openPackageURL(url);
  await openPackage(pkg,{name:new URL(url).pathname.split('/').filter(Boolean).at(-1)||'curso.p2lrn',url});
}
function command(name,value=null){
  if(!activeEditable||!activeEditable.isContentEditable)return;
  activeEditable.focus();
  document.execCommand(name,false,value);
  activeEditable.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'format'+name}));
}
async function recoverLatestDraft(){
  const record=await loadLatestDraft();
  if(!record?.bytes)return;
  revokeUrls();
  const bytes=record.bytes instanceof ArrayBuffer?record.bytes:record.bytes.buffer;
  const api=await window.P2LRNReady;
  const pkg=await api.openPackageBytes(bytes);
  sourceObjectUrl=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.p2lrn+zip'}));
  draftMetadata=record;
  await openPackage(pkg,{name:record.name||'borrador.p2lrn',url:sourceObjectUrl,recoveredSelectedId:record.selectedId});
  savedRevision=studio.changeCount;
  updateChanges();
  setStatus('Borrador local recuperado');
}
async function refreshDraftAvailability(){
  try{
    const record=await loadLatestDraft();
    draftMetadata=record;
    if(draftMenu)draftMenu.hidden=!record;
  }catch{
    if(draftMenu)draftMenu.hidden=true;
  }
}
async function discardLocalDraft(){
  if(!confirm('¿Eliminar el borrador guardado en este navegador? Esta acción no se puede deshacer.'))return;
  await clearLatestDraft();
  draftMetadata=null;
  if(draftMenu)draftMenu.hidden=true;
  setStatus('Borrador local eliminado');
}
async function exportPackage(){
  if(!studio)return;
  setStatus('Construyendo paquete…');
  const exported=await buildVerifiedPreview();
  const url=URL.createObjectURL(new Blob([exported.bytes],{type:'application/vnd.p2lrn+zip'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=exported.filename;document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  exportedRevision=studio.changeCount;
  updateChanges();
  setStatus('Paquete exportado y verificado');
}

createCourseButton?.addEventListener('click',()=>void createNewCourse().catch((error)=>setStatus(error.message)));
addUnitButton?.addEventListener('click',()=>void addUnit().catch((error)=>setStatus(error.message)));
addLessonButton?.addEventListener('click',()=>void addLesson().catch((error)=>setStatus(error.message)));
fileInput.addEventListener('change',()=>{const file=fileInput.files?.[0];if(file)void openLocal(file).catch((error)=>setStatus(error.message));});
openUrlButton.addEventListener('click',()=>void openRemote().catch((error)=>setStatus(error.message)));
urlInput.addEventListener('keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();void openRemote().catch((error)=>setStatus(error.message));}});
editButton.addEventListener('click',()=>void setMode('edit').catch((error)=>setStatus(error.message)));
previewButton.addEventListener('click',()=>void setMode('preview').catch((error)=>setStatus(error.message)));
document.querySelectorAll('[data-command]').forEach((button)=>button.addEventListener('click',()=>command(button.dataset.command)));
blockSelect.addEventListener('change',()=>command('formatBlock',blockSelect.value));
foreColor.addEventListener('input',()=>command('foreColor',foreColor.value));
backColor.addEventListener('input',()=>command('hiliteColor',backColor.value));
exportButton.addEventListener('click',()=>void exportPackage().catch((error)=>setStatus(error.message)));
saveDraftButton?.addEventListener('click',()=>void persistDraft().catch((error)=>setStatus('No se pudo guardar el borrador local: '+error.message)));
recoverDraftButton?.addEventListener('click',()=>void recoverLatestDraft().catch((error)=>setStatus(error.message)));
clearDraftButton?.addEventListener('click',()=>void discardLocalDraft().catch((error)=>setStatus(error.message)));
void refreshDraftAvailability();
window.addEventListener('beforeunload',(event)=>{
  revokeUrls();
  if(hasUnsavedChanges()){
    event.preventDefault();
    event.returnValue='';
  }
});
