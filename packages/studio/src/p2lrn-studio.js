async function playerApi(){
  const browserReady=globalThis.P2LRNReady ?? globalThis.P2LRNListo;
  if(browserReady)return browserReady;
  if(globalThis.P2LRN?.openPackageBytes)return globalThis.P2LRN;
  const mod=await import('@p2lrn/player');
  return {
    openPackageBytes:mod.openP2LRNPackageBytes,
    openPackageURL:mod.openP2LRNPackageURL,
  };
}
import {P2LRNStudioDocument} from './runtime/authoring-document.js';
import {exportP2LRNPackage} from './runtime/package-export.js';
import {createP2LRNStudioDocument} from './runtime/new-document.js';
import {renderQuestionnaireVisualEditor} from './runtime/questionnaire-editor.js';
import {renderStructuredVisualEditor} from './runtime/structured-editor.js';

export const P2LRN_STUDIO_VERSION='0.5.0-alpha.11';

const css=`
:host{display:block;min-height:640px;font-family:Inter,system-ui,sans-serif;color:#111827}
*{box-sizing:border-box}
.shell{border:1px solid #d9dee7;border-radius:10px;background:#f3f5f7;overflow:hidden}
.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px;border-bottom:1px solid #d9dee7;background:#fff}
button,input{font:inherit}
button{min-height:36px;border:1px solid #cfd5de;border-radius:7px;background:#fff;padding:0 12px;cursor:pointer}
button.primary{background:#111827;color:#fff;border-color:#111827}
.meta{margin-left:auto;font:600 12px ui-monospace,monospace;color:#667085}
.body{display:grid;grid-template-columns:250px minmax(0,1fr);min-height:580px}
nav{padding:8px;border-right:1px solid #d9dee7;background:#fff;overflow:auto}
nav button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:8px;border-radius:6px}
nav button[aria-current=true]{background:#eef2f7}
nav small{display:block;color:#667085;text-transform:uppercase;font:600 10px ui-monospace,monospace}
.tree-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 0 8px;margin-bottom:6px;border-bottom:1px solid #e5e7eb}.tree-actions button{border:1px solid #d9dee7;background:#f8fafc;text-align:center;padding:6px;font-size:11px}
.stage{padding:18px;min-width:0}
.sheet{max-width:980px;min-height:520px;margin:auto;background:#fff;border-radius:8px;padding:26px}
.title,.description,.surface{outline:0}
.title{font-size:34px;margin:0 0 8px}
.description{color:#667085;margin:0 0 18px;min-height:1.4em}
.surface{min-height:340px;border:1px dashed #98a2b3;border-radius:7px;padding:16px;line-height:1.6}
.notice{padding:14px;border:1px solid #d9dee7;border-radius:7px;background:#f8fafc;color:#667085}
.preview{display:block;min-height:520px;background:#fff;border-radius:8px}
.add-menu{position:relative}.add-menu>summary{list-style:none}.add-menu>summary::-webkit-details-marker{display:none}.add-pop{position:absolute;z-index:20;top:42px;left:0;width:430px;max-width:calc(100vw - 40px);padding:10px;border:1px solid #d9dee7;border-radius:8px;background:#fff;box-shadow:0 16px 40px rgba(15,23,42,.16)}.add-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.add-grid button{text-align:left;font-size:12px}.questionnaire-json{width:100%;min-height:320px;border:1px solid #cfd5de;border-radius:7px;padding:12px;font:12px/1.5 ui-monospace,monospace}.questionnaire-visual-editor{display:grid;gap:16px}.q-editor-head h2{margin:4px 0}.q-editor-head p{margin:0;color:#667085}.q-kicker{font:700 10px ui-monospace,monospace;text-transform:uppercase;color:#667085}.q-settings,.q-basic-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}.q-field{display:grid;gap:5px}.q-label{font:700 10px ui-monospace,monospace;color:#667085}.q-field input,.q-field select,.q-option-row input,.q-pair-row input,.q-class-row input,.q-class-row select,.q-add-row select{min-height:36px;border:1px solid #cfd5de;border-radius:6px;padding:6px 8px}.q-list{display:grid;gap:12px}.q-card{border:1px solid #d9dee7;border-radius:8px;padding:12px}.q-card-head{display:flex;justify-content:space-between;gap:8px}.q-card-actions,.q-add-row{display:flex;gap:6px}.q-type-editor{display:grid;gap:7px;margin-top:10px;padding-top:10px;border-top:1px solid #eef0f3}.q-option-row{display:grid;grid-template-columns:auto 1fr auto;gap:7px;align-items:center}.q-pair-row,.q-class-row{display:grid;grid-template-columns:1fr auto 1fr auto;gap:7px;align-items:center}.q-class-row{grid-template-columns:1fr 1fr auto}.q-mini{border:1px solid #cfd5de;border-radius:6px;background:#fff;padding:5px 8px}.q-danger{color:#b42318}.q-answer-list,.q-advanced textarea{width:100%;min-height:100px;border:1px solid #cfd5de;border-radius:6px;padding:8px}.q-advanced{border-top:1px dashed #d0d5dd;padding-top:8px}.q-advanced summary{cursor:pointer;font:700 11px ui-monospace,monospace;color:#667085}.sheet,.stage,.questionnaire-visual-editor,.q-list,.q-card,.q-settings,.q-basic-grid,.q-type-editor,.q-option-row,.q-pair-row,.q-class-row,.q-add-row{min-width:0;max-width:100%;box-sizing:border-box}.stage{overflow-x:hidden}.sheet{overflow:hidden}.q-settings,.q-basic-grid{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}.q-field,.q-field input,.q-field select,.q-option-row input,.q-pair-row input,.q-class-row input,.q-class-row select,.q-add-row select{min-width:0;max-width:100%;width:100%}.q-option-row{grid-template-columns:auto minmax(0,1fr) auto}.q-pair-row{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) auto}.q-class-row{grid-template-columns:minmax(0,1fr) minmax(110px,.7fr) auto}.q-fixed-type{display:flex;align-items:center;min-height:36px;border:1px solid #cfd5de;border-radius:6px;background:#f8fafc;padding:6px 8px;font-weight:700}.q-advanced textarea{max-width:100%;box-sizing:border-box}.q-settings{grid-template-columns:repeat(auto-fit,minmax(135px,1fr))!important}.q-basic-grid{grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,.72fr)!important}.q-field input[type=checkbox]{width:18px!important;max-width:18px!important;min-width:18px!important;height:18px;margin-top:7px}.q-field input:disabled,.q-field select:disabled{background:#f2f4f7;color:#98a2b3;cursor:not-allowed}.add-section{display:grid;gap:6px;padding:8px 0;border-top:1px solid #eef0f3}.add-section:first-child{border-top:0;padding-top:0}.add-section>strong{font:700 10px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em;color:#667085}.add-section>p{margin:0 0 3px;color:#667085;font-size:11px;line-height:1.35}.add-grid button[data-help]{display:grid;gap:2px;min-width:0}.add-grid button[data-help] small{color:#667085;font-size:10px}.add-help{position:fixed;z-index:1000;width:min(300px,calc(100vw - 24px));padding:9px 11px;border:1px solid #344054;border-radius:7px;background:#101828;color:#fff;box-shadow:0 10px 28px rgba(16,24,40,.24);font:600 11px/1.4 Arial,sans-serif;pointer-events:none;opacity:0;transform:translateY(4px);transition:opacity .12s ease,transform .12s ease}.add-help[data-visible=true]{opacity:1;transform:translateY(0)}.add-help::before{content:'Qué hace';display:block;margin-bottom:2px;color:#d0d5dd;font:700 9px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em}.warn{padding:8px 10px;background:#fff8e6;border-bottom:1px solid #e7cb84;font-size:12px;color:#614b16}
.q-field--prompt,.q-field--wide{grid-column:1/-1}.q-prompt-input,.q-blank-template-editor{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cfd5de;border-radius:6px;background:#fff;padding:10px 12px;font:500 13px/1.45 Arial,sans-serif;resize:vertical}.q-prompt-input{min-height:112px}.q-blank-template-editor{min-height:170px;font-family:ui-monospace,monospace;line-height:1.55}.q-help{display:block;margin-top:2px;color:#667085;font-size:11px;line-height:1.4}.q-blank-convert{justify-self:start;font-weight:700}.q-blank-row{grid-template-columns:auto minmax(0,1fr) auto}.q-field--mode{max-width:360px}

.component-preview{display:grid;gap:6px}.component-preview-card{border:1px solid #d0d5dd;border-radius:10px;padding:14px;background:#f8fafc}.component-preview-card strong{display:block;margin-bottom:6px}.component-preview-card p{margin:0}.timeline-item{cursor:grab}.composite-content{display:grid;gap:12px}.composite-content-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.composite-content-head h3{margin:0 0 4px}.composite-content-head p{margin:0;color:#667085}.composite-list{display:grid;gap:8px}.composite-row{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid #d9dee7;border-radius:8px;padding:10px}.composite-row-meta{display:grid;grid-template-columns:auto 1fr;column-gap:8px;align-items:center;min-width:0}.composite-row-meta small{grid-column:2;color:#667085}.drag-handle{grid-row:1/3;color:#98a2b3;cursor:grab}.studio-warning{padding:12px;border:1px solid #f0cf75;border-radius:8px;background:#fffbeb;color:#7a5d00}.studio-choice-dialog{border:0;border-radius:12px;padding:0;width:min(680px,calc(100vw - 30px));box-shadow:0 22px 60px rgba(15,23,42,.28)}.studio-choice-dialog::backdrop{background:rgba(15,23,42,.42)}.studio-choice-shell{padding:16px}.studio-choice-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.studio-choice-head h2{margin:0 0 4px}.studio-choice-head p{margin:0;color:#667085}.studio-choice-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}.studio-choice-card{display:grid;gap:4px;text-align:left;min-height:84px;padding:12px}.studio-choice-card small{color:#667085}.q-add-primary{font-weight:700}.q-tf-mode{max-width:420px}.q-tf-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:12px;border:1px solid #e1e5eb;border-radius:8px;background:#fafbfc}.q-tf-number{font:700 .72rem/1 ui-monospace,monospace;color:#667085}.q-tf-statement-input{width:100%;min-height:64px;box-sizing:border-box;border:1px solid #cfd5de;border-radius:6px;padding:8px 10px;font:500 .82rem/1.4 Arial,sans-serif;resize:vertical}.q-tf-answer{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.q-tf-answer-option{display:flex;align-items:center;gap:5px;padding:7px 9px;border:1px solid #d0d5dd;border-radius:7px;background:#fff;font-size:.78rem}.q-tf-answer-option input{margin:0}@media(max-width:900px){.q-tf-row{grid-template-columns:auto minmax(0,1fr)}.q-tf-answer,.q-tf-row>.q-danger{grid-column:2}}
[hidden]{display:none!important}
@media(max-width:760px){.body{grid-template-columns:1fr}nav{max-height:220px;border-right:0;border-bottom:1px solid #d9dee7}.meta{width:100%;margin-left:0}}
`;

