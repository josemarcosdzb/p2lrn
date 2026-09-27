const state={projectId:null,project:null,summary:null,pendingDocument:null};
const $=(id)=>document.getElementById(id);
async function api(path,options={}){const r=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||r.statusText);return data;}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderTree(){
  const p=state.project;if(!p){$('tree').innerHTML='';return;}
  const byKey=new Map([[p.course.key,p.course],...p.units.map(x=>[x.key,x]),...p.activities.map(x=>[x.key,x])]);
  const render=(key,depth=0)=>{const e=byKey.get(key);if(!e)return'';const role=e===p.course?'Curso':(e.role||'Actividad');const title=Object.values(e.title||{})[0]||e.key;return `<div class="tree-item" style="--depth:${depth}"><span>${escapeHtml(role)}</span><b>${escapeHtml(title)}</b></div>${(e.children||[]).map(c=>render(c,depth+1)).join('')}`;};
  $('tree').innerHTML=render(p.course.key);
}
function render(){
  const active=Boolean(state.project);
  $('empty').hidden=active;$('editor').hidden=!active;$('build').disabled=!active;$('preview').disabled=!active;
  if(!active)return;
  const lang=state.project.course.languages?.[0]||'es';
  $('courseTitle').value=state.project.course.title?.[lang]||Object.values(state.project.course.title||{})[0]||'';
  $('courseDescription').value=state.project.course.description?.[lang]||'';
  $('summary').innerHTML=`<p><b>${state.summary.counts.units}</b> unidades</p><p><b>${state.summary.counts.activities}</b> actividades</p><p><b>${state.summary.counts.resources}</b> recursos</p>`;
  $('diagnostics').textContent=JSON.stringify({summary:state.summary,projectId:state.project.projectId},null,2);
  renderTree();
}
async function loadProjects(){
  const data=await api('/api/projects');$('projectList').innerHTML=data.projects.map(p=>`<button class="project-button" data-project="${p.id}">${escapeHtml(Object.values(p.course.title||{})[0]||p.id)}</button>`).join('');
  document.querySelectorAll('[data-project]').forEach(b=>b.addEventListener('click',()=>openProject(b.dataset.project)));
}
async function openProject(id){const data=await api('/api/projects/'+encodeURIComponent(id));state.projectId=id;state.project=data.project;state.summary=data.summary;render();}
function showNew(){$('newDialog').showModal();}
$('newProject').onclick=showNew;$('emptyNew').onclick=showNew;
$('newForm').addEventListener('submit',async e=>{if(e.submitter?.value==='cancel')return;e.preventDefault();const fd=new FormData(e.currentTarget);const data=await api('/api/projects',{method:'POST',body:JSON.stringify(Object.fromEntries(fd))});$('newDialog').close();state.projectId=data.id;state.project=data.project;state.summary=data.summary;await loadProjects();render();});
let saveTimer;
function scheduleCourseSave(){clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{if(!state.projectId)return;const data=await api(`/api/projects/${encodeURIComponent(state.projectId)}/course`,{method:'PATCH',body:JSON.stringify({title:$('courseTitle').value,description:$('courseDescription').value})});state.project=data.project;state.summary=data.summary;renderTree();},300);}
$('courseTitle').addEventListener('input',scheduleCourseSave);$('courseDescription').addEventListener('input',scheduleCourseSave);
async function addUnit(role){if(!state.projectId)return;const title=role==='module'?'Nuevo módulo':'Nueva lección';const key=(role==='module'?'module-':'lesson-')+crypto.randomUUID().slice(0,8);const data=await api(`/api/projects/${encodeURIComponent(state.projectId)}/units`,{method:'POST',body:JSON.stringify({key,title,role,parent:'course'})});state.project=data.project;state.summary=data.summary;render();}
$('addModule').onclick=()=>addUnit('module');$('addLesson').onclick=()=>addUnit('lesson');

