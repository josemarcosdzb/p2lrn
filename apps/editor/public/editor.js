const state={projectId:null,project:null,summary:null};
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
$('build').onclick=async()=>{const data=await api(`/api/projects/${encodeURIComponent(state.projectId)}/build`,{method:'POST',body:'{}'});$('status').textContent='Paquete válido: '+data.result.contentRoot;};
async function preview(){const data=await api(`/api/projects/${encodeURIComponent(state.projectId)}/build`,{method:'POST',body:'{}'});const player=$('player');player.setAttribute('src',data.packageUrl+'?v='+Date.now());$('previewDialog').showModal();await player.reload?.();}
$('preview').onclick=preview;$('closePreview').onclick=()=>$('previewDialog').close();
(async()=>{try{const h=await api('/api/health');$('status').textContent=`API ${h.authoringApi} · formato ${h.format}`;await loadProjects();render();}catch(e){$('status').textContent=e.message;}})();
