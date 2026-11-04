import {P2LRNStudioDocument} from '/studio/runtime/authoring-document.js';
import {exportP2LRNPackage} from '/studio/runtime/package-export.js';
import {exportOfflineAssignmentBundle,parseOfflineAssignmentResult} from '/studio/runtime/offline-assignment.js';
import {createP2LRNStudioDocument} from '/studio/runtime/new-document.js';
import {renderQuestionnaireVisualEditor} from '/studio/runtime/questionnaire-editor.js';
import {renderStructuredVisualEditor} from '/studio/runtime/structured-editor.js';
import {saveLatestDraft,loadLatestDraft,clearLatestDraft} from '/studio/runtime/browser-drafts.js';
import {mountLessonImageEditor} from '/studio/runtime/lesson-images.js';
import {studioUiText} from '/studio/runtime/studio-ui-i18n.js';

const createCourseButton=document.querySelector('[data-create-course]');
const addUnitButton=document.querySelector('[data-add-unit]');
const addLessonButton=document.querySelector('[data-add-lesson]');
const addContentButton=document.querySelector('[data-add-content]');
const addDialog=document.querySelector('[data-add-dialog]');
const addHelp=document.querySelector('[data-add-help]');
const resourceFileInput=document.querySelector('[data-resource-file]');
const sharedLibraryButton=document.querySelector('[data-shared-library]');
let connectedResourceLibrary=globalThis.P2LRNStudioResourceLibrary??null;
function setStudioResourceLibrary(library){if(library!=null&&(typeof library.list!=='function'||typeof library.get!=='function'))throw new TypeError("resourceLibrary must expose list() and get().");connectedResourceLibrary=library??null;if(sharedLibraryButton)sharedLibraryButton.hidden=!connectedResourceLibrary;return connectedResourceLibrary;}
globalThis.P2LRNStudioSetResourceLibrary=setStudioResourceLibrary;
setStudioResourceLibrary(connectedResourceLibrary);
const readerFileInput=document.querySelector('[data-reader-file]');
const externalFileInput=document.querySelector('[data-external-file]');
const fileInput=document.querySelector('[data-file]');
const openFileButton=document.querySelector('[data-open-file]');
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
const offlineButton=document.querySelector('[data-export-offline]');
const offlineDialog=document.querySelector('[data-offline-dialog]');
const offlineForm=document.querySelector('[data-offline-form]');
const offlineError=document.querySelector('[data-offline-error]');
const offlineGenerate=document.querySelector('[data-offline-generate]');
const offlineResultButton=document.querySelector('[data-review-offline]');
const offlineResultInput=document.querySelector('[data-offline-result-file]');
const offlineReviewDialog=document.querySelector('[data-offline-review-dialog]');
const offlineReviewContent=document.querySelector('[data-offline-review-content]');
const offlineReceiptPrompt=document.querySelector('[data-offline-receipt-prompt]');
const offlineReceiptButton=document.querySelector('[data-offline-receipt-download]');
const offlineReviewReceipt=document.querySelector('[data-offline-review-receipt]');
const offlineAnalyticsButton=document.querySelector('[data-offline-open-analytics]');
let latestTeacherReceipt=null;
let latestOfflineResultFile=null;
let latestOfflineParsedResult=null;
const blockSelect=document.querySelector('[data-block]');
const fontFamily=document.querySelector('[data-font-family]');
const fontSize=document.querySelector('[data-font-size]');
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
let savedSelectionRange=null;
let mode='edit';
let draftMetadata=null;
let savedRevision=0;
let exportedRevision=0;

