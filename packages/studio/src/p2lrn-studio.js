async function playerApi(){
  const browserReady=globalThis.P2LRNReady ?? globalThis.P2LRNListo;
  if(browserReady)return browserReady;
  if(globalThis.P2LRN?.openPackageBytes)return globalThis.P2LRN;
  const mod=await import('@p2lrn/player');
  return {
    openPackageBytes:mod.openP2LRNPackageBytes,
    openPackageURL:mod.openP2LRNPackageURL,
    create3DAuthoringScene:mod.create3DAuthoringScene,
  };
}
import {COURSE_RIGHTS_FIELDS,COURSE_RIGHTS_LABELS} from './course-rights.js';
import {P2LRNStudioDocument} from './runtime/authoring-document.js';
import {exportP2LRNPackage} from './runtime/package-export.js';
import {createP2LRNStudioDocument} from './runtime/new-document.js';
import {renderQuestionnaireVisualEditor} from './runtime/questionnaire-editor.js';
import {renderStructuredVisualEditor} from './runtime/structured-editor.js';
import {mountLessonImageEditor} from './runtime/lesson-images.js';
import {mountStudioCommandBar,applyUnifiedStudioWorkspace,collapseStudioLessonProperties} from './runtime/command-bar.js';
import {saveLatestDraft,loadLatestDraft,clearLatestDraft} from './runtime/browser-drafts.js';
import {exportOfflineAssignmentBundle, parseOfflineAssignmentResult} from './runtime/offline-assignment.js';
import {latestManualReviewAnswers,createP2LRNManualReviewReport} from './runtime/manual-grading.js';