const questionHelp={
  'single-choice':['Una opción por línea; indica el número correcto.','Opción A\nOpción B','1'],
  'multiple-choice':['Una opción por línea; indica números correctos separados por comas.','Opción A\nOpción B\nOpción C','1,3'],
  'true-false':['La solución debe ser true o false.','Verdadero\nFalso','true'],
  'text':['Una respuesta aceptada por línea.','respuesta correcta\nalternativa',''],
  'fill-blanks':['Una línea por hueco: id=respuesta|alternativa.','hueco1=respuesta|alternativa',''],
  'ordering':['Un elemento por línea en el orden correcto.','Primero\nSegundo\nTercero',''],
  'matching':['Una pareja por línea: izquierda => derecha.','Madrid => España\nParís => Francia','']
};
function refreshQuestionHelp(){const [help,items,solution]=questionHelp[$('questionType').value];$('questionHelp').textContent=help;$('questionItems').value=items;$('questionSolution').value=solution;}
$('questionType').addEventListener('change',refreshQuestionHelp);
$('addQuiz').onclick=()=>{refreshQuestionHelp();$('quizDialog').showModal();};
function qtoken(prefix,index){return prefix+String(index+1);}
function questionFromForm(fd){
  const type=String(fd.get('type')),prompt=String(fd.get('prompt')||'').trim(),raw=String(fd.get('items')||'');
  const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),solution=String(fd.get('solution')||'').trim();
  const base={id:'q1',type,prompt,points:1,scoring:'all-or-nothing',required:true};
  if(type==='single-choice'||type==='multiple-choice'||type==='true-false'){
    const labels=type==='true-false'?['Verdadero','Falso']:lines;
    if(labels.length<2)throw new Error('La pregunta necesita al menos dos opciones.');
    const choices=labels.map((text,i)=>({id:qtoken('c',i),text}));
    let indexes;
    if(type==='true-false')indexes=[/^(?:true|verdadero|1)$/i.test(solution)?0:1];
    else indexes=solution.split(',').map(x=>Number(x.trim())-1).filter(x=>Number.isInteger(x)&&x>=0&&x<choices.length);
    if(!indexes.length)throw new Error('Indica al menos una respuesta correcta.');
    return{...base,choices,solution:{choiceIds:[...new Set(indexes.map(i=>choices[i].id))]}};
  }
  if(type==='text'){
    if(!lines.length)throw new Error('Añade al menos una respuesta aceptada.');
    return{...base,solution:{acceptedAnswers:lines}};
  }
  if(type==='fill-blanks'){
    const answers={};const blanks=lines.map((line,i)=>{const [idRaw,valuesRaw]=line.split('=',2),id=(idRaw||qtoken('blank',i)).trim(),values=String(valuesRaw||'').split('|').map(x=>x.trim()).filter(Boolean);if(!values.length)throw new Error('Cada hueco necesita una respuesta.');answers[id]=values;return{id};});
    if(!blanks.length)throw new Error('Añade al menos un hueco.');
    return{...base,body:prompt,blanks,solution:{answers}};
  }
  if(type==='ordering'){
    if(lines.length<2)throw new Error('Añade al menos dos elementos.');
    const items=lines.map((text,i)=>({id:qtoken('item',i),text}));
    return{...base,items,solution:{order:items.map(x=>x.id)}};
  }
  if(type==='matching'){
    const pairs=lines.map((line,i)=>{const parts=line.split(/\s*=>\s*/,2);if(parts.length!==2||!parts[0]||!parts[1])throw new Error('Usa el formato izquierda => derecha.');return{left:{id:qtoken('l',i),text:parts[0]},right:{id:qtoken('r',i),text:parts[1]}};});
    if(!pairs.length)throw new Error('Añade al menos una pareja.');
    return{...base,left:pairs.map(x=>x.left),right:pairs.map(x=>x.right),solution:{pairs:pairs.map(x=>({left:x.left.id,right:x.right.id}))}};
  }
  throw new Error('Tipo de pregunta no soportado.');
}
$('quizForm').addEventListener('submit',async e=>{
  if(e.submitter?.value==='cancel')return;e.preventDefault();
  try{
    const fd=new FormData(e.currentTarget),title=String(fd.get('title')||'Cuestionario').trim(),renderer=String(fd.get('renderer')||'');
    const question=questionFromForm(fd);
    const data={schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',version:'0.4.0',title,language:state.project?.course?.languages?.[0]||'es',grading:{mode:'embedded-key'},presentation:{questionMode:'one-at-a-time',showFeedback:'after-submit'},questions:[question]};
    const result=await api(`/api/projects/${encodeURIComponent(state.projectId)}/questionnaires`,{method:'POST',body:JSON.stringify({title,language:data.language,renderer:renderer||undefined,data})});
    state.project=result.project;state.summary=result.summary;$('quizDialog').close();render();$('status').textContent='Cuestionario creado y validado.';
  }catch(error){$('status').textContent=error.message;}
});

$('inspectDocument').onclick=()=>$('documentFile').click();
$('documentFile').addEventListener('change',async()=>{
  const file=$('documentFile').files?.[0];if(!file)return;
  $('status').textContent='Leyendo '+file.name+'…';
  try{
    const r=await fetch('/api/documents/inspect?name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
    const data=await r.json();if(!r.ok)throw new Error(data.error||r.statusText);
    const modules=data.outline.modules||[],lessonCount=modules.reduce((n,m)=>n+(m.lessons?.length||0),0),contentCount=modules.reduce((n,m)=>n+(m.lessons||[]).reduce((s,l)=>s+(l.content?.length||0),0),0);
    $('documentResult').innerHTML=`<h2>${escapeHtml(file.name)}</h2><div class="metric-grid"><div><b>${modules.length}</b><span>módulos</span></div><div><b>${lessonCount}</b><span>lecciones</span></div><div><b>${contentCount}</b><span>elementos</span></div><div><b>${data.assetCount}</b><span>assets</span></div></div><div class="outline-preview">${modules.map(m=>`<section><h3>${escapeHtml(m.title)}</h3>${(m.lessons||[]).map(l=>`<div><b>${escapeHtml(l.title)}</b><small>${l.content?.length||0} elementos</small></div>`).join('')}</section>`).join('')}</div><p class="muted">La importación crea módulos y lecciones P2LRN y conserva el contenido reproducible. El proceso es transaccional: si algo falla, el curso original no cambia.</p>`;
    state.pendingDocument=file;$('confirmDocumentImport').disabled=!state.projectId;
    $('documentDialog').showModal();$('status').textContent='Documento leído sin modificar el curso.';
  }catch(error){$('status').textContent=error.message;}
  finally{$('documentFile').value='';}
});
function closeDocumentDialog(){state.pendingDocument=null;$('confirmDocumentImport').disabled=true;$('documentDialog').close();}
$('closeDocument').onclick=closeDocumentDialog;
$('cancelDocumentImport').onclick=closeDocumentDialog;
$('confirmDocumentImport').onclick=async()=>{
  const file=state.pendingDocument;if(!file||!state.projectId)return;
  $('confirmDocumentImport').disabled=true;$('status').textContent='Importando '+file.name+'…';
  try{
    const r=await fetch(`/api/projects/${encodeURIComponent(state.projectId)}/import-document?name=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
    const data=await r.json();if(!r.ok)throw new Error(data.error||r.statusText);
    state.project=data.project;state.summary=data.summary;
    render();closeDocumentDialog();
    $('status').textContent=`Importado: ${data.imported.created.modules} módulos, ${data.imported.created.lessons} lecciones.`;
  }catch(error){$('status').textContent=error.message;$('confirmDocumentImport').disabled=false;}
};
$('build').onclick=async()=>{const data=await api(`/api/projects/${encodeURIComponent(state.projectId)}/build`,{method:'POST',body:'{}'});$('status').textContent='Paquete válido: '+data.result.contentRoot;};
async function preview(){const data=await api(`/api/projects/${encodeURIComponent(state.projectId)}/build`,{method:'POST',body:'{}'});const player=$('player');player.setAttribute('src',data.packageUrl+'?v='+Date.now());$('previewDialog').showModal();await player.reload?.();}
$('preview').onclick=preview;$('closePreview').onclick=()=>$('previewDialog').close();
(async()=>{try{const h=await api('/api/health');$('status').textContent=`API ${h.authoringApi} · formato ${h.format}`;await loadProjects();render();}catch(e){$('status').textContent=e.message;}})();