const titleOf=(entity)=>studio?.title(entity.id)??entity.id;
const setStatus=(value)=>{status.textContent=studioUiText(value);};
const hasUnsavedChanges=()=>Boolean(studio&&studio.changeCount>savedRevision&&studio.changeCount>exportedRevision&&!(studio.createdFromScratch&&studio.changeCount===1));
const updateChanges=()=>{
  if(!studio){
    changeCount.textContent=studioUiText("No changes");
    saveState.textContent=studioUiText("Not saved");
    if(unsavedWarning)unsavedWarning.hidden=true;
    return;
  }
  const actualChanges=Math.max(0,studio.changeCount-(studio.createdFromScratch?1:0));
  changeCount.textContent=studioUiText(actualChanges?`${actualChanges} cambio${actualChanges===1?'':'s'}`:"No changes");
  const unsaved=hasUnsavedChanges();
  if(saveState){
    if(unsaved)saveState.textContent=studioUiText("Not saved");
    else if(studio.createdFromScratch&&studio.changeCount===1)saveState.textContent=studioUiText("New course — not saved");
    else if(studio.changeCount&&exportedRevision>=studio.changeCount)saveState.textContent=studioUiText("Exported");
    else if(studio.changeCount&&savedRevision>=studio.changeCount)saveState.textContent=studioUiText("Saved in this browser");
    else saveState.textContent=studioUiText("No changes");
  }
  if(unsavedWarning)unsavedWarning.hidden=!unsaved;
};
async function persistDraft(){
  if(!studio)return;
  setStatus("Saving local draft…");
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
  setStatus("Draft saved in this browser only");
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
  node.addEventListener('mouseup',captureSelection);
  node.addEventListener('keyup',captureSelection);
  node.addEventListener('input',()=>{captureSelection();onInput();updateChanges();});
}
function captureSelection(){
  if(!activeEditable)return;
  const selection=getSelection();if(!selection?.rangeCount)return;
  const range=selection.getRangeAt(0);
  const anchor=range.commonAncestorContainer.nodeType===Node.ELEMENT_NODE?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;
  if(anchor&&activeEditable.contains(anchor))savedSelectionRange=range.cloneRange();
  updateFormatState();
}
function restoreSelection(){
  if(!activeEditable)return false;
  activeEditable.focus();
  if(!savedSelectionRange)return true;
  const selection=getSelection();selection.removeAllRanges();selection.addRange(savedSelectionRange);
  return true;
}
function updateFormatState(){
  for(const button of document.querySelectorAll('.studio-format [data-command]')){
    let active=false;try{active=document.queryCommandState(button.dataset.command)}catch{}
    button.dataset.active=active?'true':'false';
  }
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
  updateStructureActions();
}
async function renderEditor(){
  editorStage.replaceChildren();activeEditable=null;
  const entity=studio.entity(selectedId);
  if(!entity)return;
  const sheet=document.createElement('article');sheet.className='studio-sheet';
  const head=document.createElement('header');head.className='studio-sheet-head';
  const type=document.createElement('span');type.className='studio-entity-type';type.textContent=entity.type;
  const title=document.createElement('h1');title.className='studio-title';title.textContent=titleOf(entity);
  title.setAttribute('role','textbox');title.setAttribute('aria-label',"Title");title.setAttribute('aria-multiline','true');
  bindEditable(title,()=>{try{studio.setTitle(entity.id,title.textContent||'');renderTree();}catch(error){setStatus(error.message);}});
  const description=document.createElement('p');description.className='studio-description';description.textContent=entity.description?.es??entity.description?.en??'';
  description.dataset.placeholder="Description";description.setAttribute('role','textbox');description.setAttribute('aria-label',"Description");description.setAttribute('aria-multiline','true');
  bindEditable(description,()=>studio.setDescription(entity.id,description.textContent||''));
  head.append(type,title,description);sheet.append(head);
  const content=document.createElement('div');content.className='studio-content';sheet.append(content);
  editorStage.append(sheet);

  if(entity.type==='course'){
    const rights=document.createElement('section');rights.className='studio-rights';
    const heading=document.createElement('h2');heading.textContent="Authorship and rights";rights.append(heading);
    const fields=document.createElement('div');fields.className='studio-rights-fields';
    const rows=[
      ['author',"Content author"],
      ['createdAt',"Creation date"],
      ['license',"License · Terms of use and distribution"],
      ['copyrightHolder',"Copyright · Rights holder"]
    ];
    const values=studio.getCourseRights();
    for(const [key,labelText] of rows){
      const field=document.createElement('label');field.className='studio-rights-field';
      const label=document.createElement('span');label.textContent=labelText;
      const input=key==='license'?document.createElement('textarea'):document.createElement('input');
      if(key==='createdAt')input.type='date';
      else if(key!=='license')input.type='text';
      if(key==='author'||key==='copyrightHolder')input.maxLength=300;
      if(key==='license')input.maxLength=2000;
      input.value=values[key]??'';
      input.setAttribute('aria-label',labelText);
      input.addEventListener('change',()=>{
        try{studio.setCourseRights({[key]:input.value});updateChanges();}
        catch(error){setStatus(error.message);}
      });
      field.append(label,input);fields.append(field);
    }
    rights.append(fields);content.append(rights);
    return;
  }
  if(entity.type!=='activity'){
    content.append(Object.assign(document.createElement('div'),{className:'studio-readonly',textContent:"Select an activity to edit its content. You can edit this node's title and description."}));
    return;
  }
  const questionnaire=await studio.readQuestionnaire(entity.id);
  if(questionnaire){
    const renderer=entity.extensions?.['https://p2lrn.org/ext/renderer-preference/1']?.preferred??'https://p2lrn.org/renderer/questionnaire/standard';
    renderQuestionnaireVisualEditor(content,{model:studio,activityId:entity.id,payload:questionnaire.payload,renderer,onChange:()=>updateChanges(),onStatus:setStatus});
    return;
  }
  const structured=await studio.readStructuredJson(entity.id);
  if(structured){
    renderStructuredVisualEditor(content,{model:studio,activityId:entity.id,mediaType:structured.mediaType,payload:structured.payload,onChange:()=>updateChanges(),onStructureChange:()=>{renderTree();updateChanges();},onStatus:setStatus,onSelectActivity:(id)=>{selectedId=id;renderTree();void renderEditor();},onCreateChild:(id)=>{selectedId=id;renderTree();addDialog?.showModal();}});
    return;
  }
  const editable=await studio.readEditableText(entity.id);
  if(!editable){
    const message=document.createElement('div');message.className='studio-readonly';
    message.textContent="The Player can run this content, but Studio 1 does not edit it internally. SCORM, H5P, cmi5, QTI, multimedia and external packages remain encapsulated.";
    content.append(message);
    const inline=document.createElement('p2lrn-player');inline.className='studio-inline-player';inline.setAttribute('src',studio.sourceUrl);inline.setAttribute('node',entity.id);inline.setAttribute('navigation','external');content.append(inline);
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
    studio.setPayloadText(editable.path,"\n"+source.documentElement.outerHTML);
  });
  mountLessonImageEditor({host:content,surface,onChange:()=>{
    source.body.innerHTML=surface.innerHTML;
    studio.setPayloadText(editable.path,"\n"+source.documentElement.outerHTML);
    updateChanges();
  },onStatus:setStatus});
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
  setStatus("Generating learner preview…");
  const exported=await buildVerifiedPreview();
  if(previewObjectUrl)URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl=URL.createObjectURL(new Blob([exported.bytes],{type:'application/vnd.p2lrn+zip'}));
  player.setAttribute('src',previewObjectUrl);player.setAttribute('node',selectedId);
  await player.reload?.();
  setStatus("Learner preview");
}
async function setMode(next){
  if(!studio)return;
  mode=next;
  const preview=next==='preview';
  document.documentElement.dataset.studioMode=preview?'preview':'edit';
  editorStage.hidden=preview;previewStage.hidden=!preview;
  editButton.setAttribute('aria-pressed',String(!preview));previewButton.setAttribute('aria-pressed',String(preview));
  editButton.classList.toggle('primary',!preview);previewButton.classList.toggle('primary',preview);
  if(preview)await refreshPreview();else setStatus("Editing course");
}
async function activateStudio(document,{name,recoveredSelectedId=null}={}){
  studio=document;
  selectedId=recoveredSelectedId&&studio.entity(recoveredSelectedId)?recoveredSelectedId:studio.rootId;
  savedRevision=0;exportedRevision=0;
  packageName.textContent=name||studio.sourceName||"course.p2lrn";
  toolbar.hidden=false;workspace.hidden=false;
  renderTree();await renderEditor();updateChanges();await setMode('edit');
}
async function openPackage(pkg,{name,url,recoveredSelectedId=null}){
  return activateStudio(new P2LRNStudioDocument(pkg,{sourceName:name,sourceUrl:url}),{name,recoveredSelectedId});
}
async function createNewCourse({automatic=false}={}){
  // Preserve edits when the visitor deliberately starts a different course.
  const modified=studio && hasUnsavedChanges() &&
    !(studio.createdFromScratch && studio.changeCount===1);
  if(!automatic && modified && !confirm("Unsaved changes will be lost. Create a new course?"))return;
  revokeUrls();
  const newDocument=createP2LRNStudioDocument({title:"New course",language:"en"});
  // Start inside a real editable lesson, not only the course metadata.
  const firstUnitId=newDocument.entity(newDocument.rootId)?.children?.[0];
  const firstLessonId=firstUnitId&&newDocument.entity(firstUnitId)?.children?.[0];
  await activateStudio(newDocument,{name:newDocument.sourceName,recoveredSelectedId:firstLessonId||null});
  setStatus("New course ready to edit");
}
function compositeContext(){
  const current=studio?.entity(selectedId);if(!current)return null;
  if(current.type==='activity'&&studio.isCompositeActivity(current.id))return current.id;
  const parent=studio.parentId(current.id);return parent&&studio.isCompositeActivity(parent)?parent:null;
}
function updateStructureActions(){
  if(!addUnitButton)return;const blocked=Boolean(studio&&compositeContext());
  addUnitButton.disabled=blocked;addUnitButton.title=blocked?"Units must be created outside an activity group.":'';
}
function structureParent(){
  const current=studio?.entity(selectedId);if(!current)return studio?.rootId??null;
  if(['course','unit'].includes(current.type))return current.id;
  return studio.parentId(current.id)??studio.rootId;
}
async function addUnit(){
  if(!studio)return;
  if(studio.isCompositeActivity(insertionParent()))throw new Error("A composite contains activities, not units. Select the course or a unit.");
  const created=studio.addUnit(structureParent(),{title:"New unit",language:'en'});selectedId=created.id;
  renderTree();await renderEditor();updateChanges();setStatus("Unit added");
}
async function addLesson(){
  if(!studio)return;
  const created=studio.addLesson(insertionParent(),{title:"New lesson",language:'en'});selectedId=created.id;
  renderTree();await renderEditor();updateChanges();setStatus("Lesson added");
}
async function openLocal(file){
  revokeUrls();
  setStatus("Verifying package…");
  const bytes=await file.arrayBuffer();
  const api=await window.P2LRNReady;
  const pkg=await api.openPackageBytes(bytes);
  sourceObjectUrl=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.p2lrn+zip'}));
  await openPackage(pkg,{name:file.name||"course.p2lrn",url:sourceObjectUrl});
}
async function openRemote(){
  const raw=urlInput.value.trim();if(!raw)return;
  setStatus("Verifying package…");
  const url=new URL(raw,location.href).href;
  if(!['http:','https:'].includes(new URL(url).protocol))throw new Error("Studio only opens HTTP/HTTPS URLs.");
  const api=await window.P2LRNReady;
  const pkg=await api.openPackageURL(url);
  await openPackage(pkg,{name:new URL(url).pathname.split("/en/").filter(Boolean).at(-1)||"course.p2lrn",url});
}
function insertionParent(){
  const current=studio?.entity(selectedId);if(!current)return studio?.rootId??null;
  if(['course','unit'].includes(current.type)||studio.isCompositeActivity(current.id))return current.id;
  return studio.parentId(current.id)??studio.rootId;
}
async function selectCreated(activity,statusText){selectedId=activity.id;renderTree();await renderEditor();updateChanges();setStatus(statusText);addDialog?.close();}
function mediaTypeForFile(file){return file.type||({'md':'text/markdown','markdown':'text/markdown','txt':'text/plain','html':'text/html','htm':'text/html','json':'application/json','mp4':'video/mp4','webm':'video/webm','mp3':'audio/mpeg','wav':'audio/wav','png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','gif':'image/gif','webp':'image/webp','svg':'image/svg+xml'}[file.name.split('.').pop().toLowerCase()]||'application/octet-stream');}
async function addResourceFile(file){const activity=studio.addEmbeddedResource(insertionParent(),{title:file.name.replace(/\.[^.]+$/,''),filename:file.name,mediaType:mediaTypeForFile(file),bytes:new Uint8Array(await file.arrayBuffer())});await selectCreated(activity,"File added");}
function extractedDocumentHtml(result){const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');return "<meta charset=\"utf-8\">"+result.blocks.map((b)=>b.type==='TITLE'?"<h2></h2>"+esc(b.text)+"":b.type==='LIST'?"<li></li>"+esc(b.text)+"":b.type==='SEPARATOR'?'<hr>':"<p></p>"+esc(b.text)+"<p></p>").join('')+"";}
async function importExternalFile(file){
  if(studio.isCompositeActivity(insertionParent()))throw new Error("Imported educational packages create units. Select a unit to import them.");
  const endpoint=document.body.dataset.importEndpoint||'/api/p2lrn/studio/import';
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':file.type||'application/zip','X-P2LRN-Filename':encodeURIComponent(file.name)},body:await file.arrayBuffer()});
  if(!response.ok){let detail='';try{detail=(await response.json())?.error||''}catch{}throw new Error("Could not import the educational package"+(detail?': '+detail:' (HTTP '+response.status+')'));}
  const bytes=new Uint8Array(await response.arrayBuffer());
  const api=await window.P2LRNReady;const pkg=await api.openPackageBytes(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const root=(pkg.manifest.entrypoints.find((x)=>x.type==='course')??pkg.manifest.entrypoints[0])?.id;const titles=pkg.entities.get(root)?.title??{};const importedTitle=titles.es??titles.en??titles.und??Object.values(titles)[0]??file.name;const wrapper=await studio.importPackage(pkg,insertionParent(),{title:importedTitle});
  selectedId=wrapper.id;renderTree();await renderEditor();updateChanges();setStatus("Educational package imported");addDialog?.close();
}
async function addReaderFile(file){
  let result;
  const endpoint=document.body.dataset.readerEndpoint||'/api/p2lrn/studio/read';
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','X-P2LRN-Filename':encodeURIComponent(file.name)},body:await file.arrayBuffer()});
  if(!response.ok)throw new Error("Reader unavailable: HTTP "+response.status+". Configure the @p2lrn/toolkit/document-reader endpoint.");
  result=await response.json();
  const title=result.metadata?.detectedTitle||file.name.replace(/\.[^.]+$/,'');
  const activity=studio.addEmbeddedResource(insertionParent(),{title,filename:'reader.html',mediaType:'text/html',bytes:new TextEncoder().encode(extractedDocumentHtml(result))});await selectCreated(activity,"Document imported with Reader");
}
function showStudioChoice(title,subtitle,items,onChoose){
  const dialog=document.createElement('dialog');dialog.className='studio-choice-dialog';
  const shell=document.createElement('div');shell.className='studio-choice-shell';
  const head=document.createElement('div');head.className='studio-choice-head';
  const copy=document.createElement('div');const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=subtitle;copy.append(h,p);
  const close=document.createElement('button');close.type='button';close.textContent="Close";close.addEventListener('click',()=>dialog.close());head.append(copy,close);shell.append(head);
  const grid=document.createElement('div');grid.className='studio-choice-grid';
  for(const item of items){const b=document.createElement('button');b.type='button';b.className='studio-choice-card';const strong=document.createElement('strong');strong.textContent=item.label;const small=document.createElement('small');small.textContent=item.description||'';b.append(strong,small);b.addEventListener('click',()=>Promise.resolve(onChoose(item)).then(()=>dialog.close()).catch((error)=>setStatus(error.message)));grid.append(b);}
  shell.append(grid);dialog.append(shell);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}
async function chooseSharedResource(){
  const library=connectedResourceLibrary;
  if(!library||typeof library.list!=='function'||typeof library.get!=='function')throw new Error("No shared resource library is connected to Studio.");
  const listed=await library.list();
  const items=(listed??[]).filter((entry)=>entry?.digest&&entry?.href).map((entry)=>({...entry,id:entry.digest,label:entry.href.split("/en/").filter(Boolean).at(-1)||entry.digest,description:(entry.mediaType||'application/octet-stream')+' · '+entry.digest.slice(0,22)+'…'}));
  if(!items.length)throw new Error("The library has no resources with a source URL and a verifiable digest.");
  showStudioChoice("Shared library","The resource is referenced by URL and SHA-256.",items,async(item)=>{const activity=studio.addSharedResource(insertionParent(),{title:item.label,href:item.href,digest:item.digest,mediaType:item.mediaType||'application/octet-stream',language:'en'});await selectCreated(activity,"Shared resource added");});
}
async function materializeSelectedSharedResource(activityId=selectedId){
  if(!studio||!activityId)throw new Error("No resource is selected.");
  if(!connectedResourceLibrary)throw new Error("No resource library is connected.");
  const activity=studio.entity(activityId);const resource=activity?.resource?studio.entity(activity.resource):null;
  const remote=resource?.representations?.find((rep)=>rep.location?.type==='remote'&&rep.location?.expectedDigest);
  if(!remote)throw new Error("The selected activity is not a shared resource pinned by digest.");
  const entry=await connectedResourceLibrary.get(remote.location.expectedDigest);
  if(!entry?.bytes)throw new Error("The resource is not available locally for materialization.");
  const filename=entry.href?.split("/en/").filter(Boolean).at(-1)||'resource.bin';
  const representation=studio.materializeSharedResource(activityId,{bytes:new Uint8Array(entry.bytes),filename,mediaType:entry.mediaType});
  await renderEditor();updateChanges();setStatus('Fallback embebido materializado');return representation;
}
globalThis.P2LRNStudioMaterializeSharedResource=materializeSelectedSharedResource;

function chooseComponent(){
  const items=studio.componentCatalog().map((entry)=>({id:entry.id,label:entry.authoring.label,description:entry.authoring.description}));
  showStudioChoice("Add component","Choose the native block you want to create.",items,async(item)=>{const activity=studio.addNativeComponent(insertionParent(),{componentId:item.id,language:'en'});await selectCreated(activity,item.label+" added");});
}
async function addContentKind(kind){
  if(!studio)throw new Error("Create or open a course first.");
  if(kind==='lesson'){const a=studio.addLesson(insertionParent(),{title:"New lesson",language:'en'});return selectCreated(a,"Lesson added");}
  if(kind==='file'){resourceFileInput.click();return;}
  if(kind==='reader'){readerFileInput.click();return;}
  if(kind==='external'){
    if(studio.isCompositeActivity(insertionParent()))throw new Error("Complete educational packages are imported as units, not child activities. Select a unit.");
    externalFileInput.click();return;
  }
  if(kind==='url'){const url=prompt("Resource URL");if(!url)return;const title=prompt("Title","Web resource")||"Web resource";const a=studio.addRemoteResource(insertionParent(),{title,url,mediaType:'text/html'});return selectCreated(a,"URL added");}
  if(kind==='shared-library'){await chooseSharedResource();return;}
  if(kind==='shared-resource'){
    const url=prompt("Logical URL for shared resource");if(!url)return;
    const expectedDigest=prompt("Expected SHA-256 (sha256:...)");if(!expectedDigest)return;
    const mediaType=prompt("MIME type",'video/mp4')||'application/octet-stream';
    const title=prompt("Title","Shared resource")||"Shared resource";
    const a=studio.addRemoteResource(insertionParent(),{title,url,mediaType,expectedDigest});
    return selectCreated(a,"Shared resource added");
  }
  if(kind==='questionnaire'){const a=studio.addQuestionnaire(insertionParent(),{title:"Questionnaire",language:'en'});return selectCreated(a,"Questionnaire added");}
  if(kind==='live-poll'){const a=studio.addCollaborationActivity(insertionParent(),{mode:'poll',language:'en'});return selectCreated(a,"Live poll added");}
  if(kind==='shared-board'){const a=studio.addCollaborationActivity(insertionParent(),{mode:'board',language:'en'});return selectCreated(a,"Shared board added");}
  if(kind==='peer-review'){const a=studio.addCollaborationActivity(insertionParent(),{mode:'peer-review',language:'en'});return selectCreated(a,"Peer review added");}
  if(['memory','matching','ordering','classification','true-false','fill-blanks','word-search','crossword',"word wheel",'3d','3d-matching','3d-classification'].includes(kind)){const names={memory:"Memory",matching:"Matching",ordering:"Ordering",classification:"Classification",'true-false':"True / false",'fill-blanks':"Fill in the blanks",'word-search':"Word search",crossword:"Crossword",rosco:"Word wheel",'3d':"3D game",'3d-matching':"3D matching",'3d-classification':"3D classification"};const a=studio.addGame(insertionParent(),{kind,title:names[kind],language:'en'});return selectCreated(a,names[kind]+" added");}
  if(kind==='component'){chooseComponent();return;}
  if(kind==='composite'){const activity=studio.addComposite(insertionParent(),{title:"Activity group",language:'en',mode:'free',completion:'all'});return selectCreated(activity,"Activity group added");}
}
function emitFormatInput(name){
  captureSelection();
  activeEditable?.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'format'+name}));
  updateFormatState();
}
function command(name,value=null){
  if(!activeEditable||!activeEditable.isContentEditable)return;
  if(!restoreSelection())return;
  document.execCommand(name,false,value);
  emitFormatInput(name);
}
function applyFontFamily(value){
  if(!activeEditable||!restoreSelection())return;
  document.execCommand('styleWithCSS',false,true);
  document.execCommand('fontName',false,value);
  emitFormatInput('fontName');
}
function applyFontSize(value){
  if(!activeEditable||!restoreSelection())return;
  const px=Math.max(8,Math.min(96,Number(value)||20));
  document.execCommand('styleWithCSS',false,true);
  document.execCommand('fontSize',false,'7');
  for(const element of activeEditable.querySelectorAll('[style]'))if(element.style.fontSize==='xxx-large')element.style.fontSize=px+'px';
  emitFormatInput('fontSize');
}
function syncColorButton(input){
  const label=input?.closest('.format-color-button');if(label)label.style.setProperty('--format-color',input.value);
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
  await openPackage(pkg,{name:record.name||"draft.p2lrn",url:sourceObjectUrl,recoveredSelectedId:record.selectedId});
  savedRevision=studio.changeCount;
  updateChanges();
  setStatus("Local draft restored");
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
  if(!confirm("Delete the draft saved in this browser? This action cannot be undone."))return;
  await clearLatestDraft();
  draftMetadata=null;
  if(draftMenu)draftMenu.hidden=true;
  setStatus("Local draft deleted");
}

