import {
  P2LRN_ANALYTICS_VERSION,
  ANALYTICS_DATASET_SCHEMA,
  normalizeAnalyticsDataset,
  computeAnalyticsSnapshot,
  filterAnalyticsDataset,
  analyticsToCsv,
} from './model.js';

const HTMLElementBase=globalThis.HTMLElement??class{};
const esc=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const attr=esc;
const pct=(value,locale='es-ES')=>value==null?'—':new Intl.NumberFormat(locale,{style:'percent',maximumFractionDigits:1}).format(value);
const integer=(value,locale='es-ES')=>new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(Number(value)||0);
const decimal=(value,locale='es-ES')=>new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(Number(value)||0);
const duration=(value,locale='es-ES')=>{
  const ms=Math.max(0,Number(value)||0);
  const hours=ms/3_600_000;
  if(hours>=1)return new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(hours)+' h';
  return new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(ms/60_000)+' min';
};
const dateText=(value,locale='es-ES')=>{
  if(!value)return '—';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '—';
  return new Intl.DateTimeFormat(locale,{day:'2-digit',month:'short',year:'numeric'}).format(date);
};
const shortDate=(value,locale='es-ES')=>{
  if(!value)return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  return new Intl.DateTimeFormat(locale,{day:'2-digit',month:'short'}).format(date);
};
const download=(name,text,type='text/csv;charset=utf-8')=>{
  if(!globalThis.document||!globalThis.URL)return;
  const blob=new Blob([text],{type});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
const riskLabel=(level)=>level==='high'?'Atención alta':level==='watch'?'Revisar':'Normal';
const eventLabel=(event)=>{
  const labels={
    'p2lrn:ready':'Player preparado','p2lrn:rendered':'Contenido mostrado','p2lrn:navigation':'Navegación',
    'p2lrn:answer':'Respuesta','p2lrn:attempt':'Intento','p2lrn:interaction':'Interacción',
    'p2lrn:progress':'Progreso','p2lrn:score':'Puntuación','p2lrn:complete':'Completado',
    'p2lrn:timeout':'Tiempo agotado','p2lrn:active-time':'Tiempo activo','p2lrn:attention':'Atención',
    'p2lrn:error':'Error','p2lrn:xapi':'xAPI','p2lrn:capability':'Capacidad',
  };
  return labels[event.type]??event.type;
};

const css=`:host{
  --pa-bg:#f4f6f9;--pa-panel:#fff;--pa-ink:#101828;--pa-muted:#667085;--pa-line:#e4e7ec;
  --pa-accent:#4568e8;--pa-cyan:#20b9c8;--pa-good:#087443;--pa-warn:#a15c00;--pa-bad:#b42318;
  display:block;min-width:0;color:var(--pa-ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif
}
*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}
.shell{min-height:720px;border:1px solid #d9dee7;border-radius:16px;overflow:hidden;background:var(--pa-bg);box-shadow:0 18px 50px rgba(16,24,40,.08)}
.topbar{display:flex;align-items:center;gap:18px;padding:18px 20px;background:#0d1117;color:#fff;border-bottom:1px solid rgba(255,255,255,.08)}
.brand{display:flex;align-items:center;gap:11px;min-width:max-content}.mark{display:block;flex:none;width:5px;height:30px;border-radius:999px;background:linear-gradient(180deg,#20b9c8,#4568e8);box-shadow:0 0 0 1px rgba(255,255,255,.06)}
.brand-copy strong{display:block;font-size:14px;letter-spacing:.02em}.brand-copy span{display:block;margin-top:2px;color:#98a2b3;font-size:10px;font-weight:700;letter-spacing:.13em;text-transform:uppercase}
.top-status{margin-left:auto;display:flex;align-items:center;gap:9px;color:#d0d5dd;font-size:12px}.live-dot{width:7px;height:7px;border-radius:50%;background:#12b76a;box-shadow:0 0 0 4px rgba(18,183,106,.12)}
.toolbar{display:grid;grid-template-columns:minmax(200px,1.5fr) minmax(160px,.8fr) minmax(130px,.6fr) minmax(120px,.5fr) auto;gap:9px;padding:14px 16px;border-bottom:1px solid var(--pa-line);background:#fff}
.control{display:grid;gap:4px;min-width:0}.control label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#667085}
.control input,.control select{width:100%;height:38px;border:1px solid #d0d5dd;border-radius:9px;padding:0 10px;background:#fff;color:#101828;outline:none}.control input:focus,.control select:focus{border-color:#7891ef;box-shadow:0 0 0 3px rgba(69,104,232,.12)}
.action-row{display:flex;align-items:end;gap:7px}.icon-button,.export-button{height:38px;border:1px solid #d0d5dd;border-radius:9px;background:#fff;padding:0 12px;color:#344054;font-weight:700}.export-button{background:#101828;color:#fff;border-color:#101828}
.tabs{display:flex;gap:4px;padding:8px 16px;border-bottom:1px solid var(--pa-line);background:#fff;overflow:auto}.tab{border:0;border-radius:8px;background:transparent;padding:8px 11px;color:#667085;font-size:12px;font-weight:700;white-space:nowrap}.tab[aria-current=true]{background:#eef2ff;color:#2f4bc6}
.main{padding:18px}.kpis{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:10px;margin-bottom:14px}.kpi{padding:15px;border:1px solid var(--pa-line);border-radius:13px;background:#fff;min-width:0}.kpi span{display:block;color:#667085;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}.kpi strong{display:block;margin-top:7px;font-size:25px;line-height:1;letter-spacing:-.04em}.kpi small{display:block;margin-top:7px;color:#98a2b3;font-size:10px}.kpi.alert strong{color:var(--pa-bad)}
.grid-2{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);gap:14px}.panel{border:1px solid var(--pa-line);border-radius:13px;background:#fff;overflow:hidden;min-width:0}.panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 15px;border-bottom:1px solid #eef0f3}.panel-head h2{margin:0;font-size:14px}.panel-head p{margin:3px 0 0;color:#667085;font-size:11px}.panel-body{padding:14px 15px}
.course-bars{display:grid;gap:12px}.course-bar{display:grid;grid-template-columns:minmax(120px,1fr) minmax(150px,1.1fr) auto;gap:12px;align-items:center}.course-bar button{border:0;background:none;padding:0;text-align:left;color:#101828;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.track{height:8px;border-radius:999px;background:#eef1f6;overflow:hidden}.fill{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--pa-accent),var(--pa-cyan))}.course-meta{font-size:11px;color:#667085;white-space:nowrap}
.spark{width:100%;height:130px;display:block}.spark .grid{stroke:#eef0f3;stroke-width:1}.spark .area{fill:rgba(69,104,232,.08)}.spark .line{fill:none;stroke:var(--pa-accent);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.spark .point{fill:#fff;stroke:var(--pa-accent);stroke-width:2}.spark-legend{display:flex;justify-content:space-between;gap:8px;color:#98a2b3;font-size:9px}
.risk-list,.event-list{display:grid;gap:8px}.risk-item,.event-item{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #f0f1f4}.risk-item:last-child,.event-item:last-child{border-bottom:0}.avatar{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:10px;background:#eef2ff;color:#3551c9;font-weight:800;font-size:12px}.item-copy{min-width:0;flex:1}.item-copy strong{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.item-copy span{display:block;margin-top:2px;color:#667085;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.badge{display:inline-flex;align-items:center;min-height:23px;border-radius:999px;padding:0 8px;font-size:9px;font-weight:800;letter-spacing:.02em}.badge.good{background:#ecfdf3;color:#087443}.badge.watch{background:#fffaeb;color:#a15c00}.badge.high{background:#fef3f2;color:#b42318}.badge.info{background:#eef2ff;color:#3448b8}.badge.muted{background:#f2f4f7;color:#667085}
.table-wrap{overflow:auto}.pager{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-top:1px solid #eef0f3;color:#667085;font-size:10px}.pager>div{display:flex;align-items:center;gap:8px}.pager .icon-button{height:30px;padding:0 9px;font-size:10px}.pager .icon-button:disabled{opacity:.45;cursor:not-allowed}table{width:100%;border-collapse:collapse;font-size:11px}th{position:sticky;top:0;z-index:1;padding:10px 11px;border-bottom:1px solid #dfe3e8;background:#f9fafb;color:#667085;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}td{padding:11px;border-bottom:1px solid #eef0f3;vertical-align:middle;white-space:nowrap}tbody tr:hover{background:#fbfcff}
.row-button{display:flex;align-items:center;gap:9px;max-width:260px;border:0;background:none;padding:0;text-align:left;color:#101828}.row-button strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row-button small{display:block;margin-top:2px;color:#667085;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mini-progress{display:flex;align-items:center;gap:7px;min-width:110px}.mini-progress .track{width:70px;height:6px}.empty{display:grid;place-items:center;min-height:260px;padding:28px;text-align:center;color:#667085}.empty strong{display:block;color:#344054;margin-bottom:5px}
.grade-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;align-items:end;min-height:190px}.grade-bin{display:grid;grid-template-rows:1fr auto auto;gap:6px;text-align:center;height:170px}.grade-bin .column{align-self:end;width:100%;min-height:4px;border-radius:8px 8px 3px 3px;background:linear-gradient(#5c7bf1,#31b8c4)}.grade-bin strong{font-size:11px}.grade-bin span{font-size:9px;color:#667085}
.category-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}.category{padding:12px;border:1px solid #e4e7ec;border-radius:10px;background:#fafbfc}.category strong{display:block;font-size:20px}.category span{display:block;margin-top:4px;color:#667085;font-size:10px;text-transform:capitalize}
.detail{margin-top:14px;border:1px solid #cfd7f0;border-radius:14px;background:#fff;overflow:hidden;box-shadow:0 12px 35px rgba(16,24,40,.08)}.detail-head{display:flex;justify-content:space-between;gap:16px;padding:17px;border-bottom:1px solid #e8ebf0;background:linear-gradient(120deg,#fbfcff,#f4fbfc)}.detail-title{display:flex;align-items:center;gap:11px}.detail-title .avatar{width:42px;height:42px}.detail-title h2{margin:0;font-size:17px}.detail-title p{margin:3px 0 0;color:#667085;font-size:11px}.close{width:34px;height:34px;border:1px solid #d0d5dd;border-radius:9px;background:#fff;color:#475467}.detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;padding:14px}.detail-stat{padding:12px;border:1px solid #e4e7ec;border-radius:10px}.detail-stat span{display:block;color:#667085;font-size:9px;text-transform:uppercase;font-weight:800}.detail-stat strong{display:block;margin-top:5px;font-size:17px}.detail-section{padding:0 14px 14px}.detail-section h3{font-size:12px;margin:4px 0 9px}.signal-list{display:flex;gap:6px;flex-wrap:wrap}
.loading{position:relative}.loading::after{content:"";position:absolute;inset:0;background:rgba(244,246,249,.72);backdrop-filter:blur(1px);z-index:20}.loading::before{content:"";position:absolute;z-index:21;left:50%;top:50%;width:26px;height:26px;margin:-13px;border:3px solid #d8def6;border-top-color:#4568e8;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.error{margin:14px;padding:11px 13px;border:1px solid #fecdca;border-radius:10px;background:#fef3f2;color:#912018;font-size:11px}.footer-note{display:flex;justify-content:space-between;gap:12px;padding:9px 16px;border-top:1px solid #e4e7ec;background:#fff;color:#98a2b3;font-size:9px}
@media(max-width:1080px){.kpis{grid-template-columns:repeat(3,1fr)}.toolbar{grid-template-columns:1fr 1fr 1fr}.action-row{grid-column:1/-1}.grid-2{grid-template-columns:1fr}.detail-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:680px){.shell{border-radius:0}.topbar{padding:14px}.top-status{display:none}.toolbar{grid-template-columns:1fr}.action-row{grid-column:auto}.tabs{padding:7px 10px}.main{padding:10px}.kpis{grid-template-columns:repeat(2,1fr)}.kpi strong{font-size:21px}.course-bar{grid-template-columns:1fr}.grade-grid{gap:4px}.detail-grid{grid-template-columns:1fr 1fr}.footer-note{display:block}.footer-note span{display:block;margin-top:3px}}
`;

function initials(name){
  const parts=String(name??'').trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0,2).map((part)=>part[0]).join('')||'A').toUpperCase();
}
function courseFor(dataset,id){return dataset.courses.find((item)=>item.id===id);}
function learnerFor(dataset,id){return dataset.learners.find((item)=>item.id===id);}
function gradeFor(dataset,learnerId,courseId){
  return dataset.grades.filter((item)=>item.learnerId===learnerId&&item.courseId===courseId&&item.authoritative)
    .sort((a,b)=>new Date(b.updatedAt??0)-new Date(a.updatedAt??0))[0]??null;
}
function gradeRatio(grade){
  const value=Number(grade?.value),max=Number(grade?.maxValue);
  return grade?.authoritative&&Number.isFinite(value)&&Number.isFinite(max)&&max>0?Math.max(0,Math.min(1,value/max)):null;
}
function learnerCourses(dataset,learnerId){
  const ids=new Set();
  dataset.enrollments.filter((item)=>item.learnerId===learnerId).forEach((item)=>ids.add(item.courseId));
  dataset.attempts.filter((item)=>item.learnerId===learnerId).forEach((item)=>ids.add(item.courseId));
  dataset.grades.filter((item)=>item.learnerId===learnerId).forEach((item)=>ids.add(item.courseId));
  return [...ids];
}

