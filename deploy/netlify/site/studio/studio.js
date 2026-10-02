import {P2LRNStudioDocument} from './runtime/authoring-document.js';
import {exportP2LRNPackage} from './runtime/package-export.js';

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

let studio=null;
let selectedId=null;
let sourceObjectUrl=null;
let previewObjectUrl=null;
let activeEditable=null;
let mode='edit';

const titleOf=(entity)=>studio?.title(entity.id)??entity.id;
const setStatus=(value)=>{status.textContent=value;};
const updateChanges=()=>{if(!studio){changeCount.textContent='Sin cambios';return;}changeCount.textContent=studio.changeCount?`${studio.changeCount} cambio${studio.changeCount===1?'':'s'}`:'Sin cambios';};

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
async function openPackage(pkg,{name,url}){
  studio=new P2LRNStudioDocument(pkg,{sourceName:name,sourceUrl:url});
  selectedId=studio.rootId;
  packageName.textContent=name;
  toolbar.hidden=false;workspace.hidden=false;
  renderTree();await renderEditor();updateChanges();await setMode('edit');
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
async function exportPackage(){
  if(!studio)return;
  setStatus('Construyendo paquete…');
  const exported=await buildVerifiedPreview();
  const url=URL.createObjectURL(new Blob([exported.bytes],{type:'application/vnd.p2lrn+zip'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=exported.filename;document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  setStatus('Paquete exportado y verificado');
}

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
window.addEventListener('beforeunload',revokeUrls);