function downloadStudioBytes(bytes,filename,type){
  const url=URL.createObjectURL(new Blob([bytes],{type}));
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}
// Only use the native launcher published by this site. Never accept a URL
// from a course, the student or external input. Verify bytes against the
// build-generated manifest before packing the Windows executable.
async function loadNativeOfflineLauncher(){
  const manifestUrl=new URL('/downloads/p2lrn-offline-launcher.json',document.baseURI);
  const response=await fetch(manifestUrl,{cache:'no-store',credentials:'same-origin'});
  if(!response.ok)throw new Error("Native Windows launcher unavailable. Choose ZIP or check deployment status.");
  const info=await response.json();
  if(info.schema!=='https://p2lrn.org/schema/native-offline-launcher/1'||
    info.platform!=='windows'||info.architecture!=='amd64'||
    info.envelope!=='P2LRN-EXE-V1'||info.version!=='1'||
    !Number.isSafeInteger(info.bytes)||info.bytes<1024*1024||info.bytes>64*1024*1024||
    !/^sha256:[0-9a-f]{64}$/.test(info.sha256)||
    info.filename!=='p2lrn-offline-launcher-windows-amd64.exe')
    throw new Error("Invalid Windows launcher manifest.");
  const url=new URL('/downloads/p2lrn-offline-launcher-windows-amd64.exe',document.baseURI);
  const exeResponse=await fetch(url,{cache:'no-store',credentials:'same-origin'});
  if(!exeResponse.ok)throw new Error("Could not download the Windows launcher from P2LRN.");
  const bytes=new Uint8Array(await exeResponse.arrayBuffer());
  if(bytes.length!==info.bytes)throw new Error("The Windows launcher size does not match its manifest.");
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  const actual='sha256:'+Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
  if(actual!==info.sha256)throw new Error("Windows launcher SHA-256 verification failed.");
  return bytes;
}