export class P2LRNAnalyticsElement extends HTMLElementBase{
  static p2lrnAnalyticsVersion=P2LRN_ANALYTICS_VERSION;
  static get observedAttributes(){return['src','view','course-id','period','locale','page-size'];}
  #dataset=normalizeAnalyticsDataset({});
  #dataSource=null;
  #snapshot=computeAnalyticsSnapshot(this.#dataset);
  #root=null;
  #connected=false;
  #loading=false;
  #error='';
  #query='';
  #risk='all';
  #selected=null;
  #learnerPage=1;
  #gradePage=1;

  constructor(){
    super();
    if(this.attachShadow)this.attachShadow({mode:'open'});
  }
  connectedCallback(){
    if(!this.shadowRoot||this.#connected)return;
    this.#connected=true;
    this.#root=this.shadowRoot;
    this.#root.addEventListener('click',(event)=>this.#onClick(event));
    this.#root.addEventListener('input',(event)=>this.#onInput(event));
    this.#root.addEventListener('change',(event)=>this.#onInput(event));
    this.#render();
    if(this.src)this.refresh().catch(()=>{});
    else queueMicrotask(()=>this.dispatchEvent(new CustomEvent('p2lrn-analytics-ready',{detail:{version:P2LRN_ANALYTICS_VERSION},bubbles:true,composed:true})));
  }
  attributeChangedCallback(name,oldValue,newValue){
    if(oldValue===newValue)return;
    if(name==='src'&&this.#connected&&newValue)this.refresh().catch(()=>{});
    else if(this.#connected){if(name==='course-id'||name==='page-size'){this.#learnerPage=1;this.#gradePage=1;}this.#recompute();}
  }
  get src(){return this.getAttribute?.('src')??'';}
  set src(value){if(value)this.setAttribute('src',value);else this.removeAttribute('src');}
  get view(){return this.getAttribute?.('view')||'overview';}
  set view(value){this.setAttribute('view',String(value||'overview'));}
  get courseId(){return this.getAttribute?.('course-id')||'';}
  set courseId(value){if(value)this.setAttribute('course-id',value);else this.removeAttribute('course-id');}
  get period(){return this.getAttribute?.('period')||'14';}
  set period(value){this.setAttribute('period',String(value||'14'));}
  get locale(){return this.getAttribute?.('locale')||'es-ES';}
  set locale(value){this.setAttribute('locale',String(value||'es-ES'));}
  get pageSize(){return Math.max(10,Math.min(200,Math.floor(Number(this.getAttribute?.('page-size'))||50)));}
  set pageSize(value){this.setAttribute('page-size',String(Math.max(10,Math.min(200,Math.floor(Number(value)||50)))));}
  get data(){return this.#dataset;}
  set data(value){this.#dataset=normalizeAnalyticsDataset(value??{});this.#error='';this.#recompute();}
  get dataSource(){return this.#dataSource;}
  set dataSource(value){this.#dataSource=value??null;}

  async refresh(){
    this.#loading=true;this.#error='';this.#render();
    try{
      let next;
      if(this.#dataSource?.load)next=await this.#dataSource.load({courseId:this.courseId||undefined,period:this.period});
      else if(this.src){
        const response=await fetch(this.src,{credentials:'same-origin',headers:{accept:'application/json'}});
        if(!response.ok)throw new Error('No se pudo cargar Analytics (HTTP '+response.status+').');
        next=await response.json();
      }else next=this.#dataset;
      this.#dataset=normalizeAnalyticsDataset(next);
      this.#recompute(false);
      this.dispatchEvent(new CustomEvent('p2lrn-analytics-refresh',{detail:{dataset:this.#dataset},bubbles:true,composed:true}));
      return this.#dataset;
    }catch(error){
      this.#error=String(error?.message??error);
      this.dispatchEvent(new CustomEvent('p2lrn-analytics-error',{detail:{error},bubbles:true,composed:true}));
      throw error;
    }finally{this.#loading=false;this.#render();}
  }
  setView(view){this.view=view;}
  selectLearner(id){this.#selected={type:'learner',id:String(id)};this.#render();}
  selectCourse(id){this.#selected={type:'course',id:String(id)};this.#render();}
  exportCsv(kind='learners'){
    const csv=analyticsToCsv(this.#snapshot,{kind,locale:this.locale});
    download('p2lrn-analytics-'+kind+'.csv',csv);
    this.dispatchEvent(new CustomEvent('p2lrn-analytics-export',{detail:{kind},bubbles:true,composed:true}));
    return csv;
  }

  #recompute(render=true){
    const selectedCourse=this.courseId;
    const filtered=selectedCourse?filterAnalyticsDataset(this.#dataset,{courseId:selectedCourse}):this.#dataset;
    const days=Math.max(7,Math.min(90,Number(this.period)||14));
    this.#snapshot=computeAnalyticsSnapshot(filtered,{activityDays:days});
    if(render)this.#render();
  }
  #onClick(event){
    const button=event.target.closest?.('button,a');
    if(!button)return;
    if(button.matches('[data-view]')){this.view=button.dataset.view;return;}
    if(button.matches('[data-page-kind]')){const kind=button.dataset.pageKind,dir=Number(button.dataset.pageDir)||0;if(kind==='learners')this.#learnerPage=Math.max(1,this.#learnerPage+dir);if(kind==='grades')this.#gradePage=Math.max(1,this.#gradePage+dir);this.#render();return;}
    if(button.matches('[data-refresh]')){this.refresh().catch(()=>{});return;}
    if(button.matches('[data-export]')){this.exportCsv(button.dataset.export||'learners');return;}
    if(button.matches('[data-learner]')){this.selectLearner(button.dataset.learner);this.#emitSelection('learner',button.dataset.learner);return;}
    if(button.matches('[data-course]')){this.selectCourse(button.dataset.course);this.#emitSelection('course',button.dataset.course);return;}
    if(button.matches('[data-close-detail]')){this.#selected=null;this.#render();}
  }
  #onInput(event){
    const target=event.target;
    if(target.matches?.('[data-query]')){this.#query=target.value;this.#learnerPage=1;this.#render();}
    else if(target.matches?.('[data-course-filter]')){this.#learnerPage=1;this.#gradePage=1;this.courseId=target.value;}
    else if(target.matches?.('[data-risk-filter]')){this.#risk=target.value;this.#learnerPage=1;this.#render();}
    else if(target.matches?.('[data-period]'))this.period=target.value;
  }
  #emitSelection(type,id){this.dispatchEvent(new CustomEvent('p2lrn-analytics-select',{detail:{type,id},bubbles:true,composed:true}));}
  #paginate(rows,kind){
    const size=this.pageSize,totalPages=Math.max(1,Math.ceil(rows.length/size));
    let page=kind==='grades'?this.#gradePage:this.#learnerPage;
    page=Math.max(1,Math.min(totalPages,page));
    if(kind==='grades')this.#gradePage=page;else this.#learnerPage=page;
    const start=(page-1)*size,end=Math.min(rows.length,start+size);
    return {items:rows.slice(start,end),page,totalPages,start,end,total:rows.length};
  }
  #pager(kind,state){
    if(state.total<=this.pageSize)return '';
    return '<div class="pager"><span>Mostrando '+integer(state.start+1,this.locale)+'–'+integer(state.end,this.locale)+' de '+integer(state.total,this.locale)+'</span><div><button class="icon-button" type="button" data-page-kind="'+kind+'" data-page-dir="-1" '+(state.page<=1?'disabled':'')+'>Anterior</button><span>Página '+integer(state.page,this.locale)+' / '+integer(state.totalPages,this.locale)+'</span><button class="icon-button" type="button" data-page-kind="'+kind+'" data-page-dir="1" '+(state.page>=state.totalPages?'disabled':'')+'>Siguiente</button></div></div>';
  }
  #courseOptions(){
    return ['<option value="">Todos los cursos</option>',...this.#dataset.courses.map((course)=>'<option value="'+attr(course.id)+'" '+(course.id===this.courseId?'selected':'')+'>'+esc(course.title)+'</option>')].join('');
  }
  #tabs(){
    const tabs=[['overview','Resumen'],['learners','Alumnos'],['courses','Cursos'],['grades','Notas'],['activity','Actividad']];
    return tabs.map(([id,label])=>'<button class="tab" type="button" data-view="'+id+'" aria-current="'+String(this.view===id)+'">'+label+'</button>').join('');
  }
  #kpis(){
    const o=this.#snapshot.overview;
    const rows=[
      ['Alumnos',integer(o.learners,this.locale),integer(o.activeLearners,this.locale)+' activos (30 días)',''],
      ['Cursos',integer(o.courses,this.locale),integer(o.enrollments,this.locale)+' matrículas',''],
      ['Nota media',pct(o.averageGrade,this.locale),'Sólo notas autoritativas',''],
      ['Finalización',pct(o.completionRate,this.locale),integer(o.attempts,this.locale)+' intentos',''],
      ['Tiempo activo',duration(o.activeTimeMs,this.locale),integer(o.events,this.locale)+' eventos',''],
      ['Necesitan revisión',integer(o.atRisk,this.locale),'Reglas transparentes','alert'],
    ];
    return '<div class="kpis">'+rows.map(([label,value,help,kind])=>'<div class="kpi '+kind+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(help)+'</small></div>').join('')+'</div>';
  }
  #activityChart(){
    const rows=this.#snapshot.activity,max=Math.max(1,...this.#snapshot.activity.map((row)=>row.events));
    const width=520,height=120,pad=10;
    const points=rows.map((row,index)=>[pad+(rows.length===1?0:index*(width-pad*2)/(rows.length-1)),height-pad-(row.events/max)*(height-pad*2)]);
    const pointText=points.map((point)=>point.join(',')).join(' ');
    const area=points.length?'M '+points[0][0]+' '+(height-pad)+' L '+points.map((point)=>point.join(' ')).join(' L ')+' L '+points.at(-1)[0]+' '+(height-pad)+' Z':'';
    return '<svg class="spark" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Actividad reciente"><line class="grid" x1="10" y1="30" x2="510" y2="30"/><line class="grid" x1="10" y1="70" x2="510" y2="70"/><line class="grid" x1="10" y1="110" x2="510" y2="110"/><path class="area" d="'+area+'"/><polyline class="line" points="'+pointText+'"/>'+points.map((point)=>'<circle class="point" cx="'+point[0]+'" cy="'+point[1]+'" r="3"/>').join('')+'</svg><div class="spark-legend"><span>'+esc(shortDate(rows[0]?.date,this.locale))+'</span><span>'+esc(shortDate(rows.at(-1)?.date,this.locale))+'</span></div>';
  }
  #overview(){
    const courseBars=this.#snapshot.courses.slice(0,7).map((item)=>'<div class="course-bar"><button type="button" data-course="'+attr(item.id)+'">'+esc(item.course.title)+'</button><div class="track"><div class="fill" style="width:'+Math.round(item.averageProgress*100)+'%"></div></div><span class="course-meta">'+esc(pct(item.averageProgress,this.locale))+' · '+esc(pct(item.averageGrade,this.locale))+'</span></div>').join('')||'<div class="empty"><div><strong>Sin cursos</strong><span>Conecta un dataset para empezar.</span></div></div>';
    const risks=this.#snapshot.learners.filter((item)=>item.risk.level!=='none').slice(0,6).map((item)=>'<div class="risk-item"><div class="avatar">'+esc(initials(item.learner.name))+'</div><div class="item-copy"><strong>'+esc(item.learner.name)+'</strong><span>'+esc(item.risk.reasons.map((reason)=>reason.label).join(' · '))+'</span></div><span class="badge '+item.risk.level+'">'+esc(riskLabel(item.risk.level))+'</span></div>').join('')||'<div class="empty" style="min-height:150px"><div><strong>Sin señales activas</strong><span>No hay alumnos que cumplan las reglas configuradas.</span></div></div>';
    return this.#kpis()+'<div class="grid-2"><section class="panel"><div class="panel-head"><div><h2>Rendimiento por curso</h2><p>Progreso medio y nota oficial media</p></div></div><div class="panel-body"><div class="course-bars">'+courseBars+'</div></div></section><section class="panel"><div class="panel-head"><div><h2>Actividad reciente</h2><p>Eventos P2LRN durante '+esc(this.period)+' días</p></div></div><div class="panel-body">'+this.#activityChart()+'</div></section><section class="panel"><div class="panel-head"><div><h2>Señales de seguimiento</h2><p>Reglas visibles, no predicción opaca</p></div></div><div class="panel-body"><div class="risk-list">'+risks+'</div></div></section><section class="panel"><div class="panel-head"><div><h2>Últimos eventos</h2><p>Actividad normalizada del Player/Host</p></div></div><div class="panel-body">'+this.#eventList(7)+'</div></section></div>';
  }
  #filteredLearners(){
    const q=this.#query.trim().toLocaleLowerCase(this.locale);
    return this.#snapshot.learners.filter((item)=>{
      if(this.#risk!=='all'&&item.risk.level!==this.#risk)return false;
      if(!q)return true;
      return [item.learner.name,item.learner.email,item.learner.group,item.learner.cohort,item.learner.id].some((value)=>String(value??'').toLocaleLowerCase(this.locale).includes(q));
    });
  }
  #learners(){
    const allRows=this.#filteredLearners();
    if(!allRows.length)return '<div class="empty"><div><strong>No hay alumnos que coincidan</strong><span>Cambia los filtros o conecta otro dataset.</span></div></div>';
    const page=this.#paginate(allRows,'learners'),rows=page.items;
    return '<section class="panel"><div class="panel-head"><div><h2>Alumnos</h2><p>'+integer(allRows.length,this.locale)+' registros visibles</p></div><button class="icon-button" type="button" data-export="learners">CSV</button></div><div class="table-wrap"><table><thead><tr><th>Alumno</th><th>Cursos</th><th>Progreso</th><th>Nota</th><th>Intentos</th><th>Tiempo activo</th><th>Última actividad</th><th>Señal</th></tr></thead><tbody>'+rows.map((item)=>'<tr><td><button class="row-button" type="button" data-learner="'+attr(item.id)+'"><span class="avatar">'+esc(initials(item.learner.name))+'</span><span><strong>'+esc(item.learner.name)+'</strong><small>'+esc(item.learner.email||item.learner.group||item.id)+'</small></span></button></td><td>'+integer(item.courses,this.locale)+'</td><td><span class="mini-progress"><span class="track"><span class="fill" style="width:'+Math.round(item.progress*100)+'%"></span></span>'+esc(pct(item.progress,this.locale))+'</span></td><td>'+esc(pct(item.gradeRatio,this.locale))+'</td><td>'+integer(item.attempts,this.locale)+'</td><td>'+esc(duration(item.activeTimeMs,this.locale))+'</td><td>'+esc(dateText(item.lastActivity,this.locale))+'</td><td><span class="badge '+item.risk.level+'">'+esc(riskLabel(item.risk.level))+'</span></td></tr>').join('')+'</tbody></table></div>'+this.#pager('learners',page)+'</section>';
  }
  #courses(){
    const rows=this.#snapshot.courses;
    if(!rows.length)return '<div class="empty"><div><strong>No hay cursos</strong><span>El Host todavía no ha entregado cursos al panel.</span></div></div>';
    return '<section class="panel"><div class="panel-head"><div><h2>Cursos</h2><p>Progreso, notas, intentos y actividad</p></div><button class="icon-button" type="button" data-export="courses">CSV</button></div><div class="table-wrap"><table><thead><tr><th>Curso</th><th>Alumnos</th><th>Iniciados</th><th>Completados</th><th>Progreso</th><th>Nota media</th><th>Aprobados</th><th>Intentos</th><th>Actividad</th><th>Señales</th></tr></thead><tbody>'+rows.map((item)=>'<tr><td><button class="row-button" type="button" data-course="'+attr(item.id)+'"><span class="avatar">'+esc(initials(item.course.title))+'</span><span><strong>'+esc(item.course.title)+'</strong><small>'+esc(item.course.code||item.id)+'</small></span></button></td><td>'+integer(item.enrolled,this.locale)+'</td><td>'+integer(item.started,this.locale)+'</td><td>'+integer(item.completed,this.locale)+'</td><td>'+esc(pct(item.averageProgress,this.locale))+'</td><td>'+esc(pct(item.averageGrade,this.locale))+'</td><td>'+esc(pct(item.passRate,this.locale))+'</td><td>'+integer(item.attempts,this.locale)+'</td><td>'+esc(duration(item.activeTimeMs,this.locale))+'</td><td>'+integer(item.riskCount,this.locale)+'</td></tr>').join('')+'</tbody></table></div></section>';
  }
  #grades(){
    const bins=this.#snapshot.gradeDistribution,max=Math.max(1,...this.#snapshot.gradeDistribution.map((bin)=>bin.count));
    const chart='<section class="panel"><div class="panel-head"><div><h2>Distribución de notas</h2><p>Sólo calificaciones autoritativas del Host</p></div></div><div class="panel-body"><div class="grade-grid">'+bins.map((bin)=>'<div class="grade-bin"><div class="column" style="height:'+Math.max(4,Math.round((bin.count/max)*130))+'px"></div><strong>'+integer(bin.count,this.locale)+'</strong><span>'+esc(bin.key)+'%</span></div>').join('')+'</div></div></section>';
    const allGrades=[...this.#snapshot.dataset.grades].sort((a,b)=>new Date(b.updatedAt??0)-new Date(a.updatedAt??0));
    const page=this.#paginate(allGrades,'grades'),grades=page.items;
    const table='<section class="panel"><div class="panel-head"><div><h2>Libro de notas</h2><p>'+integer(allGrades.length,this.locale)+' calificaciones · oficiales e informativas diferenciadas</p></div><button class="icon-button" type="button" data-export="grades">CSV</button></div><div class="table-wrap"><table><thead><tr><th>Alumno</th><th>Curso</th><th>Elemento</th><th>Nota</th><th>Estado</th><th>Fuente</th><th>Actualizada</th></tr></thead><tbody>'+grades.map((grade)=>{const learner=learnerFor(this.#snapshot.dataset,grade.learnerId),course=courseFor(this.#snapshot.dataset,grade.courseId);const value=Number.isFinite(grade.value)&&Number.isFinite(grade.maxValue)?decimal(grade.value,this.locale)+' / '+decimal(grade.maxValue,this.locale):'—';return '<tr><td>'+esc(learner?.name??grade.learnerId)+'</td><td>'+esc(course?.title??grade.courseId)+'</td><td>'+esc(grade.entityId&&grade.entityId!==grade.courseId?grade.entityId:'Curso')+'</td><td><strong>'+esc(value)+'</strong></td><td><span class="badge '+(grade.authoritative?'good':'muted')+'">'+(grade.authoritative?'Oficial':'Informativa')+'</span></td><td>'+esc(grade.source)+'</td><td>'+esc(dateText(grade.updatedAt,this.locale))+'</td></tr>';}).join('')+'</tbody></table></div>'+this.#pager('grades',page)+'</section>';
    return '<div class="grid-2">'+chart+table+'</div>';
  }
  #eventList(limit=20){
    const events=this.#snapshot.recentEvents.slice(0,limit);
    if(!events.length)return '<div class="empty" style="min-height:150px"><div><strong>Sin actividad</strong><span>No se han recibido eventos para este filtro.</span></div></div>';
    return '<div class="event-list">'+events.map((event)=>{const learner=learnerFor(this.#snapshot.dataset,event.learnerId),course=courseFor(this.#snapshot.dataset,event.courseId);return '<div class="event-item"><span class="badge info">'+esc(event.category)+'</span><div class="item-copy"><strong>'+esc(eventLabel(event))+'</strong><span>'+esc([learner?.name,course?.title,dateText(event.timestamp,this.locale)].filter(Boolean).join(' · '))+'</span></div></div>';}).join('')+'</div>';
  }
  #activity(){
    const categories=new Map();for(const event of this.#snapshot.dataset.events)categories.set(event.category,(categories.get(event.category)??0)+1);
    return '<div class="grid-2"><section class="panel"><div class="panel-head"><div><h2>Categorías de actividad</h2><p>'+integer(this.#snapshot.dataset.events.length,this.locale)+' eventos normalizados</p></div></div><div class="panel-body"><div class="category-grid">'+[...categories.entries()].sort((a,b)=>b[1]-a[1]).map(([category,count])=>'<div class="category"><strong>'+integer(count,this.locale)+'</strong><span>'+esc(category)+'</span></div>').join('')+'</div></div></section><section class="panel"><div class="panel-head"><div><h2>Actividad reciente</h2><p>Últimos eventos recibidos</p></div></div><div class="panel-body">'+this.#eventList(24)+'</div></section></div>';
  }
  #detail(){
    if(!this.#selected)return '';
    if(this.#selected.type==='learner')return this.#learnerDetail(this.#selected.id);
    if(this.#selected.type==='course')return this.#courseDetail(this.#selected.id);
    return '';
  }
  #learnerDetail(id){
    const metric=this.#snapshot.learners.find((item)=>item.id===id)??computeAnalyticsSnapshot(filterAnalyticsDataset(this.#dataset,{learnerId:id})).learners[0];
    const learner=learnerFor(this.#dataset,id);if(!metric||!learner)return '';
    const rows=learnerCourses(this.#dataset,id).map((courseId)=>{const course=courseFor(this.#dataset,courseId);const filtered=computeAnalyticsSnapshot(filterAnalyticsDataset(this.#dataset,{learnerId:id,courseId}));const item=filtered.learners[0];const grade=gradeFor(this.#dataset,id,courseId);return '<tr><td>'+esc(course?.title??courseId)+'</td><td>'+esc(pct(item?.progress??0,this.locale))+'</td><td>'+esc(pct(gradeRatio(grade),this.locale))+'</td><td>'+integer(item?.attempts??0,this.locale)+'</td><td>'+esc(duration(item?.activeTimeMs??0,this.locale))+'</td></tr>';}).join('');
    const signals=metric.risk.reasons.length?metric.risk.reasons.map((reason)=>'<span class="badge '+metric.risk.level+'">'+esc(reason.label)+'</span>').join(''):'<span class="badge good">Sin señales</span>';
    return '<aside class="detail"><div class="detail-head"><div class="detail-title"><div class="avatar">'+esc(initials(learner.name))+'</div><div><h2>'+esc(learner.name)+'</h2><p>'+esc([learner.email,learner.group,learner.cohort].filter(Boolean).join(' · ')||learner.id)+'</p></div></div><button class="close" type="button" data-close-detail aria-label="Cerrar">×</button></div><div class="detail-grid"><div class="detail-stat"><span>Progreso</span><strong>'+esc(pct(metric.progress,this.locale))+'</strong></div><div class="detail-stat"><span>Nota oficial</span><strong>'+esc(pct(metric.gradeRatio,this.locale))+'</strong></div><div class="detail-stat"><span>Intentos</span><strong>'+integer(metric.attempts,this.locale)+'</strong></div><div class="detail-stat"><span>Tiempo activo</span><strong>'+esc(duration(metric.activeTimeMs,this.locale))+'</strong></div></div><div class="detail-section"><h3>Señales</h3><div class="signal-list">'+signals+'</div></div><div class="detail-section"><h3>Cursos</h3><div class="table-wrap"><table><thead><tr><th>Curso</th><th>Progreso</th><th>Nota</th><th>Intentos</th><th>Actividad</th></tr></thead><tbody>'+rows+'</tbody></table></div></div></aside>';
  }
  #courseDetail(id){
    const metric=this.#snapshot.courses.find((item)=>item.id===id)??computeAnalyticsSnapshot(filterAnalyticsDataset(this.#dataset,{courseId:id})).courses[0];
    const course=courseFor(this.#dataset,id);if(!metric||!course)return '';
    const filtered=computeAnalyticsSnapshot(filterAnalyticsDataset(this.#dataset,{courseId:id}));
    const rows=filtered.learners.slice(0,100).map((item)=>'<tr><td><button class="row-button" type="button" data-learner="'+attr(item.id)+'"><span class="avatar">'+esc(initials(item.learner.name))+'</span><span><strong>'+esc(item.learner.name)+'</strong><small>'+esc(item.learner.email||item.learner.group||item.id)+'</small></span></button></td><td>'+esc(pct(item.progress,this.locale))+'</td><td>'+esc(pct(item.gradeRatio,this.locale))+'</td><td>'+integer(item.attempts,this.locale)+'</td><td><span class="badge '+item.risk.level+'">'+esc(riskLabel(item.risk.level))+'</span></td></tr>').join('');
    return '<aside class="detail"><div class="detail-head"><div class="detail-title"><div class="avatar">'+esc(initials(course.title))+'</div><div><h2>'+esc(course.title)+'</h2><p>'+esc(course.code||course.id)+'</p></div></div><button class="close" type="button" data-close-detail aria-label="Cerrar">×</button></div><div class="detail-grid"><div class="detail-stat"><span>Alumnos</span><strong>'+integer(metric.enrolled,this.locale)+'</strong></div><div class="detail-stat"><span>Finalización</span><strong>'+esc(pct(metric.completionRate,this.locale))+'</strong></div><div class="detail-stat"><span>Nota media</span><strong>'+esc(pct(metric.averageGrade,this.locale))+'</strong></div><div class="detail-stat"><span>Tiempo activo</span><strong>'+esc(duration(metric.activeTimeMs,this.locale))+'</strong></div></div><div class="detail-section"><h3>Alumnos del curso</h3><div class="table-wrap"><table><thead><tr><th>Alumno</th><th>Progreso</th><th>Nota</th><th>Intentos</th><th>Señal</th></tr></thead><tbody>'+rows+'</tbody></table></div></div></aside>';
  }
  #content(){if(this.view==='learners')return this.#learners();if(this.view==='courses')return this.#courses();if(this.view==='grades')return this.#grades();if(this.view==='activity')return this.#activity();return this.#overview();}
  #render(){
    if(!this.#root)return;
    const updated=this.#dataset.generatedAt?dateText(this.#dataset.generatedAt,this.locale):'—';
    this.#root.innerHTML='<style>'+css+'</style><div class="shell '+(this.#loading?'loading':'')+'"><div class="topbar"><div class="brand"><span class="mark" aria-hidden="true"></span><span class="brand-copy"><strong>P2LRN Analytics</strong><span>Centro de analítica</span></span></div><div class="top-status"><span class="live-dot"></span><span>Datos del Host · actualizado '+esc(updated)+'</span></div></div><div class="toolbar"><div class="control"><label for="pa-search">Buscar alumno</label><input id="pa-search" data-query type="search" placeholder="Nombre, correo, grupo..." value="'+attr(this.#query)+'"></div><div class="control"><label for="pa-course">Curso</label><select id="pa-course" data-course-filter>'+this.#courseOptions()+'</select></div><div class="control"><label for="pa-risk">Señal</label><select id="pa-risk" data-risk-filter><option value="all" '+(this.#risk==='all'?'selected':'')+'>Todas</option><option value="none" '+(this.#risk==='none'?'selected':'')+'>Normal</option><option value="watch" '+(this.#risk==='watch'?'selected':'')+'>Revisar</option><option value="high" '+(this.#risk==='high'?'selected':'')+'>Atención alta</option></select></div><div class="control"><label for="pa-period">Actividad</label><select id="pa-period" data-period><option value="7" '+(this.period==='7'?'selected':'')+'>7 días</option><option value="14" '+(this.period==='14'?'selected':'')+'>14 días</option><option value="30" '+(this.period==='30'?'selected':'')+'>30 días</option><option value="90" '+(this.period==='90'?'selected':'')+'>90 días</option></select></div><div class="action-row"><button class="icon-button" type="button" data-refresh>Actualizar</button><button class="export-button" type="button" data-export="learners">Exportar</button></div></div><nav class="tabs" aria-label="Vistas de Analytics">'+this.#tabs()+'</nav>'+(this.#error?'<div class="error">'+esc(this.#error)+'</div>':'')+'<main class="main">'+this.#content()+this.#detail()+'</main><div class="footer-note"><span>Notas oficiales: únicamente registros autoritativos del Host.</span><span>P2LRN Analytics '+esc(P2LRN_ANALYTICS_VERSION)+'</span></div></div>';
  }
}

if(globalThis.customElements&&!customElements.get('p2lrn-analytics'))customElements.define('p2lrn-analytics',P2LRNAnalyticsElement);
export * from './model.js';