export const P2LRN_STUDIO_VERSION='0.5.0-alpha.13';

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
.title,.description,.surface{outline:2px solid transparent;outline-offset:3px}
.title-input:focus,.title-input:focus-visible,.description:focus-visible,.surface:focus-visible{outline:3px solid #0f766e;outline-offset:3px;background:#f0fdfa}
.title{font-size:34px;margin:0 0 8px}
.title-input{display:block;min-height:1.2em;overflow-wrap:anywhere}
.description{color:#667085;margin:0 0 18px;min-height:1.4em}
.surface{min-height:340px;border:1px dashed #98a2b3;border-radius:7px;padding:16px;line-height:1.6}
.notice{padding:14px;border:1px solid #d9dee7;border-radius:7px;background:#f8fafc;color:#667085}
.preview{display:block;min-height:520px;background:#fff;border-radius:8px}
.add-menu{position:relative}.add-menu>summary{list-style:none}.add-menu>summary::-webkit-details-marker{display:none}.add-pop{position:absolute;z-index:20;top:42px;left:0;width:430px;max-width:calc(100vw - 40px);padding:10px;border:1px solid #d9dee7;border-radius:8px;background:#fff;box-shadow:0 16px 40px rgba(15,23,42,.16)}.add-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.add-grid button{text-align:left;font-size:12px}.questionnaire-json{width:100%;min-height:320px;border:1px solid #cfd5de;border-radius:7px;padding:12px;font:12px/1.5 ui-monospace,monospace}.questionnaire-visual-editor{display:grid;gap:16px}.q-editor-head h2{margin:4px 0}.q-editor-head p{margin:0;color:#667085}.q-kicker{font:700 10px ui-monospace,monospace;text-transform:uppercase;color:#667085}.q-settings,.q-basic-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}.q-field{display:grid;gap:5px}.q-label{font:700 10px ui-monospace,monospace;color:#667085}.q-field input,.q-field select,.q-option-row input,.q-pair-row input,.q-class-row input,.q-class-row select,.q-add-row select{min-height:36px;border:1px solid #cfd5de;border-radius:6px;padding:6px 8px}.q-list{display:grid;gap:12px}.q-card{border:1px solid #d9dee7;border-radius:8px;padding:12px}.q-card-head{display:flex;justify-content:space-between;gap:8px}.q-card-actions,.q-add-row{display:flex;gap:6px}.q-type-editor{display:grid;gap:7px;margin-top:10px;padding-top:10px;border-top:1px solid #eef0f3}.q-option-row{display:grid;grid-template-columns:auto 1fr auto;gap:7px;align-items:center}.q-pair-row,.q-class-row{display:grid;grid-template-columns:1fr auto 1fr auto;gap:7px;align-items:center}.q-class-row{grid-template-columns:1fr 1fr auto}.q-mini{border:1px solid #cfd5de;border-radius:6px;background:#fff;padding:5px 8px}.q-danger{color:#b42318}.q-answer-list,.q-advanced textarea{width:100%;min-height:100px;border:1px solid #cfd5de;border-radius:6px;padding:8px}.q-advanced{border-top:1px dashed #d0d5dd;padding-top:8px}.q-advanced summary{cursor:pointer;font:700 11px ui-monospace,monospace;color:#667085}.sheet,.stage,.questionnaire-visual-editor,.q-list,.q-card,.q-settings,.q-basic-grid,.q-type-editor,.q-option-row,.q-pair-row,.q-class-row,.q-add-row{min-width:0;max-width:100%;box-sizing:border-box}.stage{overflow-x:hidden}.sheet{overflow:hidden}.q-settings,.q-basic-grid{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}.q-field,.q-field input,.q-field select,.q-option-row input,.q-pair-row input,.q-class-row input,.q-class-row select,.q-add-row select{min-width:0;max-width:100%;width:100%}.q-option-row{grid-template-columns:auto minmax(0,1fr) auto}.q-pair-row{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) auto}.q-class-row{grid-template-columns:minmax(0,1fr) minmax(110px,.7fr) auto}.q-fixed-type{display:flex;align-items:center;min-height:36px;border:1px solid #cfd5de;border-radius:6px;background:#f8fafc;padding:6px 8px;font-weight:700}.q-advanced textarea{max-width:100%;box-sizing:border-box}.q-settings{grid-template-columns:repeat(auto-fit,minmax(135px,1fr))!important}.q-basic-grid{grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,.72fr)!important}.q-field input[type=checkbox]{width:18px!important;max-width:18px!important;min-width:18px!important;height:18px;margin-top:7px}.q-field input:disabled,.q-field select:disabled{background:#f2f4f7;color:#98a2b3;cursor:not-allowed}.add-section{display:grid;gap:6px;padding:8px 0;border-top:1px solid #eef0f3}.add-section:first-child{border-top:0;padding-top:0}.add-section>strong{font:700 10px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em;color:#667085}.add-section>p{margin:0 0 3px;color:#667085;font-size:11px;line-height:1.35}.add-grid button[data-help]{display:grid;gap:2px;min-width:0}.add-grid button[data-help] small{color:#667085;font-size:10px}.add-help{position:fixed;z-index:1000;width:min(300px,calc(100vw - 24px));padding:9px 11px;border:1px solid #344054;border-radius:7px;background:#101828;color:#fff;box-shadow:0 10px 28px rgba(16,24,40,.24);font:600 11px/1.4 Arial,sans-serif;pointer-events:none;opacity:0;transform:translateY(4px);transition:opacity .12s ease,transform .12s ease}.add-help[data-visible=true]{opacity:1;transform:translateY(0)}.add-help::before{content:'Qué hace';display:block;margin-bottom:2px;color:#d0d5dd;font:700 9px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em}.warn{padding:8px 10px;background:#fff8e6;border-bottom:1px solid #e7cb84;font-size:12px;color:#614b16}
.q-field--prompt,.q-field--wide{grid-column:1/-1}.q-prompt-input,.q-blank-template-editor{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cfd5de;border-radius:6px;background:#fff;padding:10px 12px;font:500 13px/1.45 Arial,sans-serif;resize:vertical}.q-prompt-input{min-height:112px}.q-blank-template-editor{min-height:170px;font-family:ui-monospace,monospace;line-height:1.55}.q-help{display:block;margin-top:2px;color:#667085;font-size:11px;line-height:1.4}.q-blank-convert{justify-self:start;font-weight:700}.q-blank-row{grid-template-columns:auto minmax(0,1fr) auto}.q-field--mode{max-width:360px}

.component-preview{display:grid;gap:6px}.component-preview-card{border:1px solid #d0d5dd;border-radius:10px;padding:14px;background:#f8fafc}.component-preview-card strong{display:block;margin-bottom:6px}.component-preview-card p{margin:0}.timeline-item{cursor:grab}.composite-content{display:grid;gap:12px}.composite-content-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.composite-content-head h3{margin:0 0 4px}.composite-content-head p{margin:0;color:#667085}.composite-list{display:grid;gap:8px}.composite-row{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid #d9dee7;border-radius:8px;padding:10px}.composite-row-meta{display:grid;grid-template-columns:auto 1fr;column-gap:8px;align-items:center;min-width:0}.composite-row-meta small{grid-column:2;color:#667085}.drag-handle{grid-row:1/3;color:#98a2b3;cursor:grab}.studio-warning{padding:12px;border:1px solid #f0cf75;border-radius:8px;background:#fffbeb;color:#7a5d00}.studio-choice-dialog{border:0;border-radius:12px;padding:0;width:min(680px,calc(100vw - 30px));box-shadow:0 22px 60px rgba(15,23,42,.28)}.studio-choice-dialog::backdrop{background:rgba(15,23,42,.42)}.studio-choice-shell{padding:16px}.studio-choice-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.studio-choice-head h2{margin:0 0 4px}.studio-choice-head p{margin:0;color:#667085}.studio-choice-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}.studio-choice-card{display:grid;gap:4px;text-align:left;min-height:84px;padding:12px}.studio-choice-card small{color:#667085}.q-add-primary{font-weight:700}.q-tf-mode{max-width:420px}.q-tf-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:12px;border:1px solid #e1e5eb;border-radius:8px;background:#fafbfc}.q-tf-number{font:700 .72rem/1 ui-monospace,monospace;color:#667085}.q-tf-statement-input{width:100%;min-height:64px;box-sizing:border-box;border:1px solid #cfd5de;border-radius:6px;padding:8px 10px;font:500 .82rem/1.4 Arial,sans-serif;resize:vertical}.q-tf-answer{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.q-tf-answer-option{display:flex;align-items:center;gap:5px;padding:7px 9px;border:1px solid #d0d5dd;border-radius:7px;background:#fff;font-size:.78rem}.q-tf-answer-option input{margin:0}@media(max-width:900px){.q-tf-row{grid-template-columns:auto minmax(0,1fr)}.q-tf-answer,.q-tf-row>.q-danger{grid-column:2}}
.rights-panel{margin:24px 0 0;padding:18px;border:1px solid #d9dee7;border-radius:9px;background:#f8fafc}.rights-panel h2{font-size:16px;margin:0 0 14px}.rights-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.rights-field{display:flex;flex-direction:column;gap:5px;min-width:0;color:#475467;font-size:12px;font-weight:600}.rights-field input,.rights-field textarea{width:100%;min-width:0;min-height:37px;padding:8px 10px;border:1px solid #cfd5de;border-radius:7px;background:#fff;color:#111827;font:inherit;font-size:13px}.rights-field textarea{min-height:72px;resize:vertical}
.offline-note{margin:0;color:#667085;font-size:12px;line-height:1.45}.offline-form{display:grid;gap:14px}.offline-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.offline-field{display:grid;gap:5px;font-size:12px;font-weight:700;color:#475467}.offline-field input,.offline-field select{min-height:40px;border:1px solid #cfd5de;border-radius:7px;padding:7px 9px;font:inherit;background:#fff;color:#111827}.offline-check{display:flex;gap:8px;align-items:center;font-size:12px;color:#344054}.offline-check input{width:18px;height:18px}.offline-fixed{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.offline-fixed div{padding:10px;border:1px solid #d9dee7;border-radius:8px;background:#f8fafc}.offline-fixed strong{display:block;font-size:11px}.offline-fixed span{display:block;margin-top:3px;color:#667085;font-size:11px}.offline-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}.offline-status{min-height:18px;color:#667085;font-size:12px}.offline-review{display:grid;gap:14px}.offline-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.offline-summary div{padding:10px;border:1px solid #e1e5eb;border-radius:8px;background:#f8fafc}.offline-summary strong{display:block;font-size:10px;text-transform:uppercase;color:#667085}.offline-summary span{display:block;margin-top:4px;font-weight:700}.offline-bad{color:#b42318}.offline-good{color:#027a48}.offline-review table{width:100%;border-collapse:collapse;font-size:12px}.offline-review th,.offline-review td{padding:7px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top}.offline-review pre{max-height:260px;overflow:auto;padding:10px;border-radius:7px;background:#101828;color:#f8fafc;font:11px/1.45 ui-monospace,monospace;white-space:pre-wrap;word-break:break-word}
[hidden]{display:none!important}
@media(max-width:760px){.body{grid-template-columns:1fr}nav{max-height:220px;border-right:0;border-bottom:1px solid #d9dee7}.meta{width:100%;margin-left:0}.offline-grid,.offline-fixed{grid-template-columns:1fr}}
`;

function clone(value){return structuredClone(value);}
function sanitizeHtml(text){
  // Lesson HTML is mounted inside Studio's own DOM: only inert editor markup.
  // Active SCORM/H5P/HTML runtimes remain supported by isolated Player iframes.
  const doc=new DOMParser().parseFromString(String(text),'text/html');
  const tags=new Set([
    'html','head','body','main','article','section','header','footer','nav','aside',
    'h1','h2','h3','h4','h5','h6','p','div','span','br','hr','blockquote',
    'strong','b','em','i','u','s','del','ins','mark','small','sub','sup','pre','code',
    'ul','ol','li','dl','dt','dd','figure','figcaption','table','thead','tbody',
    'tfoot','tr','th','td','caption','a','img','audio','video','source','picture',
    'details','summary','time','q','abbr'
  ]);
  const attrs=new Set([
    'class','id','title','alt','width','height','style','href','src','poster',
    'controls','muted','loop','playsinline','preload','target','rel',
    'colspan','rowspan','scope','align','dir','lang','start','type','reversed',
    'value','open','role','loading','decoding','datetime','cite'
  ]);
  const safeUrl=(raw,attribute,tag)=>{
    const value=String(raw??'').trim();
    if(!value||/[\u0000-\u001f\u007f]/.test(value)||value.startsWith('\\')||value.startsWith('//'))
      return false;
    if(attribute==='href'&&value.startsWith('#'))return true;
    if(attribute==='src'&&tag==='img'&&/^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(value))
      return true;
    if((attribute==='src'||attribute==='poster')&&value.startsWith('blob:'))return true;
    try{
      const url=new URL(value,'https://p2lrn.invalid/');
      if(attribute==='href')return ['https:','http:','mailto:','tel:'].includes(url.protocol);
      return ['https:','http:'].includes(url.protocol);
    }catch{return false;}
  };
  doc.querySelectorAll('script,iframe,frame,frameset,object,embed,form,input,button,select,textarea,meta,base,link,style,svg,math,template,portal')
    .forEach((node)=>node.remove());
  doc.querySelectorAll('*').forEach((node)=>{
    const tag=node.localName.toLowerCase();
    if(!tags.has(tag)){
      if(tag!=='html'&&tag!=='head'&&tag!=='body')
        node.replaceWith(doc.createTextNode(node.textContent??''));
      return;
    }
    for(const attr of [...node.attributes]){
      const name=attr.name.toLowerCase(),value=attr.value.trim();
      if(name.startsWith('on')||['srcdoc','srcset','xlink:href'].includes(name)||
         (!attrs.has(name)&&!name.startsWith('aria-')&&!name.startsWith('data-'))){
        node.removeAttribute(attr.name);continue;
      }
      if(['href','src','poster'].includes(name)&&!safeUrl(value,name,tag)){
        node.removeAttribute(attr.name);continue;
      }
      if(name==='style'&&/(?:url\s*\(|image-set\s*\(|expression\s*\(|@import|behavior\s*:|-moz-binding|position\s*:\s*(?:fixed|sticky)|z-index\s*:|\\)/i.test(value)){
        node.removeAttribute(attr.name);continue;
      }
      if(name==='target'&&value!=='_blank'&&value!=='_self')node.removeAttribute(attr.name);
    }
    if(tag==='a'&&node.getAttribute('target')==='_blank')node.setAttribute('rel','noopener noreferrer');
  });
  return doc;
}

function installSafeStudioHtmlPaste(node){
  const insert=(event,source)=>{
    const html=source?.getData?.('text/html')??'';
    const plain=source?.getData?.('text/plain')??'';
    if(!html&&!plain)return;
    event.preventDefault();
    const plainOnly=node.matches('h1[contenteditable],p[contenteditable],pre[contenteditable]');
    const fragment=document.createDocumentFragment();
    if(plainOnly||!html){
      fragment.append(document.createTextNode(plain||sanitizeHtml(html).body.textContent||''));
    }else{
      const sanitized=sanitizeHtml(html);
      for(const child of [...sanitized.body.childNodes])fragment.append(document.importNode(child,true));
    }
    const last=fragment.lastChild;
    const selection=window.getSelection();
    if(selection?.rangeCount&&node.contains(selection.anchorNode)){
      const range=selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(fragment);
      if(last){
        range.setStartAfter(last);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }else node.append(fragment);
    node.dispatchEvent(new Event('input',{bubbles:true}));
  };
  node.addEventListener('paste',event=>insert(event,event.clipboardData));
  node.addEventListener('drop',event=>{
    if(event.dataTransfer?.types?.includes('text/html'))insert(event,event.dataTransfer);
  });
}

function filenameFromUrl(value){
  try{return new URL(value,location.href).pathname.split('/').filter(Boolean).at(-1)||'course.p2lrn';}
  catch{return'course.p2lrn';}
}

export class P2LRNStudioElement extends HTMLElement{
  static p2lrnStudioVersion=P2LRN_STUDIO_VERSION;
  static get observedAttributes(){return['src','save-endpoint','reader-endpoint','import-endpoint','course-path','offline-runtime-base-url'];}
  #studio=null;#selected=null;#sourceUrl=null;#sourceObjectUrl=null;#previewObjectUrl=null;#mode='edit';#root=null;#resourceLibrary=null;#unifiedBar=null;#savedRevision=0;#pendingPlacement=null;

  constructor(){
    super();
    this.attachShadow({mode:'open'});
    this.shadowRoot.innerHTML=`<style>${css}</style>
      <div class="shell">
        <div class="toolbar">
          <button type="button" data-create class="primary">Crear curso</button>
          <label><button type="button" data-open>Abrir .p2lrn</button><input data-file type="file" accept=".p2lrn,application/vnd.p2lrn+zip" hidden></label>
          <details class="add-menu" data-add-menu><summary>Añadir contenido</summary><div class="add-pop">
            <div class="add-section"><strong>Contenido</strong><div class="add-grid">
              <button type="button" data-add-kind="lesson" data-help="Crea una lección editable para redactar y dar formato al contenido del curso.">Lección</button>
              <button type="button" data-add-kind="file" data-help="Añade una imagen, vídeo, audio u otro recurso local al curso.">Archivo / multimedia</button>
              <button type="button" data-add-kind="url" data-help="Enlaza un recurso web externo sin copiarlo dentro del paquete.">URL</button>
              <button type="button" data-add-kind="shared-resource" data-help="Añade un recurso ya guardado en tu centro para reutilizarlo en varios cursos.">Recurso compartido</button>
              <button type="button" data-add-kind="shared-library" data-shared-library hidden data-help="Elige un recurso de la biblioteca de tu centro para utilizarlo en este curso.">Biblioteca compartida</button>
              <button type="button" data-add-kind="reader" data-help="Añade un documento y convierte su contenido en lecciones que puedas revisar y editar.">Reader / documento</button>
              <button type="button" data-add-kind="external" data-help="Importa un paquete educativo existente como SCORM, H5P, cmi5, QTI, Common Cartridge o IMS Content Package.">Paquete educativo</button>
            </div></div>
            <div class="add-section"><strong>Evaluación</strong><div class="add-grid"><button type="button" data-add-kind="questionnaire" data-help="Crea una evaluación flexible que puede combinar los tipos de pregunta compatibles.">Cuestionario</button></div></div>
            <div class="add-section"><strong>Juegos</strong><div class="add-grid">
              <button type="button" data-add-kind="memory" data-help="Juego de memoria basado en parejas.">Memoria</button><button type="button" data-add-kind="matching" data-help="Relaciona elementos de dos columnas, como conceptos y definiciones.">Relacionar</button><button type="button" data-add-kind="ordering" data-help="Coloca pasos, fechas o elementos en el orden correcto.">Ordenar</button><button type="button" data-add-kind="classification" data-help="Asigna cada elemento a su categoría correcta.">Clasificar</button><button type="button" data-add-kind="true-false" data-help="Indica si una serie de afirmaciones es verdadera o falsa.">Verdadero / Falso</button><button type="button" data-add-kind="fill-blanks" data-help="Completa uno o más huecos con las respuestas aceptadas.">Completar huecos</button><button type="button" data-add-kind="word-search" data-help="Genera una sopa de letras a partir de respuestas textuales.">Sopa de letras</button><button type="button" data-add-kind="crossword" data-help="Genera un crucigrama a partir de pistas y respuestas textuales.">Crucigrama</button><button type="button" data-add-kind="rosco" data-help="Crea una secuencia tipo rosco con pistas y respuestas textuales.">Rosco</button><button type="button" data-add-kind="3d" data-help="Ordena objetos 3D. Puedes cambiar el tipo de pregunta a Relacionar o Clasificar.">Juego 3D (ordenar)</button>
              <button type="button" data-add-kind="3d-matching" data-help="Conecta parejas de objetos dentro del entorno 3D.">Relacionar 3D</button>
              <button type="button" data-add-kind="3d-classification" data-help="Clasifica objetos en zonas dentro del entorno 3D.">Clasificar 3D</button><button type="button" data-add-kind="assembly-3d" data-help="Crea un montaje 3D por piezas y marca la posición donde encaja cada una.">Ensamblaje 3D</button>
            </div></div>
            <div class="add-section"><strong>Colaboración</strong><p>Actividades para colaborar y participar con otros alumnos desde el aula.</p><div class="add-grid">
              <button type="button" data-add-kind="live-poll" data-help="Plantea una pregunta para que los alumnos voten y compartan sus respuestas.">Votación en directo</button>
              <button type="button" data-add-kind="shared-board" data-help="Los participantes comparten ideas y notas en una pizarra del curso.">Pizarra compartida</button>
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
          <button type="button" data-offline>Entrega offline</button>
          <label><button type="button" data-review-result>Revisar entrega</button><input data-result-file type="file" accept=".p2lrn-result,application/vnd.p2lrn-result+json,application/json" hidden></label>
          <button type="button" data-save hidden>Guardar curso</button>
          <span class="meta" data-meta>Sin curso</span>
        </div>
        <div class="warn" data-warn hidden><strong>Sin guardar</strong> Guarda un borrador o exporta el curso para conservar los cambios.</div>
        <div class="body" data-body hidden>
          <nav data-tree></nav>
          <main class="stage"><div data-stage></div></main>
        </div>
      </div>`;
  }
  connectedCallback(){
    const q=(s)=>this.shadowRoot.querySelector(s);
    q('[data-create]').addEventListener('click',()=>this.createCourse().catch((e)=>this.setStatus(e.message)));
    q('[data-open]').addEventListener('click',()=>q('[data-file]').click());
    q('[data-file]').addEventListener('change',()=>{const f=q('[data-file]').files?.[0];if(f)this.openFile(f);});
    q('[data-add-menu]').querySelectorAll('[data-add-kind]').forEach((button)=>button.addEventListener('click',()=>this.addContent(button.dataset.addKind).catch((e)=>this.setStatus(e.message))));
    const help=q('[data-add-help]');
    const hideHelp=()=>{if(!help)return;help.dataset.visible='false';help.hidden=true;};
    const showHelp=(button)=>{if(!help||!button?.dataset.help)return;help.textContent=button.dataset.help;help.hidden=false;help.dataset.visible='true';requestAnimationFrame(()=>{const rect=button.getBoundingClientRect(),tip=help.getBoundingClientRect(),pad=10,gap=8;let left=rect.left+rect.width/2-tip.width/2;left=Math.max(pad,Math.min(left,window.innerWidth-tip.width-pad));let top=rect.bottom+gap;if(top+tip.height>window.innerHeight-pad)top=rect.top-tip.height-gap;help.style.left=Math.round(Math.max(pad,left))+'px';help.style.top=Math.round(Math.max(pad,top))+'px';});};
    q('[data-add-menu]').querySelectorAll('[data-add-kind][data-help]').forEach((button)=>{button.addEventListener('pointerenter',()=>showHelp(button));button.addEventListener('pointerleave',hideHelp);button.addEventListener('focus',()=>showHelp(button));button.addEventListener('blur',hideHelp);});
    q('[data-add-menu]').addEventListener('toggle',()=>{if(!q('[data-add-menu]').open)hideHelp();});
    q('[data-resource-file]').addEventListener('change',()=>{const f=q('[data-resource-file]').files?.[0];if(f)this.addResourceFile(f).catch((e)=>this.setStatus(e.message));q('[data-resource-file]').value='';});
    q('[data-reader-file]').addEventListener('change',()=>{const f=q('[data-reader-file]').files?.[0];if(f)this.importDocument(f).catch((e)=>this.setStatus(e.message));q('[data-reader-file]').value='';});
    q('[data-external-file]').addEventListener('change',()=>{const f=q('[data-external-file]').files?.[0];if(f)this.importExternalPackage(f).catch((e)=>this.setStatus(e.message));q('[data-external-file]').value='';});
    q('[data-edit]').addEventListener('click',()=>this.setMode('edit'));
    q('[data-preview]').addEventListener('click',()=>this.setMode('preview'));
    q('[data-download]').addEventListener('click',()=>this.download());
    q('[data-offline]').addEventListener('click',()=>this.showOfflineExportDialog());
    q('[data-review-result]').addEventListener('click',()=>q('[data-result-file]').click());
    q('[data-result-file]').addEventListener('change',()=>{const file=q('[data-result-file]').files?.[0];if(file)this.reviewOfflineResult(file).catch((e)=>this.setStatus(e.message));q('[data-result-file]').value='';});
    q('[data-save]').addEventListener('click',()=>this.saveCourse());
    this._syncSaveButton();
    this._syncResourceLibraryButton();
    applyUnifiedStudioWorkspace({
      workspace:q('[data-body]'),outline:q('[data-tree]'),
      canvas:q('.stage'),stage:q('[data-stage]')
    });
    if(!this.#unifiedBar)this.#unifiedBar=mountStudioCommandBar({
      mount:q('.toolbar'),
      resolveSurface:()=>q('[data-studio-html-surface="true"]'),
      onStatus:(message)=>this.setStatus(message),
      actions:{
        create:()=>this.createCourse(),
        open:()=>q('[data-file]').click(),
        openUrl:(url)=>this.openUrl(url),
        save:()=>this.saveEndpoint?this.saveCourse():this.saveLocalDraft(),
        saveDraft:()=>this.saveLocalDraft(),
        recoverDraft:()=>this.recoverLocalDraft(),
        clearDraft:()=>this.clearLocalDraft(),
        export:()=>this.download(),
        offline:()=>this.showOfflineExportDialog(),
        review:()=>q('[data-result-file]').click(),
        addUnit:()=>this.addUnit(),
        addLesson:()=>this.addLesson(),
        addKind:(kind,options)=>this.addContent(kind,options),
        canAddSamePage:()=>this.#studio?.entity(this.#selected)?.type==='activity',
        insertImage:()=>{const btn=q('[data-insert-lesson-image]');if(!btn)throw new Error('Selecciona una lección HTML para insertar imágenes.');btn.click();},
        insertVideo:()=>{const btn=q('[data-insert-lesson-video]');if(!btn)throw new Error('Selecciona una lección HTML para insertar vídeo.');btn.click();},
        canAddKind:(kind)=>kind!=='shared-library'||Boolean(this.#resourceLibrary),
        preview:()=>this.setMode('preview'),
        edit:()=>this.setMode('edit')
      }
    });
    this.#unifiedBar.setDocument(Boolean(this.#studio),this.#studio?.sourceName||'Editor visual de cursos');
    if(this.src&&!this.#studio)this.openUrl(this.src).catch((e)=>this.setStatus(e.message));
  }
  disconnectedCallback(){this._revoke();}
  attributeChangedCallback(name,oldValue,newValue){
    if(oldValue===newValue)return;
    if(name==='save-endpoint')this._syncSaveButton();
    if(name==='src'&&this.isConnected&&newValue)this.openUrl(newValue).catch((e)=>this.setStatus(e.message));
  }
  set resourceLibrary(value){
    if(value!=null&&(typeof value.list!=='function'||typeof value.get!=='function'))throw new TypeError('resourceLibrary must expose list() and get().');
    this.#resourceLibrary=value??null;this._syncResourceLibraryButton();
  }
  get resourceLibrary(){return this.#resourceLibrary}
  get src(){return this.getAttribute('src')||''}
  set src(v){v?this.setAttribute('src',v):this.removeAttribute('src')}
  get saveEndpoint(){return this.getAttribute('save-endpoint')||''}
  get readerEndpoint(){return this.getAttribute('reader-endpoint')||''}
  get importEndpoint(){return this.getAttribute('import-endpoint')||''}
  get offlineRuntimeBaseUrl(){return this.getAttribute('offline-runtime-base-url')||''}
  set offlineRuntimeBaseUrl(v){v?this.setAttribute('offline-runtime-base-url',v):this.removeAttribute('offline-runtime-base-url')}
  set importEndpoint(v){v?this.setAttribute('import-endpoint',v):this.removeAttribute('import-endpoint')}
  set readerEndpoint(v){v?this.setAttribute('reader-endpoint',v):this.removeAttribute('reader-endpoint')}
  set saveEndpoint(v){v?this.setAttribute('save-endpoint',v):this.removeAttribute('save-endpoint')}
  get coursePath(){return (this.getAttribute('course-path')||'course').replace(/^\/+|\/+$/g,'')||'course'}
  set coursePath(v){this.setAttribute('course-path',v||'course')}

  async createCourse(options={}){
    this._revoke();this.#unifiedBar?.resetHistory();
    this.#studio=createP2LRNStudioDocument(options);
    // The hosted editor also opens the first lesson, not the course metadata.
    const firstUnitId=this.#studio.entity(this.#studio.rootId)?.children?.[0];
    const firstLessonId=firstUnitId&&this.#studio.entity(firstUnitId)?.children?.[0];
    this.#sourceUrl=null;this.#selected=firstLessonId||this.#studio.rootId;
    // A freshly created empty course starts with no edits after its initial template.
    this.#savedRevision=this.#studio.changeCount;
    this.shadowRoot.querySelector('[data-body]').hidden=false;
    this._renderTree();await this._renderEditor();this._updateState();
    this.setStatus('Curso nuevo listo para editar');
    this.dispatchEvent(new CustomEvent('p2lrn-studio-create',{detail:{name:this.#studio.sourceName,packageId:this.#studio.manifest.packageId},bubbles:true,composed:true}));
    return this.#studio;
  }
  async openFile(file){
    this._revoke();
    const bytes=await file.arrayBuffer();
    const pkg=await (await playerApi()).openPackageBytes(bytes);
    this.#sourceObjectUrl=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.p2lrn+zip'}));
    await this._open(pkg,{name:file.name||'course.p2lrn',url:this.#sourceObjectUrl});
  }
  async openUrl(url){
    this._revoke();
    const resolved=new URL(url,document.baseURI).href;
    const pkg=await (await playerApi()).openPackageURL(resolved);
    await this._open(pkg,{name:filenameFromUrl(resolved),url:resolved});
  }
  async _open(pkg,{name,url}){
    this.#unifiedBar?.resetHistory();
    this.#studio=new P2LRNStudioDocument(pkg,{sourceName:name,sourceUrl:url});this.#savedRevision=0;
    this.#sourceUrl=url;this.#selected=this.#studio.rootId;
    this.shadowRoot.querySelector('[data-body]').hidden=false;
    this._renderTree();await this._renderEditor();this._updateState();
    this.dispatchEvent(new CustomEvent('p2lrn-studio-open',{detail:{name,packageId:pkg.manifest.packageId},bubbles:true,composed:true}));
  }
  _renderTree(){
    const nav=this.shadowRoot.querySelector('[data-tree]');nav.replaceChildren();
    const heading=document.createElement('div');heading.className='p2lrn-studio-outline-title';
    const kicker=document.createElement('small');kicker.textContent='CURSO';
    const titleOfCourse=document.createElement('strong');titleOfCourse.textContent=this.#studio?.title(this.#studio.rootId)||'Curso P2LRN';
    heading.append(kicker,titleOfCourse);nav.append(heading);
    const actions=document.createElement('div');actions.className='tree-actions';
    const unit=document.createElement('button');unit.type='button';unit.textContent='+ Unidad';unit.onclick=()=>this.addUnit().catch((error)=>this.setStatus(error.message));
    const lesson=document.createElement('button');lesson.type='button';lesson.textContent='+ Lección';lesson.onclick=()=>this.addLesson().catch((error)=>this.setStatus(error.message));
    actions.append(unit,lesson);nav.append(actions);
    const seen=new Set();
    const walk=(entity,depth=0)=>{
      if(!entity||seen.has(entity.id))return;seen.add(entity.id);
      const b=document.createElement('button');b.type='button';b.style.paddingLeft=(8+depth*12)+'px';
      b.innerHTML='<small></small><span></span>';b.querySelector('small').textContent=entity.type;b.querySelector('span').textContent=this.#studio.title(entity.id);
      if(entity.id===this.#selected)b.setAttribute('aria-current','true');
      b.onclick=()=>{this.#selected=entity.id;this._renderTree();this._renderEditor();};nav.append(b);
      (entity.children||[]).forEach((id)=>walk(this.#studio.entity(id),depth+1));
    };
    walk(this.#studio.entity(this.#studio.rootId));
  }
  _insertionParent(){
    const current=this.#studio?.entity(this.#selected);if(!current)return this.#studio?.rootId??null;
    if(['course','unit'].includes(current.type)||this.#studio.isCompositeActivity(current.id))return current.id;
    return this.#studio.parentId(current.id)??this.#studio.rootId;
  }
  _showChoice(title,subtitle,items,onChoose){
    const dialog=document.createElement('dialog');dialog.className='studio-choice-dialog';
    const shell=document.createElement('div');shell.className='studio-choice-shell';
    const head=document.createElement('div');head.className='studio-choice-head';
    const copy=document.createElement('div');const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=subtitle;copy.append(h,p);
    const close=document.createElement('button');close.type='button';close.textContent='Cerrar';close.onclick=()=>dialog.close();head.append(copy,close);shell.append(head);
    const grid=document.createElement('div');grid.className='studio-choice-grid';
    for(const item of items){const b=document.createElement('button');b.type='button';b.className='studio-choice-card';const strong=document.createElement('strong');strong.textContent=item.label;const small=document.createElement('small');small.textContent=item.description||'';b.append(strong,small);b.onclick=()=>Promise.resolve(onChoose(item)).then(()=>dialog.close()).catch((error)=>this.setStatus(error.message));grid.append(b);}
    shell.append(grid);dialog.append(shell);this.shadowRoot.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
  }
  async _chooseSharedResource(parent=this._insertionParent()){
    if(!this.#resourceLibrary)throw new Error('El host no ha conectado una biblioteca de recursos compartidos.');
    const listed=await this.#resourceLibrary.list();
    const items=(listed??[]).filter((entry)=>entry?.digest&&entry?.href).map((entry)=>({
      ...entry,id:entry.digest,label:entry.href.split('/').filter(Boolean).at(-1)||entry.digest,description:(entry.mediaType||'application/octet-stream')+' · '+entry.digest.slice(0,22)+'…',
    }));
    if(!items.length)throw new Error('La biblioteca no contiene recursos con URL de origen y digest verificable.');
    this._showChoice('Biblioteca compartida','El recurso quedará referenciado por URL y SHA-256. Puedes materializarlo después como fallback embebido.',items,async(item)=>{
      const created=this.#studio.addSharedResource(parent,{title:item.label,href:item.href,digest:item.digest,mediaType:item.mediaType||'application/octet-stream',language:'es'});
      await this._selectCreated(created);
    });
  }
  async materializeSharedResource(activityId=this.#selected,{filename=null}={}){
    if(!this.#resourceLibrary)throw new Error('El host no ha conectado una biblioteca de recursos compartidos.');
    const activity=this.#studio?.entity(activityId);const resource=activity?.resource?this.#studio.entity(activity.resource):null;
    const remote=resource?.representations?.find((rep)=>rep.location?.type==='remote'&&rep.location?.expectedDigest);
    if(!remote)throw new Error('La actividad seleccionada no es un recurso compartido fijado por digest.');
    const entry=await this.#resourceLibrary.get(remote.location.expectedDigest);
    if(!entry?.bytes)throw new Error('El recurso no está materializado en la biblioteca local.');
    const inferred=filename||entry.href?.split('/').filter(Boolean).at(-1)||'resource.bin';
    const rep=this.#studio.materializeSharedResource(activityId,{bytes:new Uint8Array(entry.bytes),filename:inferred,mediaType:entry.mediaType});
    await this._renderEditor();this._updateState();return rep;
  }
  _chooseComponent(parent=this._insertionParent()){
    const items=this.#studio.componentCatalog().map((entry)=>({id:entry.id,label:entry.authoring.label,description:entry.authoring.description}));
    this._showChoice('Añadir componente','Elige el bloque nativo que quieres crear.',items,async(item)=>this._selectCreated(this.#studio.addNativeComponent(parent,{componentId:item.id,language:'es'})));
  }
  async addUnit(options={}){
    if(!this.#studio)throw new Error('No hay ningún curso P2LRN abierto.');
    const parent=this._insertionParent();
    if(this.#studio.isCompositeActivity(parent))throw new Error('Un compuesto agrupa actividades, no unidades. Selecciona el curso o una unidad.');
    const created=this.#studio.addUnit(parent,options);this.#selected=created.id;
    this._renderTree();await this._renderEditor();this._updateState();return created;
  }
  async addLesson(options={}){
    if(!this.#studio)throw new Error('No hay ningún curso P2LRN abierto.');
    const created=this.#studio.addLesson(this._insertionParent(),options);this.#selected=created.id;
    this._renderTree();await this._renderEditor();this._updateState();return created;
  }
  async _queuedInsertionParent(){
    const pending=this.#pendingPlacement;this.#pendingPlacement=null;
    if(!pending)return this._insertionParent();
    return pending.placement==='same-page'?
      this.#studio.samePageInsertionParent(pending.sourceId):this.#studio.pageInsertionParent(pending.sourceId);
  }
  async _selectCreated(entity){this.#selected=entity.id;this._renderTree();await this._renderEditor();this._updateState();const menu=this.shadowRoot.querySelector('[data-add-menu]');if(menu)menu.open=false;return entity;}
  async addContent(kind,{placement='new-page'}={}){
    if(!['same-page','new-page'].includes(placement))throw new Error('Destino de inserci\u00f3n desconocido.');
    if(!this.#studio)throw new Error('Crea o abre un curso primero.');
    const sourceId=this.#selected;
    if(['file','reader','external'].includes(kind)){
      if(kind==='external'&&placement==='same-page')throw new Error('Importa paquetes completos en una p\u00e1gina nueva.');
      this.#pendingPlacement={placement,sourceId};
      const selector={file:'resource-file',reader:'reader-file',external:'external-file'}[kind];
      this.shadowRoot.querySelector('[data-'+selector+']').click();return null;
    }
    let scorePoints=null;
    if(kind==='drag-scored'){
      const raw=prompt('Puntos de la pregunta de arrastrar (1 a 100)','5');
      if(raw===null)return null;
      scorePoints=Number(raw);
      if(!Number.isInteger(scorePoints)||scorePoints<1||scorePoints>100)throw new Error('Elige entre 1 y 100 puntos.');
    }
    const parent=placement==='same-page'?
      await this.#studio.samePageInsertionParent(sourceId):this.#studio.pageInsertionParent(sourceId);
    const old=this.#selected;this.#selected=parent;
    try{
    if(kind==='lesson')return this._selectCreated(this.#studio.addLesson(this._insertionParent(),{title:'Nueva lección',language:'es'}));
    if(kind==='unit')return this.addUnit({title:'Nueva unidad',language:'es'});
    if(kind==='url'){const url=prompt('URL del recurso');if(!url)return null;return this._selectCreated(this.#studio.addRemoteResource(this._insertionParent(),{title:'Recurso web',url}));}
    if(kind==='shared-library'){await this._chooseSharedResource(parent);return null;}
    if(kind==='shared-resource'){
      const url=prompt('URL lógica del recurso compartido');if(!url)return null;
      const digest=prompt('SHA-256 esperado (sha256:...)');if(!digest)return null;
      const mediaType=prompt('Tipo MIME','video/mp4')||'application/octet-stream';
      const title=prompt('Título','Recurso compartido')||'Recurso compartido';
      return this._selectCreated(this.#studio.addRemoteResource(this._insertionParent(),{title,url,mediaType,expectedDigest:digest}));
    }
    if(kind==='drag-scored'){
      const game=this.#studio.addGame(this._insertionParent(),{kind:'matching',title:'Arrastrar con puntos',language:'es'});
      const source=await this.#studio.readQuestionnaire(game.id);
      const payload=structuredClone(source.payload);payload.questions[0].points=scorePoints;
      this.#studio.setQuestionnaire(game.id,payload);return this._selectCreated(game);
    }
    if(kind==='questionnaire')return this._selectCreated(this.#studio.addQuestionnaire(this._insertionParent(),{title:'Cuestionario',language:'es'}));
    if(kind==='live-poll')return this._selectCreated(this.#studio.addCollaborationActivity(this._insertionParent(),{mode:'poll',language:'es'}));
    if(kind==='shared-board')return this._selectCreated(this.#studio.addCollaborationActivity(this._insertionParent(),{mode:'board',language:'es'}));
    if(kind==='peer-review')return this._selectCreated(this.#studio.addCollaborationActivity(this._insertionParent(),{mode:'peer-review',language:'es'}));
    if(['memory','matching','ordering','classification','true-false','fill-blanks','word-search','crossword','rosco','3d','3d-matching','3d-classification','assembly-3d'].includes(kind)){const titles={memory:'Memoria',matching:'Relacionar',ordering:'Ordenar',classification:'Clasificar','true-false':'Verdadero / Falso','fill-blanks':'Completar huecos','word-search':'Sopa de letras',crossword:'Crucigrama',rosco:'Rosco','3d':'Juego 3D','3d-matching':'Relacionar 3D','3d-classification':'Clasificar 3D','assembly-3d':'Ensamblaje 3D'};return this._selectCreated(this.#studio.addGame(this._insertionParent(),{kind,title:titles[kind]??'Juego',language:'es'}));}
    if(kind==='component'){this._chooseComponent(parent);return null;}
    if(kind==='composite')return this._selectCreated(this.#studio.addComposite(this._insertionParent(),{title:'Grupo de actividades',language:'es',mode:'free',completion:'all'}));
    return null;
    }finally{if(this.#selected===parent)this.#selected=old;}
  }
  async addResourceFile(file){const bytes=new Uint8Array(await file.arrayBuffer());const parent=await this._queuedInsertionParent();const entity=this.#studio.addEmbeddedResource(parent,{title:file.name.replace(/\.[^.]+$/,''),filename:file.name,mediaType:file.type||'application/octet-stream',bytes});return this._selectCreated(entity);}
  async importExternalPackage(file){
    if(!this.importEndpoint)throw new Error('import-endpoint is required for educational package import.');
    const response=await fetch(new URL(this.importEndpoint,document.baseURI).href,{method:'POST',headers:{'Content-Type':file.type||'application/zip','X-P2LRN-Filename':encodeURIComponent(file.name)},body:await file.arrayBuffer()});
    if(!response.ok){let detail='';try{detail=(await response.json())?.error||''}catch{}throw new Error('Studio external package import failed'+(detail?': '+detail:' (HTTP '+response.status+')'));}
    const bytes=await response.arrayBuffer();const pkg=await (await playerApi()).openPackageBytes(bytes);const root=(pkg.manifest.entrypoints.find((x)=>x.type==='course')??pkg.manifest.entrypoints[0])?.id;const title=pkg.entities.get(root)?.title?.en??pkg.entities.get(root)?.title?.es??file.name;const parent=await this._queuedInsertionParent();const wrapper=await this.#studio.importPackage(pkg,parent,{title,language:'en'});return this._selectCreated(wrapper);
  }
  async importDocument(file){
    if(!this.readerEndpoint)throw new Error('reader-endpoint is required for Reader document import.');
    const response=await fetch(new URL(this.readerEndpoint,document.baseURI).href,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','X-P2LRN-Filename':encodeURIComponent(file.name)},body:await file.arrayBuffer()});
    if(!response.ok)throw new Error('Studio Reader failed: HTTP '+response.status);const result=await response.json();const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');const html='<!doctype html><html><head><meta charset="utf-8"></head><body>'+result.blocks.map((b)=>b.type==='TITLE'?'<h2>'+esc(b.text)+'</h2>':b.type==='LIST'?'<li>'+esc(b.text)+'</li>':'<p>'+esc(b.text)+'</p>').join('')+'</body></html>';const title=result.metadata?.detectedTitle||file.name.replace(/\.[^.]+$/,'');const parent=await this._queuedInsertionParent();return this._selectCreated(this.#studio.addEmbeddedResource(parent,{title,filename:'reader.html',mediaType:'text/html',bytes:new TextEncoder().encode(html)}));
  }
  async _renderEditor(){
    const stage=this.shadowRoot.querySelector('[data-stage]');stage.replaceChildren();
    this.#unifiedBar?.refresh();
    const entity=this.#studio?.entity(this.#selected);if(!entity)return;
    if(this.#mode==='preview'){await this._renderPreview();return;}
    const sheet=document.createElement('article');sheet.className='sheet p2lrn-studio-sheet';
    const titleHeading=document.createElement('h1');titleHeading.className='title';
    const title=document.createElement('span');title.className='title-input';title.textContent=this.#studio.title(entity.id);title.contentEditable='true';title.tabIndex=0;title.setAttribute('role','textbox');title.setAttribute('aria-label','Título');title.setAttribute('aria-multiline','true');
    titleHeading.append(title);
    const desc=document.createElement('p');desc.className='description';desc.textContent=entity.description?.es??entity.description?.en??'';desc.contentEditable='true';desc.setAttribute('role','textbox');desc.setAttribute('aria-label','Descripción');desc.setAttribute('aria-multiline','true');
    title.oninput=()=>{this.#studio.setTitle(entity.id,title.textContent||'');this._renderTree();this._updateState();};
    desc.oninput=()=>{this.#studio.setDescription(entity.id,desc.textContent||'');this._updateState();};
    const head=document.createElement('header');head.className='p2lrn-studio-sheet-head';
    const type=document.createElement('span');type.className='studio-entity-type';type.textContent=entity.type;
    head.append(type,titleHeading,desc);sheet.append(head);
    if(entity.type==='course'){
      const rights=document.createElement('section');rights.className='rights-panel';
      const heading=document.createElement('h2');heading.textContent='Autoría y derechos';rights.append(heading);
      const fields=document.createElement('div');fields.className='rights-fields';
      const values=this.#studio.getCourseRights();
      for(const key of COURSE_RIGHTS_FIELDS){
        const field=document.createElement('label');field.className='rights-field';
        const caption=document.createElement('span');caption.textContent=COURSE_RIGHTS_LABELS[key];
        const input=key==='license'?document.createElement('textarea'):document.createElement('input');
        if(key==='createdAt')input.type='date';
        else if(key!=='license')input.type='text';
        if(key==='author')input.maxLength=300;
        if(key==='copyrightHolder')input.maxLength=300;
        if(key==='license')input.maxLength=2000;
        input.value=values[key]??'';
        input.setAttribute('aria-label',COURSE_RIGHTS_LABELS[key]);
        input.addEventListener('change',()=>{
          try{this.#studio.setCourseRights({[key]:input.value});this._updateState();}
          catch(error){this.setStatus(error.message);}
        });
        field.append(caption,input);fields.append(field);
      }
      rights.append(fields);sheet.append(rights);
    }
    if(entity.type==='activity'){
      const questionnaire=await this.#studio.readQuestionnaire(entity.id);
      if(questionnaire){
        const renderer=entity.extensions?.['https://p2lrn.org/ext/renderer-preference/1']?.preferred??'https://p2lrn.org/renderer/questionnaire/standard';
        renderQuestionnaireVisualEditor(sheet,{model:this.#studio,activityId:entity.id,payload:questionnaire.payload,renderer,onChange:()=>this._updateState(),onStatus:(message)=>this.setStatus(message),createScene:async(canvas,options)=>{const api=await playerApi();if(typeof api?.create3DAuthoringScene!=='function')throw new Error('El Player 3D no está disponible en esta instalación');return api.create3DAuthoringScene(canvas,options);}});
        stage.append(sheet);return;
      }
      const structured=await this.#studio.readStructuredJson(entity.id);
      if(structured){
        renderStructuredVisualEditor(sheet,{model:this.#studio,activityId:entity.id,mediaType:structured.mediaType,payload:structured.payload,onChange:()=>this._updateState(),onStructureChange:()=>{this._renderTree();this._updateState();},onStatus:(message)=>this.setStatus(message),onSelectActivity:(id)=>{this.#selected=id;this._renderTree();void this._renderEditor();},onCreateChild:(id)=>{this.#selected=id;this._renderTree();this.#unifiedBar?.openActivities();}});
        stage.append(sheet);return;
      }
      const editable=await this.#studio.readEditableText(entity.id);
      if(editable){
        const surface=document.createElement(editable.mediaType==='text/plain'?'pre':'article');surface.className='surface';surface.contentEditable='true';if(editable.mediaType==='text/html'){surface.dataset.studioHtmlSurface='true';surface.dataset.studioHtmlKey=editable.path;}installSafeStudioHtmlPaste(surface);
        if(editable.mediaType==='text/plain')surface.textContent=editable.text;
        else surface.innerHTML=sanitizeHtml(editable.text).body.innerHTML;
        if(editable.mediaType==='text/html')collapseStudioLessonProperties({header:head,title});
        surface.oninput=()=>{
          if(editable.mediaType==='text/plain')this.#studio.setPayloadText(editable.path,surface.textContent||'');
          else {const doc=sanitizeHtml('<!doctype html><html><body>'+surface.innerHTML+'</body></html>');this.#studio.setPayloadText(editable.path,'<!doctype html>\n'+doc.documentElement.outerHTML);}
          this._updateState();
        };
        if(editable.mediaType==='text/html')mountLessonImageEditor({preferRibbonInsert:true,getInsertionTarget:()=>this.#unifiedBar?.selectedObject?.()||null,host:sheet,surface,onChange:()=>{
          const doc=sanitizeHtml('<!doctype html><html><body>'+surface.innerHTML+'</body></html>');
          this.#studio.setPayloadText(editable.path,'<!doctype html>\n'+doc.documentElement.outerHTML);
          this._updateState();this.#unifiedBar?.recordChange();
        },onStatus:(message)=>this.setStatus(message)});
        else sheet.append(surface);
      }else{
        const n=document.createElement('div');n.className='notice';n.textContent='Esta actividad se previsualiza con el Player y su paquete interno permanece encapsulado.';sheet.append(n);
      }
    }
    stage.append(sheet);
    this.#unifiedBar?.refresh();
  }
  async _renderPreview(){
    const stage=this.shadowRoot.querySelector('[data-stage]');stage.replaceChildren();
    const exported=await this.exportPackage();
    if(this.#previewObjectUrl)URL.revokeObjectURL(this.#previewObjectUrl);
    this.#previewObjectUrl=URL.createObjectURL(new Blob([exported.bytes],{type:'application/vnd.p2lrn+zip'}));
    const player=document.createElement('p2lrn-player');player.className='preview';player.setAttribute('navigation','external');player.setAttribute('src',this.#previewObjectUrl);player.setAttribute('node',this.#selected);stage.append(player);
  }
  async setMode(mode){
    this.#mode=mode==='preview'?'preview':'edit';
    this.#unifiedBar?.setPreviewMode(this.#mode==='preview');
    this.shadowRoot.querySelector('[data-edit]').classList.toggle('primary',this.#mode==='edit');
    this.shadowRoot.querySelector('[data-preview]').classList.toggle('primary',this.#mode==='preview');
    if(this.#studio)await this._renderEditor();
  }
  async exportPackage(){
    if(!this.#studio)throw new Error('No hay ningún curso P2LRN abierto.');
    return exportP2LRNPackage(this.#studio);
  }
  async saveLocalDraft(){
    const exported=await this.exportPackage();
    await saveLatestDraft({name:exported.filename,bytes:exported.bytes,selectedId:this.#selected,contentRoot:exported.manifest.integrity?.contentRoot??null});
    this.#savedRevision=this.#studio.changeCount;
    this._updateState();this.setStatus('Borrador guardado solo en este navegador');
    return exported.filename;
  }
  async recoverLocalDraft(){
    const saved=await loadLatestDraft();
    if(!saved?.bytes)throw new Error('No hay un borrador local para recuperar.');
    await this.openFile(new File([saved.bytes],saved.name||'borrador.p2lrn',{type:'application/vnd.p2lrn+zip'}));
    if(saved.selectedId&&this.#studio.entity(saved.selectedId)){
      this.#selected=saved.selectedId;this._renderTree();await this._renderEditor();
    }
    this.#savedRevision=this.#studio.changeCount;
    this._updateState();this.setStatus('Borrador local recuperado');
    return saved;
  }
  async clearLocalDraft(){
    if(!confirm('¿Eliminar el borrador guardado en este navegador? Esta acción no se puede deshacer.'))return false;
    await clearLatestDraft();this.setStatus('Borrador local eliminado');return true;
  }
  async download(){
    const exported=await this.exportPackage();
    const url=URL.createObjectURL(new Blob([exported.bytes],{type:'application/vnd.p2lrn+zip'}));
    const a=document.createElement('a');a.href=url;a.download=exported.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    this.#savedRevision=this.#studio.changeCount;
    this._updateState();this.setStatus('Paquete exportado y verificado');
    this.dispatchEvent(new CustomEvent('p2lrn-studio-download',{detail:{filename:exported.filename},bubbles:true,composed:true}));
  }
  showOfflineExportDialog(){
    if(!this.#studio){this.setStatus('Crea o abre un curso primero.');return;}
    const dialog=document.createElement('dialog');dialog.className='studio-choice-dialog';
    const shell=document.createElement('div');shell.className='studio-choice-shell offline-form';
    const head=document.createElement('div');head.className='studio-choice-head';
    const copy=document.createElement('div');const h=document.createElement('h2');h.textContent='Entrega offline autorreproducible';
    const p=document.createElement('p');p.textContent='Crea una entrega autocontenida. En Windows puedes generar un único archivo para doble clic; el alumno completa la actividad en el navegador y devuelve un .p2lrn-result.';
    copy.append(h,p);const close=document.createElement('button');close.type='button';close.textContent='Cerrar';close.onclick=()=>dialog.close();head.append(copy,close);shell.append(head);
    const grid=document.createElement('div');grid.className='offline-grid';
    const field=(label,type,value='')=>{const wrap=document.createElement('label');wrap.className='offline-field';const span=document.createElement('span');span.textContent=label;const input=document.createElement('input');input.type=type;input.value=value;wrap.append(span,input);grid.append(wrap);return input;};
    const formatWrap=document.createElement('label');formatWrap.className='offline-field';
    const formatLabel=document.createElement('span');formatLabel.textContent='Formato de entrega';
    const format=document.createElement('select');
    format.innerHTML='<option value="windows-single">Windows · un archivo (doble clic)</option><option value="portable-zip">ZIP portable · extraer y abrir</option>';
    formatWrap.append(formatLabel,format);grid.append(formatWrap);
    const issuer=field('Quién entrega este curso','text');issuer.maxLength=300;issuer.required=true;issuer.placeholder='Profesor, centro u organización';
    const available=field('Disponible desde','datetime-local');
    const due=field('Fecha límite','datetime-local');
    const duration=field('Tiempo máximo desde que empieza (minutos)','number');duration.min='1';duration.step='1';duration.placeholder='Sin límite';
    const expiry=field('Caduca tras la primera apertura (días)','number');expiry.min='1';expiry.max='3650';expiry.step='1';expiry.placeholder='Ej. 30';
    const attempts=field('Intentos máximos','number','1');attempts.min='1';attempts.max='100';attempts.step='1';
    const participant=field('Alumno / identificador (opcional)','text');participant.maxLength=160;participant.placeholder='Si se deja vacío, lo escribirá el alumno';
    shell.append(grid);
    const resumeLabel=document.createElement('label');resumeLabel.className='offline-check';const resume=document.createElement('input');resume.type='checkbox';resume.checked=true;resumeLabel.append(resume,document.createTextNode('Permitir continuar el mismo intento después de cerrar'));shell.append(resumeLabel);
    const metricsLabel=document.createElement('label');metricsLabel.className='offline-check';const metrics=document.createElement('input');metrics.type='checkbox';metrics.checked=true;metricsLabel.append(metrics,document.createTextNode('Incluir métricas de actividad y telemetría pedagógica'));shell.append(metricsLabel);
    const fixed=document.createElement('div');fixed.className='offline-fixed';
    const collaboration=document.createElement('div');collaboration.innerHTML='<strong>Colaboración</strong><span>Desactivada en la entrega offline</span>';
    const network=document.createElement('div');network.innerHTML='<strong>Servicios externos</strong><span>Denegados; Player, curso y métricas viajan dentro de la entrega</span>';fixed.append(collaboration,network);shell.append(fixed);
    const note=document.createElement('p');note.className='offline-note';note.textContent='La entrega sólo se genera si el curso identifica autor y titular de derechos. El alumno verá esos datos y quién entrega el curso antes de comenzar. La caducidad desde la primera apertura se aplica localmente; sin una autoridad externa no impide de forma absoluta copiar el archivo a otro equipo.';shell.append(note);
    const status=document.createElement('div');status.className='offline-status';status.setAttribute('role','status');shell.append(status);
    const actions=document.createElement('div');actions.className='offline-actions';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar';cancel.onclick=()=>dialog.close();
    const generate=document.createElement('button');generate.type='button';generate.className='primary';generate.textContent='Crear paquete offline';
    generate.onclick=async()=>{
      generate.disabled=true;status.textContent='Incluyendo Player, curso y recursos verificados…';
      try{
        const toIso=(input)=>input.value?new Date(input.value).toISOString():null;
        const minutes=String(duration.value||'').trim();
        await this.downloadOfflineAssignment({
          deliveryFormat:format.value,
          issuerName:String(issuer.value||'').trim(),
          availableFrom:toIso(available),dueAt:toIso(due),
          attemptDurationSeconds:minutes?Math.round(Number(minutes)*60):null,
          expiresAfterFirstOpenDays:String(expiry.value||'').trim()?Number(expiry.value):null,
          maxAttempts:Number(attempts.value||1),allowResume:resume.checked,activityTracking:metrics.checked,
          participantLabel:participant.value,
        });
        status.textContent='Paquete offline creado.';dialog.close();
      }catch(error){status.textContent=String(error?.message??error);generate.disabled=false;}
    };
    actions.append(cancel,generate);shell.append(actions);dialog.append(shell);this.shadowRoot.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
  }
  async exportOfflineAssignment(options={}){
    if(!this.#studio)throw new Error('No hay ningún curso P2LRN abierto.');
    return exportOfflineAssignmentBundle(this.#studio,{...options,runtimeBaseUrl:options.runtimeBaseUrl??(this.offlineRuntimeBaseUrl||null)});
  }
  async downloadOfflineAssignment(options={}){
    const exported=await this.exportOfflineAssignment(options);
    const windowsSingle=String(options.deliveryFormat??'windows-single')==='windows-single';
    const artifact=windowsSingle?exported.windowsLauncher:{filename:exported.filename,bytes:exported.bytes};
    const type=windowsSingle?'application/x-msdos-program':'application/zip';
    const url=URL.createObjectURL(new Blob([artifact.bytes],{type}));
    const a=document.createElement('a');a.href=url;a.download=artifact.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    this.dispatchEvent(new CustomEvent('p2lrn-studio-offline-export',{detail:{filename:artifact.filename,format:windowsSingle?'windows-single':'portable-zip',assignmentId:exported.assignment.assignmentId,contentRoot:exported.assignment.contentRoot},bubbles:true,composed:true}));
    return {...exported,downloadedFilename:artifact.filename,deliveryFormat:windowsSingle?'windows-single':'portable-zip'};
  }
  async reviewOfflineResult(file){
    if(!file)throw new TypeError('Selecciona un archivo .p2lrn-result.');
    let expectedContentRoot=null;
    if(this.#studio){
      const current=await this.exportPackage();
      expectedContentRoot=current.manifest.integrity.contentRoot;
    }
    const review=await parseOfflineAssignmentResult(await file.text(),{expectedContentRoot});
    this._showOfflineReview(review,file.name||'entrega.p2lrn-result');
    this.dispatchEvent(new CustomEvent('p2lrn-studio-offline-review',{detail:{filename:file.name||'',integrityValid:review.integrityValid,courseMatches:review.courseMatches,attemptNumber:review.summary.attemptNumber},bubbles:true,composed:true}));
    return review;
  }
  _showOfflineReview(review,filename){
    const dialog=document.createElement('dialog');dialog.className='studio-choice-dialog';
    const shell=document.createElement('div');shell.className='studio-choice-shell offline-review';
    const head=document.createElement('div');head.className='studio-choice-head';const copy=document.createElement('div');
    const h=document.createElement('h2');h.textContent='Revisar entrega offline';const p=document.createElement('p');p.textContent=filename;copy.append(h,p);
    const close=document.createElement('button');close.type='button';close.textContent='Cerrar';close.onclick=()=>dialog.close();head.append(copy,close);shell.append(head);
    const summary=document.createElement('div');summary.className='offline-summary';
    const add=(label,value,kind='')=>{const box=document.createElement('div');const strong=document.createElement('strong');strong.textContent=label;const span=document.createElement('span');span.textContent=String(value??'—');if(kind)span.className=kind;box.append(strong,span);summary.append(box);};
    add('Integridad',review.integrityValid?'Válida':'Inválida',review.integrityValid?'offline-good':'offline-bad');
    add('Curso',review.courseMatches?'Coincide':'No coincide',review.courseMatches?'offline-good':'offline-bad');
    add('Alumno',review.summary.participantLabel||'Sin identificar');
    add('Intento',review.summary.attemptNumber??'—');
    add('Duración',Math.round(review.summary.elapsedSeconds/60)+' min');
    add('Tiempo activo',Math.round(review.summary.activeTimeMs/60000)+' min');
    const score=review.summary.latestScore;add('Última puntuación',score?.graded===false?'Pendiente de corrección':score?.normalized!=null?Math.round(Number(score.normalized)*100)+' %':score?.raw??'—');
    add('Eventos',review.summary.events.length);
    shell.append(summary);
    const answersHeading=document.createElement('h3');answersHeading.textContent='Respuestas para corrección';shell.append(answersHeading);
    if(review.summary.answers.length){
      const table=document.createElement('table');const thead=document.createElement('thead');thead.innerHTML='<tr><th>Actividad</th><th>Pregunta</th><th>Respuesta</th></tr>';table.append(thead);
      const tbody=document.createElement('tbody');
      for(const item of review.summary.answers){const tr=document.createElement('tr');for(const value of [item.entityId??'—',item.questionId??'—',JSON.stringify(item.answer)]){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}tbody.append(tr);}table.append(tbody);shell.append(table);
    }else{const empty=document.createElement('p');empty.className='offline-note';empty.textContent='La entrega no contiene respuestas estructuradas detectables.';shell.append(empty);}
    // Teacher-only manual grading: the learner's answerless package never
    // contains these marks, and the local report is explicitly non-authoritative.
    const pendingAnswers=latestManualReviewAnswers(review);
    if(pendingAnswers.length&&review.integrityValid&&review.courseMatches&&review.assignmentMatches!==false){
      const heading=document.createElement('h3');heading.textContent='Corrección posterior del profesor';shell.append(heading);
      const note=document.createElement('p');note.className='offline-note';
      note.textContent='Asigna los puntos a cada respuesta. Se guardará una revisión independiente; no modifica la entrega original ni certifica una nota por sí sola.';
      shell.append(note);
      const teacher=document.createElement('input');teacher.type='text';teacher.value='Profesor';teacher.maxLength=120;
      teacher.setAttribute('aria-label','Profesor que corrige');teacher.placeholder='Nombre del profesor';
      const teacherLabel=document.createElement('label');teacherLabel.textContent='Profesor: ';teacherLabel.append(teacher);shell.append(teacherLabel);
      const gradeTable=document.createElement('table');gradeTable.className='offline-grading-table';
      const gradeHead=document.createElement('thead');gradeHead.innerHTML='<tr><th>Pregunta</th><th>Puntos obtenidos</th><th>Máximo</th><th>Observación</th></tr>';
      gradeTable.append(gradeHead);
      const gradeBody=document.createElement('tbody'),gradingFields=[];
      const known=Array.isArray(review.summary.latestScore?.questions)?review.summary.latestScore.questions:[];
      for(const answer of pendingAnswers){
        const tr=document.createElement('tr');
        const titleCell=document.createElement('td');titleCell.textContent=answer.questionId;
        const amountCell=document.createElement('td'),maxCell=document.createElement('td'),noteCell=document.createElement('td');
        const defaultMax=known.find(item=>item.questionId===answer.questionId)?.pointsPossible??1;
        const earned=document.createElement('input');earned.type='number';earned.min='0';earned.step='any';earned.placeholder='Sin corregir';
        earned.setAttribute('aria-label','Puntos obtenidos: '+answer.questionId);
        const maximum=document.createElement('input');maximum.type='number';maximum.min='0.01';maximum.step='any';maximum.value=String(defaultMax>0?defaultMax:1);
        maximum.setAttribute('aria-label','Puntos posibles: '+answer.questionId);
        const comment=document.createElement('input');comment.type='text';comment.maxLength=2000;comment.placeholder='Comentario opcional';
        comment.setAttribute('aria-label','Comentario: '+answer.questionId);
        amountCell.append(earned);maxCell.append(maximum);noteCell.append(comment);
        tr.append(titleCell,amountCell,maxCell,noteCell);gradeBody.append(tr);
        gradingFields.push({answer,earned,maximum,comment});
      }
      gradeTable.append(gradeBody);shell.append(gradeTable);
      const status=document.createElement('p');status.className='offline-note';status.setAttribute('aria-live','polite');
      const download=document.createElement('button');download.type='button';download.textContent='Guardar corrección del profesor';
      download.addEventListener('click',()=>{
        try{
          const marks=gradingFields.map(({answer,earned,maximum,comment})=>({
            entityId:answer.entityId,questionId:answer.questionId,
            pointsAwarded:earned.value.trim()===''?NaN:Number(earned.value),
            pointsPossible:Number(maximum.value),
            comment:comment.value,
          }));
          const corrected=createP2LRNManualReviewReport(review,{marks,reviewer:teacher.value});
          const file=String(filename||'entrega').replace(/[^A-Za-z0-9._-]/g,'_').replace(/\.p2lrn-result$/i,'')+'.p2lrn-review.json';
          const blob=new Blob([JSON.stringify(corrected,null,2)+'\n'],{type:'application/json'});
          const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=file;
          shell.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
          status.textContent='Corrección guardada: '+corrected.totals.awarded+' / '+corrected.totals.maximum+'. Informe local sin certificación de servidor.';
          this.dispatchEvent(new CustomEvent('p2lrn-studio-manual-review',{detail:{
            filename:file,awarded:corrected.totals.awarded,maximum:corrected.totals.maximum,
          },bubbles:true,composed:true}));
        }catch(error){status.textContent=String(error?.message??error);}
      });
      shell.append(download,status);
    }else if(pendingAnswers.length){
      const warning=document.createElement('p');warning.className='offline-note';
      warning.textContent='No se habilita la corrección: la integridad o la correspondencia de la entrega no están verificadas.';
      shell.append(warning);
    }
    const anomaliesHeading=document.createElement('h3');anomaliesHeading.textContent='Incidencias / anomalías';shell.append(anomaliesHeading);
    const anomalies=document.createElement('p');anomalies.className='offline-note';anomalies.textContent=review.summary.anomalies.length?review.summary.anomalies.map((item)=>item.code).join(' · '):'Sin anomalías registradas.';shell.append(anomalies);
    const details=document.createElement('details');const detailsSummary=document.createElement('summary');detailsSummary.textContent='Ver métricas y entrega completa';const pre=document.createElement('pre');pre.textContent=JSON.stringify(review.result,null,2);details.append(detailsSummary,pre);shell.append(details);
    dialog.append(shell);this.shadowRoot.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
  }
  async saveCourse(){
    if(!this.saveEndpoint)throw new Error('No se ha configurado el guardado en línea. Descarga una copia del curso para conservar tus cambios.');
    const exported=await this.exportPackage();
    const endpoint=new URL(this.saveEndpoint,document.baseURI).href;
    const response=await fetch(endpoint,{method:'POST',headers:{
      'Content-Type':'application/vnd.p2lrn+zip',
      'X-P2LRN-Path':this.coursePath,
      'X-P2LRN-Filename':exported.filename,
    },body:exported.bytes});
    if(!response.ok)throw new Error('No se pudo guardar el curso en línea. Comprueba la conexión y vuelve a intentarlo.');
    let result=null;try{result=await response.json();}catch{}
    this.#savedRevision=this.#studio.changeCount;
    this._updateState();this.setStatus('Curso guardado en servidor');
    this.dispatchEvent(new CustomEvent('p2lrn-studio-save',{detail:{filename:exported.filename,coursePath:this.coursePath,result},bubbles:true,composed:true}));
    return result;
  }
  setStatus(text){this.shadowRoot.querySelector('[data-meta]').textContent=text;this.#unifiedBar?.setMessage(text)}
  _updateState(){
    const changes=this.#studio?.changeCount??0;
    const unsaved=Boolean(this.#studio&&changes>this.#savedRevision);
    this.setStatus(unsaved?changes+' cambio'+(changes===1?'':'s')+' pendiente'+(changes===1?'':'s')+' de guardar':'Sin cambios pendientes');
    this.#unifiedBar?.setDocument(Boolean(this.#studio),this.#studio?.sourceName||'Editor visual de cursos');
    this.shadowRoot.querySelector('[data-warn]').hidden=!unsaved;
  }
  _syncSaveButton(){if(this.shadowRoot)this.shadowRoot.querySelector('[data-save]').hidden=!this.saveEndpoint}
  _syncResourceLibraryButton(){const button=this.shadowRoot?.querySelector('[data-shared-library]');if(button)button.hidden=!this.#resourceLibrary}
  _revoke(){if(this.#sourceObjectUrl)URL.revokeObjectURL(this.#sourceObjectUrl);if(this.#previewObjectUrl)URL.revokeObjectURL(this.#previewObjectUrl);this.#sourceObjectUrl=null;this.#previewObjectUrl=null}
}

if(globalThis.customElements&&!customElements.get('p2lrn-studio'))customElements.define('p2lrn-studio',P2LRNStudioElement);