async function generateOfflineDelivery(){
  if(!studio)throw new Error("Create or open a course before generating a delivery.");
  const details=new FormData(offlineForm);
  const deliveryFormat=String(details.get('deliveryFormat')||'windows-exe');
  if(!['windows-exe','windows-single','portable-zip'].includes(deliveryFormat))
    throw new Error("Unrecognized delivery format.");
  const minutes=String(details.get('durationMinutes')||'').trim();
  const options={
    runtimeBaseUrl:new URL('/player/current/dist/',document.baseURI).href,
    issuerName:String(details.get('issuerName')||'').trim(),
    participantLabel:String(details.get('participantLabel')||'').trim(),
    availableFrom:String(details.get('availableFrom')||'').trim()||null,
    dueAt:String(details.get('dueAt')||'').trim()||null,
    attemptDurationSeconds:minutes?Number(minutes)*60:null,
    expiresAfterFirstOpenDays:String(details.get('expiresAfterFirstOpenDays')||'').trim()?Number(details.get('expiresAfterFirstOpenDays')):null,
    maxAttempts:Number(details.get('maxAttempts')||1),
    allowResume:offlineForm.elements.namedItem('allowResume').checked,
    activityTracking:offlineForm.elements.namedItem('activityTracking').checked,
    signAssignment:offlineForm.elements.namedItem('signAssignment').checked,
  };
  setStatus("Verifying course and preparing offline delivery…");
  if(deliveryFormat==='windows-exe')options.windowsExecutableBytes=await loadNativeOfflineLauncher();
  const bundle=await exportOfflineAssignmentBundle(studio,options);
  latestTeacherReceipt=bundle.teacherReceipt;
  if(offlineReceiptPrompt)offlineReceiptPrompt.hidden=!latestTeacherReceipt;
  const selected=deliveryFormat==='windows-exe'
    ?bundle.windowsExecutable
    :deliveryFormat==='windows-single'
      ?bundle.windowsLauncher
      :{filename:bundle.filename,bytes:bundle.bytes};
  if(!selected?.bytes)throw new Error("Could not prepare the requested delivery format.");
  downloadStudioBytes(selected.bytes,selected.filename,deliveryFormat==='portable-zip'?'application/zip':'application/octet-stream');
  exportedRevision=studio.changeCount;
  updateChanges();
  setStatus(bundle.teacherReceipt
    ?"Signed delivery prepared. Download and retain the teacher's receipt."
    :"Offline delivery ready: "+selected.filename);
  return selected.filename;
}
function addOfflineReviewRow(host,label,value){
  const line=document.createElement('p');
  const heading=document.createElement('strong');heading.textContent=label;
  const detail=document.createElement('span');detail.textContent=String(value??'—');
  line.append(heading,detail);host.append(line);
}
async function reviewOfflineDelivery(file){
  if(!studio)throw new Error("Open the original course first to verify the match.");
  latestOfflineResultFile=file;
  latestOfflineParsedResult=null;
  if(offlineAnalyticsButton)offlineAnalyticsButton.disabled=true;
  if(file.size>32*1024*1024)throw new Error("The result file exceeds 32 MiB.");
  setStatus("Verifying offline result…");
  const exported=await exportP2LRNPackage(studio);
  const receiptFile=offlineReviewReceipt?.files?.[0]??null;
  if(receiptFile && receiptFile.size>256*1024)
    throw new Error("The teacher's receipt exceeds 256 KiB and is invalid.");
  const trustedReceipt=receiptFile?await receiptFile.text():null;
  const parsed=await parseOfflineAssignmentResult(await file.text(),{
    expectedContentRoot:exported.manifest.integrity.contentRoot,
    trustedReceipt,
  });
  const analyticsEligible=parsed.integrityValid===true && parsed.courseMatches===true &&
    parsed.evidenceValid!==false && parsed.summaryValid!==false && parsed.assignmentAuthenticated!==false;
  latestOfflineParsedResult=analyticsEligible?parsed.result:null;
  if(offlineAnalyticsButton)offlineAnalyticsButton.disabled=!analyticsEligible;
  const content=offlineReviewContent;
  content.replaceChildren();
  const problems=[];
  if(!parsed.integrityValid)problems.push("File SHA-256");
  if(!parsed.courseMatches)problems.push("original course");
  if(parsed.evidenceValid===false)problems.push("record order or content");
  if(parsed.summaryValid===false)problems.push("summary, answers or scores");
  if(parsed.assignmentAuthenticated===false)problems.push("teacher's signature or receipt");
  if(problems.length){
    const warning=document.createElement('p');
    warning.className='studio-offline-review-warning';
    warning.setAttribute('role','alert');
    warning.textContent="Review required: mismatches in "+problems.join(', ')+
      ". Do not treat the reported score as a verified grade.";
    content.append(warning);
  }
  addOfflineReviewRow(content,"File",file.name);
  addOfflineReviewRow(content,"Result SHA-256",parsed.integrityValid?'Coincide':'NO coincide');
  addOfflineReviewRow(content,"Original course",parsed.courseMatches?'Coincide':'NO coincide');
  addOfflineReviewRow(content,"Assignment signature",parsed.signatureValid===true
    ?(parsed.assignmentAuthenticated===true?"Ed25519 signature valid and verified":"Ed25519 signature valid; issuer not yet verified")
    :parsed.signatureValid===false?"INVALID":"Unsigned delivery");
  addOfflineReviewRow(content,"Teacher's receipt",parsed.assignmentAuthenticated===true
    ?'Coincide: encargo autenticado'
    :parsed.assignmentAuthenticated===false?"MISMATCH / invalid signature"
    :"Not selected: verification pending");
  addOfflineReviewRow(content,"Evidence chain",parsed.evidenceValid===true
    ?"Consistent (the learner can recalculate it)"
    :parsed.evidenceValid===false?'NO coincide':"Cannot be verified in this older delivery");
  addOfflineReviewRow(content,"Summary consistency",parsed.summaryValid
    ?"Answers, events and scores match the records"
    :"MISMATCH: review the reported data");
  addOfflineReviewRow(content,"Learner",parsed.summary.participantLabel||"Unidentified");
  addOfflineReviewRow(content,"Attempt",parsed.summary.attemptNumber);
  addOfflineReviewRow(content,'Aperturas registradas',parsed.summary.openings);
  addOfflineReviewRow(content,"First opening",parsed.summary.firstOpenedAt?new Date(parsed.summary.firstOpenedAt).toLocaleString():'No registrada');
  addOfflineReviewRow(content,"Last opening",parsed.summary.lastOpenedAt?new Date(parsed.summary.lastOpenedAt).toLocaleString():'No registrada');
  addOfflineReviewRow(content,'Caducidad local',parsed.summary.expiresAt?new Date(parsed.summary.expiresAt).toLocaleString():"No first-open expiration");
  addOfflineReviewRow(content,'Sesiones registradas',parsed.summary.sessions.length);
  addOfflineReviewRow(content,"Local device identifier",parsed.summary.deviceBindingId||"Unavailable");
  const score=parsed.summary.latestScore?.normalized;
  addOfflineReviewRow(content,"Reported score (not official)",score==null
    ?"No score":Math.round(Number(score)*10000)/100+' %');
  addOfflineReviewRow(content,"Answers",parsed.summary.answers.length);
  addOfflineReviewRow(content,'Evaluaciones',parsed.summary.scores.length);
  addOfflineReviewRow(content,"Events",parsed.summary.events.length);
  addOfflineReviewRow(content,'Tiempo activo',Math.round(parsed.summary.activeTimeMs/1000)+' s');
  addOfflineReviewRow(content,'Incidencias',parsed.summary.anomalies.length
    ? parsed.summary.anomalies.map(item=>item.code||'Incidencia').join(', ') : "None recorded");
  const note=document.createElement('p');note.className='studio-offline-note';
  note.textContent="The signature only authenticates the teacher's assignment when its original receipt is retained and selected. Answers and grades are generated on the learner's device and are not authenticated; offline deadlines depend on that device's clock.";
  content.append(note);
  offlineReviewDialog.showModal();
  setStatus(problems.length
    ?"Offline result with issues: "+problems.join(', ')+(analyticsEligible?'':" · Analytics blocked until the result is consistent")
    :parsed.assignmentAuthenticated===true
      ?"Teacher's assignment authenticated; answers not authenticated"
      :parsed.signatureValid===true
        ?"Valid signature; select the original teacher receipt"
        :"Result received; informational score");
}