function clone(value){return structuredClone(value);}
function sanitizeHtml(text){
  const doc=new DOMParser().parseFromString(String(text),'text/html');
  doc.querySelectorAll('script,iframe,object,embed,form,meta[http-equiv],base').forEach((node)=>node.remove());
  doc.querySelectorAll('*').forEach((node)=>{
    for(const attr of [...node.attributes]){
      const n=attr.name.toLowerCase(),v=attr.value.trim().toLowerCase();
      if(n.startsWith('on')||((n==='href'||n==='src')&&v.startsWith('javascript:')))node.removeAttribute(attr.name);
    }
  });
  return doc;
}
function filenameFromUrl(value){
  try{return new URL(value,location.href).pathname.split('/').filter(Boolean).at(-1)||'course.p2lrn';}
  catch{return'course.p2lrn';}
}

export class P2LRNStudioElement extends HTMLElement{
  static p2lrnStudioVersion=P2LRN_STUDIO_VERSION;
  static get observedAttributes(){return['src','save-endpoint','reader-endpoint','import-endpoint','course-path'];}
  #studio=null;#selected=null;#sourceUrl=null;#sourceObjectUrl=null;#previewObjectUrl=null;#mode='edit';#root=null;

  constructor(){
    super();
    this.attachShadow({mode:'open'});
    this.shadowRoot.innerHTML=`<style>${css}</style>
      <div class="shell">
        <div class="toolbar">
          <button type="button" data-create class="primary">Crear curso</button>
          <label><button type="button" data-open>Abrir .p2lrn</button><input data-file type="file" accept=".p2lrn,application/vnd.p2lrn+zip" hidden></label>
          <details class="add-menu" data-add-menu><summary><span role="button">Añadir contenido</span></summary><div class="add-pop">
            <div class="add-section"><strong>Contenido</strong><div class="add-grid">
              <button type="button" data-add-kind="lesson" data-help="Crea una lección editable para redactar y dar formato al contenido del curso.">Lección</button>
              <button type="button" data-add-kind="file" data-help="Añade una imagen, vídeo, audio u otro recurso local al curso.">Archivo / multimedia</button>
              <button type="button" data-add-kind="url" data-help="Enlaza un recurso web externo sin copiarlo dentro del paquete.">URL</button>
              <button type="button" data-add-kind="shared-resource" data-help="Referencia un recurso compartido por URL y SHA-256 para que el host pueda reutilizar una sola copia verificada.">Recurso compartido</button>
              <button type="button" data-add-kind="reader" data-help="Importa documentos como PDF, DOCX, PPTX, EPUB, TXT o Markdown mediante el servicio Reader de la plataforma.">Reader / documento</button>
              <button type="button" data-add-kind="external" data-help="Importa un paquete educativo existente como SCORM, H5P, cmi5, QTI, Common Cartridge o IMS Content Package.">Paquete educativo</button>
            </div></div>
            <div class="add-section"><strong>Evaluación</strong><div class="add-grid"><button type="button" data-add-kind="questionnaire" data-help="Crea una evaluación flexible que puede combinar los tipos de pregunta compatibles.">Cuestionario</button></div></div>
            <div class="add-section"><strong>Juegos</strong><div class="add-grid">
              <button type="button" data-add-kind="memory" data-help="Juego de memoria basado en parejas.">Memoria</button><button type="button" data-add-kind="matching" data-help="Relaciona elementos de dos columnas, como conceptos y definiciones.">Relacionar</button><button type="button" data-add-kind="ordering" data-help="Coloca pasos, fechas o elementos en el orden correcto.">Ordenar</button><button type="button" data-add-kind="classification" data-help="Asigna cada elemento a su categoría correcta.">Clasificar</button><button type="button" data-add-kind="true-false" data-help="Indica si una serie de afirmaciones es verdadera o falsa.">Verdadero / Falso</button><button type="button" data-add-kind="fill-blanks" data-help="Completa uno o más huecos con las respuestas aceptadas.">Completar huecos</button><button type="button" data-add-kind="word-search" data-help="Genera una sopa de letras a partir de respuestas textuales.">Sopa de letras</button><button type="button" data-add-kind="crossword" data-help="Genera un crucigrama a partir de pistas y respuestas textuales.">Crucigrama</button><button type="button" data-add-kind="rosco" data-help="Crea una secuencia tipo rosco con pistas y respuestas textuales.">Rosco</button><button type="button" data-add-kind="3d" data-help="Ordena objetos 3D. Puedes cambiar el tipo de pregunta a Relacionar o Clasificar.">Juego 3D (ordenar)</button>
              <button type="button" data-add-kind="3d-matching" data-help="Conecta parejas de objetos dentro del entorno 3D.">Relacionar 3D</button>
              <button type="button" data-add-kind="3d-classification" data-help="Clasifica objetos en zonas dentro del entorno 3D.">Clasificar 3D</button>
            </div></div>
            <div class="add-section"><strong>Colaboración</strong><p>Actividades ligeras conectadas por el host. Sin servidores ni credenciales dentro del paquete.</p><div class="add-grid">
              <button type="button" data-add-kind="live-poll" data-help="Votación sincronizada entre participantes con fallback individual.">Votación en directo</button>
              <button type="button" data-add-kind="shared-board" data-help="Pizarra de notas compartidas mediante la capacidad collaboration.room.">Pizarra compartida</button>
              <button type="button" data-add-kind="peer-review" data-help="Aportaciones y comentarios entre pares sin acoplar el curso al transporte.">Revisión entre pares</button>
            </div></div>
            <div class="add-section"><strong>Estructura avanzada</strong><p>Añade componentes nativos o agrupa varias actividades en un mismo recorrido. Usa + Unidad para las secciones normales.</p><div class="add-grid">
              <button type="button" data-add-kind="component" data-help="Añade avisos, líneas temporales y otros componentes nativos registrados en P2LRN."><span>Componente</span><small>Avisos, líneas de tiempo y otros bloques nativos</small></button>
              <button type="button" data-add-kind="composite" data-help="Crea un grupo que contiene actividades reales y define cómo se recorren y completan."><span>Grupo de actividades</span><small>Agrupa varias actividades en un mismo recorrido</small></button>
            </div></div>
          </div></details><div class="add-help" data-add-help hidden></div><input data-resource-file type="file" hidden><input data-reader-file type="file" accept=".pdf,.docx,.pptx,.txt,.md,.markdown,.html,.htm,.rtf,.tex,.xml,.yaml,.yml,.odt,.epub" hidden><input data-external-file type="file" accept=".zip,.h5p,application/zip,application/vnd.h5p" hidden>
          <button type="button" data-edit class="primary">Editar</button>
          <button type="button" data-preview>Vista alumno</button>
          <button type="button" data-download>Descargar .p2lrn</button>
          <button type="button" data-save hidden>Guardar curso</button>
          <span class="meta" data-meta>Sin curso</span>
        </div>
        <div class="warn" data-warn hidden>Los cambios permanecen en memoria hasta que descargues o guardes el curso.</div>
        <div class="body" data-body hidden>
          <nav data-tree></nav>
          <main class="stage"><div data-stage></div></main>
        </div>
      </div>`;
  }
  connectedCallback(){
    const q=(s)=>this.shadowRoot.querySelector(s);
    q('[data-create]').addEventListener('click',()=>this.createCourse().catch((e)=>this.#status(e.message)));
    q('[data-open]').addEventListener('click',()=>q('[data-file]').click());
    q('[data-file]').addEventListener('change',()=>{const f=q('[data-file]').files?.[0];if(f)this.openFile(f);});
    q('[data-add-menu]').querySelectorAll('[data-add-kind]').forEach((button)=>button.addEventListener('click',()=>this.addContent(button.dataset.addKind).catch((e)=>this.#status(e.message))));
    const help=q('[data-add-help]');
    const hideHelp=()=>{if(!help)return;help.dataset.visible='false';help.hidden=true;};
    const showHelp=(button)=>{if(!help||!button?.dataset.help)return;help.textContent=button.dataset.help;help.hidden=false;help.dataset.visible='true';requestAnimationFrame(()=>{const rect=button.getBoundingClientRect(),tip=help.getBoundingClientRect(),pad=10,gap=8;let left=rect.left+rect.width/2-tip.width/2;left=Math.max(pad,Math.min(left,window.innerWidth-tip.width-pad));let top=rect.bottom+gap;if(top+tip.height>window.innerHeight-pad)top=rect.top-tip.height-gap;help.style.left=Math.round(Math.max(pad,left))+'px';help.style.top=Math.round(Math.max(pad,top))+'px';});};
    q('[data-add-menu]').querySelectorAll('[data-add-kind][data-help]').forEach((button)=>{button.addEventListener('pointerenter',()=>showHelp(button));button.addEventListener('pointerleave',hideHelp);button.addEventListener('focus',()=>showHelp(button));button.addEventListener('blur',hideHelp);});
    q('[data-add-menu]').addEventListener('toggle',()=>{if(!q('[data-add-menu]').open)hideHelp();});
    q('[data-resource-file]').addEventListener('change',()=>{const f=q('[data-resource-file]').files?.[0];if(f)this.addResourceFile(f).catch((e)=>this.#status(e.message));q('[data-resource-file]').value='';});
    q('[data-reader-file]').addEventListener('change',()=>{const f=q('[data-reader-file]').files?.[0];if(f)this.importDocument(f).catch((e)=>this.#status(e.message));q('[data-reader-file]').value='';});
    q('[data-external-file]').addEventListener('change',()=>{const f=q('[data-external-file]').files?.[0];if(f)this.importExternalPackage(f).catch((e)=>this.#status(e.message));q('[data-external-file]').value='';});
    q('[data-edit]').addEventListener('click',()=>this.setMode('edit'));
    q('[data-preview]').addEventListener('click',()=>this.setMode('preview'));
    q('[data-download]').addEventListener('click',()=>this.download());
    q('[data-save]').addEventListener('click',()=>this.saveCourse());
    this.#syncSaveButton();
    if(this.src&&!this.#studio)this.openUrl(this.src).catch((e)=>this.#status(e.message));
  }
  disconnectedCallback(){this.#revoke();}
  attributeChangedCallback(name,oldValue,newValue){
    if(oldValue===newValue)return;
    if(name==='save-endpoint')this.#syncSaveButton();
    if(name==='src'&&this.isConnected&&newValue)this.openUrl(newValue).catch((e)=>this.#status(e.message));
  }
  get src(){return this.getAttribute('src')||''}
  set src(v){v?this.setAttribute('src',v):this.removeAttribute('src')}
  get saveEndpoint(){return this.getAttribute('save-endpoint')||''}
  get readerEndpoint(){return this.getAttribute('reader-endpoint')||''}
  get importEndpoint(){return this.getAttribute('import-endpoint')||''}
  set importEndpoint(v){v?this.setAttribute('import-endpoint',v):this.removeAttribute('import-endpoint')}
  set readerEndpoint(v){v?this.setAttribute('reader-endpoint',v):this.removeAttribute('reader-endpoint')}
  set saveEndpoint(v){v?this.setAttribute('save-endpoint',v):this.removeAttribute('save-endpoint')}
  get coursePath(){return (this.getAttribute('course-path')||'course').replace(/^\/+|\/+$/g,'')||'course'}
  set coursePath(v){this.setAttribute('course-path',v||'course')}

  async createCourse(options={}){
    this.#revoke();
    this.#studio=createP2LRNStudioDocument(options);
    this.#sourceUrl=null;this.#selected=this.#studio.rootId;
    this.shadowRoot.querySelector('[data-body]').hidden=false;
    this.#renderTree();await this.#renderEditor();this.#updateState();
    this.dispatchEvent(new CustomEvent('p2lrn-studio-create',{detail:{name:this.#studio.sourceName,packageId:this.#studio.manifest.packageId},bubbles:true,composed:true}));
    return this.#studio;
  }
  async openFile(file){
    this.#revoke();
    const bytes=await file.arrayBuffer();
    const pkg=await (await playerApi()).openPackageBytes(bytes);
    this.#sourceObjectUrl=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.p2lrn+zip'}));
    await this.#open(pkg,{name:file.name||'course.p2lrn',url:this.#sourceObjectUrl});
  }
  async openUrl(url){
    this.#revoke();
    const resolved=new URL(url,document.baseURI).href;
    const pkg=await (await playerApi()).openPackageURL(resolved);
    await this.#open(pkg,{name:filenameFromUrl(resolved),url:resolved});
  }
  async #open(pkg,{name,url}){
    this.#studio=new P2LRNStudioDocument(pkg,{sourceName:name,sourceUrl:url});
    this.#sourceUrl=url;this.#selected=this.#studio.rootId;
    this.shadowRoot.querySelector('[data-body]').hidden=false;
    this.#renderTree();await this.#renderEditor();this.#updateState();
    this.dispatchEvent(new CustomEvent('p2lrn-studio-open',{detail:{name,packageId:pkg.manifest.packageId},bubbles:true,composed:true}));
  }
  #renderTree(){
    const nav=this.shadowRoot.querySelector('[data-tree]');nav.replaceChildren();
    const actions=document.createElement('div');actions.className='tree-actions';
    const unit=document.createElement('button');unit.type='button';unit.textContent='+ Unidad';unit.onclick=()=>this.addUnit().catch((error)=>this.#status(error.message));
    const lesson=document.createElement('button');lesson.type='button';lesson.textContent='+ Lección';lesson.onclick=()=>this.addLesson().catch((error)=>this.#status(error.message));
    actions.append(unit,lesson);nav.append(actions);
    const seen=new Set();
    const walk=(entity,depth=0)=>{
      if(!entity||seen.has(entity.id))return;seen.add(entity.id);
      const b=document.createElement('button');b.type='button';b.style.paddingLeft=(8+depth*12)+'px';
      b.innerHTML='<small></small><span></span>';b.querySelector('small').textContent=entity.type;b.querySelector('span').textContent=this.#studio.title(entity.id);
      if(entity.id===this.#selected)b.setAttribute('aria-current','true');
      b.onclick=()=>{this.#selected=entity.id;this.#renderTree();this.#renderEditor();};nav.append(b);
      (entity.children||[]).forEach((id)=>walk(this.#studio.entity(id),depth+1));
    };
    walk(this.#studio.entity(this.#studio.rootId));
  }
  #insertionParent(){
    const current=this.#studio?.entity(this.#selected);if(!current)return this.#studio?.rootId??null;
    if(['course','unit'].includes(current.type)||this.#studio.isCompositeActivity(current.id))return current.id;
    return this.#studio.parentId(current.id)??this.#studio.rootId;
  }
  #showChoice(title,subtitle,items,onChoose){
    const dialog=document.createElement('dialog');dialog.className='studio-choice-dialog';
    const shell=document.createElement('div');shell.className='studio-choice-shell';
    const head=document.createElement('div');head.className='studio-choice-head';
    const copy=document.createElement('div');const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=subtitle;copy.append(h,p);
    const close=document.createElement('button');close.type='button';close.textContent='Cerrar';close.onclick=()=>dialog.close();head.append(copy,close);shell.append(head);
    const grid=document.createElement('div');grid.className='studio-choice-grid';
    for(const item of items){const b=document.createElement('button');b.type='button';b.className='studio-choice-card';const strong=document.createElement('strong');strong.textContent=item.label;const small=document.createElement('small');small.textContent=item.description||'';b.append(strong,small);b.onclick=()=>Promise.resolve(onChoose(item)).then(()=>dialog.close()).catch((error)=>this.#status(error.message));grid.append(b);}
    shell.append(grid);dialog.append(shell);this.shadowRoot.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
  }
  #chooseComponent(){
    const items=this.#studio.componentCatalog().map((entry)=>({id:entry.id,label:entry.authoring.label,description:entry.authoring.description}));
    this.#showChoice('Añadir componente','Elige el bloque nativo que quieres crear.',items,async(item)=>this.#selectCreated(this.#studio.addNativeComponent(this.#insertionParent(),{componentId:item.id,language:'es'})));
  }
  async addUnit(options={}){
    if(!this.#studio)throw new Error('No hay ningún curso P2LRN abierto.');
    const parent=this.#insertionParent();
    if(this.#studio.isCompositeActivity(parent))throw new Error('Un compuesto agrupa actividades, no unidades. Selecciona el curso o una unidad.');
    const created=this.#studio.addUnit(parent,options);this.#selected=created.id;
    this.#renderTree();await this.#renderEditor();this.#updateState();return created;
  }
  async addLesson(options={}){
    if(!this.#studio)throw new Error('No hay ningún curso P2LRN abierto.');
    const created=this.#studio.addLesson(this.#insertionParent(),options);this.#selected=created.id;
    this.#renderTree();await this.#renderEditor();this.#updateState();return created;
  }
  async #selectCreated(entity){this.#selected=entity.id;this.#renderTree();await this.#renderEditor();this.#updateState();const menu=this.shadowRoot.querySelector('[data-add-menu]');if(menu)menu.open=false;return entity;}
  async addContent(kind){
    if(!this.#studio)throw new Error('Crea o abre un curso primero.');
    if(kind==='lesson')return this.#selectCreated(this.#studio.addLesson(this.#insertionParent(),{title:'Nueva lección',language:'es'}));
    if(kind==='unit')return this.addUnit({title:'Nueva unidad',language:'es'});
    if(kind==='file'){this.shadowRoot.querySelector('[data-resource-file]').click();return null;}
    if(kind==='reader'){this.shadowRoot.querySelector('[data-reader-file]').click();return null;}
    if(kind==='external'){this.shadowRoot.querySelector('[data-external-file]').click();return null;}
    if(kind==='url'){const url=prompt('URL del recurso');if(!url)return null;return this.#selectCreated(this.#studio.addRemoteResource(this.#insertionParent(),{title:'Recurso web',url}));}
    if(kind==='shared-resource'){
      const url=prompt('URL lógica del recurso compartido');if(!url)return null;
      const digest=prompt('SHA-256 esperado (sha256:...)');if(!digest)return null;
      const mediaType=prompt('Tipo MIME','video/mp4')||'application/octet-stream';
      const title=prompt('Título','Recurso compartido')||'Recurso compartido';
      return this.#selectCreated(this.#studio.addRemoteResource(this.#insertionParent(),{title,url,mediaType,expectedDigest:digest}));
    }
    if(kind==='questionnaire')return this.#selectCreated(this.#studio.addQuestionnaire(this.#insertionParent(),{title:'Cuestionario',language:'es'}));
    if(kind==='live-poll')return this.#selectCreated(this.#studio.addCollaborationActivity(this.#insertionParent(),{mode:'poll',language:'es'}));
    if(kind==='shared-board')return this.#selectCreated(this.#studio.addCollaborationActivity(this.#insertionParent(),{mode:'board',language:'es'}));
    if(kind==='peer-review')return this.#selectCreated(this.#studio.addCollaborationActivity(this.#insertionParent(),{mode:'peer-review',language:'es'}));
    if(['memory','matching','ordering','classification','true-false','fill-blanks','word-search','crossword','rosco','3d','3d-matching','3d-classification'].includes(kind)){const titles={memory:'Memoria',matching:'Relacionar',ordering:'Ordenar',classification:'Clasificar','true-false':'Verdadero / Falso','fill-blanks':'Completar huecos','word-search':'Sopa de letras',crossword:'Crucigrama',rosco:'Rosco','3d':'Juego 3D','3d-matching':'Relacionar 3D','3d-classification':'Clasificar 3D'};return this.#selectCreated(this.#studio.addGame(this.#insertionParent(),{kind,title:titles[kind]??'Juego',language:'es'}));}
    if(kind==='component'){this.#chooseComponent();return null;}
    if(kind==='composite')return this.#selectCreated(this.#studio.addComposite(this.#insertionParent(),{title:'Grupo de actividades',language:'es',mode:'free',completion:'all'}));
    return null;
  }
  async addResourceFile(file){const bytes=new Uint8Array(await file.arrayBuffer());const entity=this.#studio.addEmbeddedResource(this.#insertionParent(),{title:file.name.replace(/\.[^.]+$/,''),filename:file.name,mediaType:file.type||'application/octet-stream',bytes});return this.#selectCreated(entity);}
  async importExternalPackage(file){
    if(!this.importEndpoint)throw new Error('import-endpoint is required for educational package import.');
    const response=await fetch(new URL(this.importEndpoint,document.baseURI).href,{method:'POST',headers:{'Content-Type':file.type||'application/zip','X-P2LRN-Filename':encodeURIComponent(file.name)},body:await file.arrayBuffer()});
    if(!response.ok){let detail='';try{detail=(await response.json())?.error||''}catch{}throw new Error('Studio external package import failed'+(detail?': '+detail:' (HTTP '+response.status+')'));}
    const bytes=await response.arrayBuffer();const pkg=await (await playerApi()).openPackageBytes(bytes);const root=(pkg.manifest.entrypoints.find((x)=>x.type==='course')??pkg.manifest.entrypoints[0])?.id;const title=pkg.entities.get(root)?.title?.en??pkg.entities.get(root)?.title?.es??file.name;const wrapper=await this.#studio.importPackage(pkg,this.#insertionParent(),{title,language:'en'});return this.#selectCreated(wrapper);
  }
  async importDocument(file){
    if(!this.readerEndpoint)throw new Error('reader-endpoint is required for Reader document import.');
    const response=await fetch(new URL(this.readerEndpoint,document.baseURI).href,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','X-P2LRN-Filename':encodeURIComponent(file.name)},body:await file.arrayBuffer()});
    if(!response.ok)throw new Error('Studio Reader failed: HTTP '+response.status);const result=await response.json();const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');const html='<!doctype html><html><head><meta charset="utf-8"></head><body>'+result.blocks.map((b)=>b.type==='TITLE'?'<h2>'+esc(b.text)+'</h2>':b.type==='LIST'?'<li>'+esc(b.text)+'</li>':'<p>'+esc(b.text)+'</p>').join('')+'</body></html>';const title=result.metadata?.detectedTitle||file.name.replace(/\.[^.]+$/,'');return this.#selectCreated(this.#studio.addEmbeddedResource(this.#insertionParent(),{title,filename:'reader.html',mediaType:'text/html',bytes:new TextEncoder().encode(html)}));
  }
  async #renderEditor(){
    const stage=this.shadowRoot.querySelector('[data-stage]');stage.replaceChildren();
    const entity=this.#studio?.entity(this.#selected);if(!entity)return;
    if(this.#mode==='preview'){await this.#renderPreview();return;}
    const sheet=document.createElement('article');sheet.className='sheet';
    const title=document.createElement('h1');title.className='title';title.textContent=this.#studio.title(entity.id);title.contentEditable='true';title.setAttribute('role','textbox');title.setAttribute('aria-label','Título');title.setAttribute('aria-multiline','true');
    const desc=document.createElement('p');desc.className='description';desc.textContent=entity.description?.es??entity.description?.en??'';desc.contentEditable='true';desc.setAttribute('role','textbox');desc.setAttribute('aria-label','Descripción');desc.setAttribute('aria-multiline','true');
    title.oninput=()=>{this.#studio.setTitle(entity.id,title.textContent||'');this.#renderTree();this.#updateState();};
    desc.oninput=()=>{this.#studio.setDescription(entity.id,desc.textContent||'');this.#updateState();};
    sheet.append(title,desc);
    if(entity.type==='activity'){
      const questionnaire=await this.#studio.readQuestionnaire(entity.id);
      if(questionnaire){
        const renderer=entity.extensions?.['https://p2lrn.org/ext/renderer-preference/1']?.preferred??'https://p2lrn.org/renderer/questionnaire/standard';
        renderQuestionnaireVisualEditor(sheet,{model:this.#studio,activityId:entity.id,payload:questionnaire.payload,renderer,onChange:()=>this.#updateState(),onStatus:(message)=>this.#status(message)});
        stage.append(sheet);return;
      }
      const structured=await this.#studio.readStructuredJson(entity.id);
      if(structured){
        renderStructuredVisualEditor(sheet,{model:this.#studio,activityId:entity.id,mediaType:structured.mediaType,payload:structured.payload,onChange:()=>this.#updateState(),onStructureChange:()=>{this.#renderTree();this.#updateState();},onStatus:(message)=>this.#status(message),onSelectActivity:(id)=>{this.#selected=id;this.#renderTree();void this.#renderEditor();},onCreateChild:(id)=>{this.#selected=id;this.#renderTree();const menu=this.shadowRoot.querySelector('[data-add-menu]');if(menu)menu.open=true;}});
        stage.append(sheet);return;
      }
      const editable=await this.#studio.readEditableText(entity.id);
      if(editable){
        const surface=document.createElement(editable.mediaType==='text/plain'?'pre':'article');surface.className='surface';surface.contentEditable='true';
        if(editable.mediaType==='text/plain')surface.textContent=editable.text;
        else surface.innerHTML=sanitizeHtml(editable.text).body.innerHTML;
        surface.oninput=()=>{
          if(editable.mediaType==='text/plain')this.#studio.setPayloadText(editable.path,surface.textContent||'');
          else {const doc=sanitizeHtml('<!doctype html><html><body>'+surface.innerHTML+'</body></html>');this.#studio.setPayloadText(editable.path,'<!doctype html>\n'+doc.documentElement.outerHTML);}
          this.#updateState();
        };
        sheet.append(surface);
      }else{
        const n=document.createElement('div');n.className='notice';n.textContent='Esta actividad se previsualiza con el Player y su paquete interno permanece encapsulado.';sheet.append(n);
      }
    }
    stage.append(sheet);
  }
  async #renderPreview(){
    const stage=this.shadowRoot.querySelector('[data-stage]');stage.replaceChildren();
    const exported=await this.exportPackage();
    if(this.#previewObjectUrl)URL.revokeObjectURL(this.#previewObjectUrl);
    this.#previewObjectUrl=URL.createObjectURL(new Blob([exported.bytes],{type:'application/vnd.p2lrn+zip'}));
    const player=document.createElement('p2lrn-player');player.className='preview';player.setAttribute('src',this.#previewObjectUrl);player.setAttribute('node',this.#selected);stage.append(player);
  }
  async setMode(mode){
    this.#mode=mode==='preview'?'preview':'edit';
    this.shadowRoot.querySelector('[data-edit]').classList.toggle('primary',this.#mode==='edit');
    this.shadowRoot.querySelector('[data-preview]').classList.toggle('primary',this.#mode==='preview');
    if(this.#studio)await this.#renderEditor();
  }
  async exportPackage(){
    if(!this.#studio)throw new Error('No hay ningún curso P2LRN abierto.');
    return exportP2LRNPackage(this.#studio);
  }
  async download(){
    const exported=await this.exportPackage();
    const url=URL.createObjectURL(new Blob([exported.bytes],{type:'application/vnd.p2lrn+zip'}));
    const a=document.createElement('a');a.href=url;a.download=exported.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    this.dispatchEvent(new CustomEvent('p2lrn-studio-download',{detail:{filename:exported.filename},bubbles:true,composed:true}));
  }
  async saveCourse(){
    if(!this.saveEndpoint)throw new Error('save-endpoint is required to save to the host server.');
    const exported=await this.exportPackage();
    const endpoint=new URL(this.saveEndpoint,document.baseURI).href;
    const response=await fetch(endpoint,{method:'POST',headers:{
      'Content-Type':'application/vnd.p2lrn+zip',
      'X-P2LRN-Path':this.coursePath,
      'X-P2LRN-Filename':exported.filename,
    },body:exported.bytes});
    if(!response.ok)throw new Error('Studio save failed: HTTP '+response.status);
    let result=null;try{result=await response.json();}catch{}
    this.dispatchEvent(new CustomEvent('p2lrn-studio-save',{detail:{filename:exported.filename,coursePath:this.coursePath,result},bubbles:true,composed:true}));
    return result;
  }
  #status(text){this.shadowRoot.querySelector('[data-meta]').textContent=text}
  #updateState(){
    const changes=this.#studio?.changeCount??0;this.#status(changes?changes+' cambio sin guardar'+(changes===1?'':'s'):'Listo');
    this.shadowRoot.querySelector('[data-warn]').hidden=!changes;
  }
  #syncSaveButton(){if(this.shadowRoot)this.shadowRoot.querySelector('[data-save]').hidden=!this.saveEndpoint}
  #revoke(){if(this.#sourceObjectUrl)URL.revokeObjectURL(this.#sourceObjectUrl);if(this.#previewObjectUrl)URL.revokeObjectURL(this.#previewObjectUrl);this.#sourceObjectUrl=null;this.#previewObjectUrl=null}
}

if(globalThis.customElements&&!customElements.get('p2lrn-studio'))customElements.define('p2lrn-studio',P2LRNStudioElement);