async function exportPackage(){
  if(!studio)return;
  setStatus("Building package…");
  const exported=await buildVerifiedPreview();
  downloadStudioBytes(exported.bytes,exported.filename,'application/vnd.p2lrn+zip');
  exportedRevision=studio.changeCount;
  updateChanges();
  setStatus("Package exported and verified");
  globalThis.P2LRNRecordConversion?.('studio_package_exported');
}

function hideAddHelp(){
  if(!addHelp)return;
  addHelp.dataset.visible='false';
  addHelp.hidden=true;
}
function showAddHelp(button){
  if(!addHelp||!button?.dataset.help)return;
  addHelp.textContent=button.dataset.help;
  addHelp.hidden=false;
  addHelp.dataset.visible='true';
  requestAnimationFrame(()=>{
    const rect=button.getBoundingClientRect(),tip=addHelp.getBoundingClientRect(),pad=12,gap=9;
    let left=rect.left+rect.width/2-tip.width/2;
    left=Math.max(pad,Math.min(left,window.innerWidth-tip.width-pad));
    let top=rect.bottom+gap;
    if(top+tip.height>window.innerHeight-pad)top=rect.top-tip.height-gap;
    top=Math.max(pad,top);
    addHelp.style.left=Math.round(left)+'px';
    addHelp.style.top=Math.round(top)+'px';
  });
}
addDialog?.querySelectorAll('[data-add-kind][data-help]').forEach((button)=>{
  button.setAttribute('aria-describedby','studio-add-tooltip');
  button.addEventListener('pointerenter',()=>showAddHelp(button));
  button.addEventListener('pointerleave',hideAddHelp);
  button.addEventListener('focus',()=>showAddHelp(button));
  button.addEventListener('blur',hideAddHelp);
});
addHelp?.setAttribute('id','studio-add-tooltip');
addDialog?.addEventListener('close',hideAddHelp);
addDialog?.addEventListener('scroll',hideAddHelp,{passive:true});
createCourseButton?.addEventListener('click',()=>void createNewCourse().catch((error)=>setStatus(error.message)));
addUnitButton?.addEventListener('click',()=>void addUnit().catch((error)=>setStatus(error.message)));
addLessonButton?.addEventListener('click',()=>void addLesson().catch((error)=>setStatus(error.message)));
addContentButton?.addEventListener('click',()=>{if(!studio){setStatus("Create or open a course first");return;}addDialog?.showModal();});
addDialog?.querySelector('[data-add-close]')?.addEventListener('click',()=>addDialog.close());
addDialog?.querySelectorAll('[data-add-kind]').forEach((button)=>button.addEventListener('click',()=>void addContentKind(button.dataset.addKind).catch((error)=>setStatus(error.message))));
resourceFileInput?.addEventListener('change',()=>{const file=resourceFileInput.files?.[0];if(file)void addResourceFile(file).catch((error)=>setStatus(error.message));resourceFileInput.value='';});
readerFileInput?.addEventListener('change',()=>{const file=readerFileInput.files?.[0];if(file)void addReaderFile(file).catch((error)=>setStatus(error.message));readerFileInput.value='';});
externalFileInput?.addEventListener('change',()=>{const file=externalFileInput.files?.[0];if(file)void importExternalFile(file).catch((error)=>setStatus(error.message));externalFileInput.value='';});
openFileButton?.addEventListener('click',()=>fileInput.click());
fileInput.addEventListener('change',()=>{const file=fileInput.files?.[0];fileInput.value='';if(file)void openLocal(file).catch((error)=>setStatus(error.message));});
openUrlButton.addEventListener('click',()=>void openRemote().catch((error)=>setStatus(error.message)));
urlInput.addEventListener('keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();void openRemote().catch((error)=>setStatus(error.message));}});
editButton.addEventListener('click',()=>void setMode('edit').catch((error)=>setStatus(error.message)));
previewButton.addEventListener('click',()=>void setMode('preview').catch((error)=>setStatus(error.message)));
document.querySelectorAll('[data-command]').forEach((button)=>{
  button.addEventListener('mousedown',(event)=>event.preventDefault());
  button.addEventListener('click',()=>command(button.dataset.command));
});
blockSelect.addEventListener('change',()=>command('formatBlock',blockSelect.value));
fontFamily?.addEventListener('change',()=>applyFontFamily(fontFamily.value));
fontSize?.addEventListener('change',()=>applyFontSize(fontSize.value));
foreColor.addEventListener('input',()=>{syncColorButton(foreColor);command('foreColor',foreColor.value);});
backColor.addEventListener('input',()=>{syncColorButton(backColor);command('hiliteColor',backColor.value);});
syncColorButton(foreColor);syncColorButton(backColor);
document.addEventListener('selectionchange',()=>{if(activeEditable)captureSelection();});
exportButton.addEventListener('click',()=>void exportPackage().catch((error)=>setStatus(error.message)));
offlineButton?.addEventListener('click',()=>{offlineError.hidden=true;offlineError.textContent='';offlineDialog.showModal();});
document.querySelector('[data-offline-cancel]')?.addEventListener('click',()=>offlineDialog.close());
offlineForm?.addEventListener('submit',(event)=>{
  event.preventDefault();
  offlineError.hidden=true;offlineError.textContent='';offlineGenerate.disabled=true;
  void generateOfflineDelivery().then(()=>{
    if(!latestTeacherReceipt)offlineDialog.close();
  }).catch((error)=>{
    offlineError.textContent=String(error?.message||error);offlineError.hidden=false;setStatus("Could not generate the offline delivery");
  }).finally(()=>{offlineGenerate.disabled=false;});
});
offlineReceiptButton?.addEventListener('click',()=>{
  if(!latestTeacherReceipt)return;
  downloadStudioBytes(latestTeacherReceipt.bytes,latestTeacherReceipt.filename,'application/json');
  latestTeacherReceipt=null;
  offlineReceiptPrompt.hidden=true;
  setStatus("Teacher's receipt downloaded. Keep it separate from the learner's files.");
  offlineDialog.close();
});
offlineReviewReceipt?.addEventListener('change',()=>{
  if(latestOfflineResultFile)void reviewOfflineDelivery(latestOfflineResultFile)
    .catch((error)=>{
      offlineReviewContent.replaceChildren();
      const message=document.createElement('p');
      message.className='studio-offline-review-warning';
      message.setAttribute('role','alert');
      message.textContent="Cannot verify the receipt: "+error.message;
      offlineReviewContent.append(message);
      setStatus("Invalid receipt: "+error.message);
    });
});
offlineResultButton?.addEventListener('click',()=>{
  if(offlineReviewReceipt)offlineReviewReceipt.value='';
  offlineResultInput.click();
});
offlineResultInput?.addEventListener('change',()=>{
  const file=offlineResultInput.files?.[0];offlineResultInput.value='';
  if(file)void reviewOfflineDelivery(file).catch((error)=>setStatus("Could not review the delivery: "+error.message));
});
document.querySelector('[data-offline-review-close]')?.addEventListener('click',()=>offlineReviewDialog.close());
offlineAnalyticsButton?.addEventListener('click',()=>{
  if(!latestOfflineParsedResult)return;
  try{
    sessionStorage.setItem('p2lrn:analytics:offline-result',JSON.stringify(latestOfflineParsedResult));
    window.open("/en/analytics/?import=offline-result",'_blank');
    setStatus("Result sent to P2LRN Analytics");
  }catch(error){
    setStatus("Could not open Analytics: "+String(error?.message||error));
  }
});
saveDraftButton?.addEventListener('click',()=>void persistDraft().catch((error)=>setStatus("Could not save the local draft: "+error.message)));
recoverDraftButton?.addEventListener('click',()=>void recoverLatestDraft().catch((error)=>setStatus(error.message)));
clearDraftButton?.addEventListener('click',()=>void discardLocalDraft().catch((error)=>setStatus(error.message)));
async function initializeStudioWorkspace(){
  const guarded=[createCourseButton,openFileButton,openUrlButton];
  guarded.forEach((button)=>{if(button)button.disabled=true;});
  setStatus("Opening editor…");
  try{
    await refreshDraftAvailability();
    if(draftMetadata?.bytes){
      try{
        await recoverLatestDraft();
        return;
      }catch(error){
        // The saved draft is never overwritten or deleted on recovery failure.
        await createNewCourse({automatic:true});
        if(draftMenu)draftMenu.hidden=false;
        setStatus("Could not automatically restore the saved draft. It has not been deleted.");
        console.warn('P2LRN Studio draft recovery failed',error);
        return;
      }
    }
    await createNewCourse({automatic:true});
  }catch(error){
    setStatus("Could not open Studio editor: "+String(error?.message||error));
    console.error('P2LRN Studio startup failed',error);
  }finally{
    guarded.forEach((button)=>{if(button)button.disabled=false;});
    document.documentElement.dataset.p2lrnStudioReady='true';
    if(studio&&toolbar&&!toolbar.hidden&&workspace&&!workspace.hidden)
      globalThis.P2LRNRecordConversion?.('studio_editor_ready');
  }
}
void initializeStudioWorkspace();
window.addEventListener('beforeunload',(event)=>{
  revokeUrls();
  if(hasUnsavedChanges()){
    event.preventDefault();
    event.returnValue='';
  }
});
// p2lrnStudioReady now marks completed editor initialization.
