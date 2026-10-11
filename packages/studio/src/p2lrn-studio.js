async function playerApi(){
  if(globalThis.P2LRNReady)return globalThis.P2LRNReady;
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

export const P2LRN_STUDIO_VERSION='0.5.0-alpha.10';

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
.add-menu{position:relative}.add-menu>summary{list-style:none}.add-menu>summary::-webkit-details-marker{display:none}.add-pop{position:absolute;z-index:20;top:42px;left:0;width:430px;max-width:calc(100vw - 40px);padding:10px;border:1px solid #d9dee7;border-radius:8px;background:#fff;box-shadow:0 16px 40px rgba(15,23,42,.16)}.add-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.add-grid button{text-align:left;font-size:12px}.questionnaire-json{width:100%;min-height:320px;border:1px solid #cfd5de;border-radius:7px;padding:12px;font:12px/1.5 ui-monospace,monospace}.questionnaire-visual-editor{display:grid;gap:16px}.q-editor-head h2{margin:4px 0}.q-editor-head p{margin:0;color:#667085}.q-kicker{font:700 10px ui-monospace,monospace;text-transform:uppercase;color:#667085}.q-settings,.q-basic-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}.q-field{display:grid;gap:5px}.q-label{font:700 10px ui-monospace,monospace;color:#667085}.q-field input,.q-field select,.q-option-row input,.q-pair-row input,.q-class-row input,.q-class-row select,.q-add-row select{min-height:36px;border:1px solid #cfd5de;border-radius:6px;padding:6px 8px}.q-list{display:grid;gap:12px}.q-card{border:1px solid #d9dee7;border-radius:8px;padding:12px}.q-card-head{display:flex;justify-content:space-between;gap:8px}.q-card-actions,.q-add-row{display:flex;gap:6px}.q-type-editor{display:grid;gap:7px;margin-top:10px;padding-top:10px;border-top:1px solid #eef0f3}.q-option-row{display:grid;grid-template-columns:auto 1fr auto;gap:7px;align-items:center}.q-pair-row,.q-class-row{display:grid;grid-template-columns:1fr auto 1fr auto;gap:7px;align-items:center}.q-class-row{grid-template-columns:1fr 1fr auto}.q-mini{border:1px solid #cfd5de;border-radius:6px;background:#fff;padding:5px 8px}.q-danger{color:#b42318}.q-answer-list,.q-advanced textarea{width:100%;min-height:100px;border:1px solid #cfd5de;border-radius:6px;padding:8px}.q-advanced{border-top:1px dashed #d0d5dd;padding-top:8px}.q-advanced summary{cursor:pointer;font:700 11px ui-monospace,monospace;color:#667085}.sheet,.stage,.questionnaire-visual-editor,.q-list,.q-card,.q-settings,.q-basic-grid,.q-type-editor,.q-option-row,.q-pair-row,.q-class-row,.q-add-row{min-width:0;max-width:100%;box-sizing:border-box}.stage{overflow-x:hidden}.sheet{overflow:hidden}.q-settings,.q-basic-grid{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}.q-field,.q-field input,.q-field select,.q-option-row input,.q-pair-row input,.q-class-row input,.q-class-row select,.q-add-row select{min-width:0;max-width:100%;width:100%}.q-option-row{grid-template-columns:auto minmax(0,1fr) auto}.q-pair-row{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) auto}.q-class-row{grid-template-columns:minmax(0,1fr) minmax(110px,.7fr) auto}.q-fixed-type{display:flex;align-items:center;min-height:36px;border:1px solid #cfd5de;border-radius:6px;background:#f8fafc;padding:6px 8px;font-weight:700}.q-advanced textarea{max-width:100%;box-sizing:border-box}.add-section{display:grid;gap:6px;padding:8px 0;border-top:1px solid #eef0f3}.add-section:first-child{border-top:0;padding-top:0}.add-section>strong{font:700 10px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em;color:#667085}.add-section>p{margin:0 0 3px;color:#667085;font-size:11px;line-height:1.35}.add-grid button[data-help]{display:grid;gap:2px;min-width:0}.add-grid button[data-help] small{color:#667085;font-size:10px}.add-help{position:fixed;z-index:1000;width:min(300px,calc(100vw - 24px));padding:9px 11px;border:1px solid #344054;border-radius:7px;background:#101828;color:#fff;box-shadow:0 10px 28px rgba(16,24,40,.24);font:600 11px/1.4 Arial,sans-serif;pointer-events:none;opacity:0;transform:translateY(4px);transition:opacity .12s ease,transform .12s ease}.add-help[data-visible=true]{opacity:1;transform:translateY(0)}.add-help::before{content:'What it does';display:block;margin-bottom:2px;color:#d0d5dd;font:700 9px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em}.warn{padding:8px 10px;background:#fff8e6;border-bottom:1px solid #e7cb84;font-size:12px;color:#614b16}
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
          <button type="button" data-create class="primary">New course</button>
          <label><button type="button" data-open>Open .p2lrn</button><input data-file type="file" accept=".p2lrn,application/vnd.p2lrn+zip" hidden></label>
          <details class="add-menu" data-add-menu><summary><span role="button">Add content</span></summary><div class="add-pop">
            <div class="add-section"><strong>Content</strong><div class="add-grid">
              <button type="button" data-add-kind="lesson" data-help="Create an editable lesson for writing and formatting course content.">Lesson</button>
              <button type="button" data-add-kind="file" data-help="Add an image, video, audio file or other local resource to the course.">File / media</button>
              <button type="button" data-add-kind="url" data-help="Link to an external web resource without copying it into the package.">URL</button>
              <button type="button" data-add-kind="reader" data-help="Import documents such as PDF, DOCX, PPTX, EPUB, TXT or Markdown through the host Reader endpoint.">Reader / document</button>
              <button type="button" data-add-kind="external" data-help="Import an existing educational package such as SCORM, H5P, cmi5, QTI, Common Cartridge or IMS Content Package.">Educational package</button>
            </div></div>
            <div class="add-section"><strong>Assessment</strong><div class="add-grid"><button type="button" data-add-kind="questionnaire" data-help="Create a flexible assessment that can mix all supported question types.">Questionnaire</button></div></div>
            <div class="add-section"><strong>Games</strong><div class="add-grid">
              <button type="button" data-add-kind="memory" data-help="Memory-card game based on matching pairs.">Memory</button><button type="button" data-add-kind="matching" data-help="Match items from two columns, such as concepts and definitions.">Matching</button><button type="button" data-add-kind="ordering" data-help="Put steps, dates or elements into the correct order.">Ordering</button><button type="button" data-add-kind="classification" data-help="Assign each item to its correct category.">Classification</button><button type="button" data-add-kind="true-false" data-help="Judge a series of statements as true or false.">True / False</button><button type="button" data-add-kind="fill-blanks" data-help="Complete one or more blanks with the accepted answers.">Fill blanks</button><button type="button" data-add-kind="word-search" data-help="Generate a word-search game from text answers.">Word search</button><button type="button" data-add-kind="crossword" data-help="Generate a crossword from clues and text answers.">Crossword</button><button type="button" data-add-kind="rosco" data-help="Create a rosco-style sequence of clues with text answers.">Rosco</button><button type="button" data-add-kind="3d" data-help="Create a 3D ordering/matching activity using the Player Quest runtime.">3D game</button>
            </div></div>
            <div class="add-section"><strong>Advanced structure</strong><p>Use + Unit in the course tree for normal course sections. These options are for reusable or grouped structures.</p><div class="add-grid">
              <button type="button" data-add-kind="component" data-help="Create a portable native reusable block, such as a callout, with its own configuration."><span>Reusable block</span><small>Native component</small></button>
              <button type="button" data-add-kind="composite" data-help="Create an advanced container that groups several elements into one navigable/completable experience."><span>Composite group</span><small>Grouped content</small></button>
            </div></div>
          </div></details><div class="add-help" data-add-help hidden></div><input data-resource-file type="file" hidden><input data-reader-file type="file" accept=".pdf,.docx,.pptx,.txt,.md,.markdown,.html,.htm,.rtf,.tex,.xml,.yaml,.yml,.odt,.epub" hidden><input data-external-file type="file" accept=".zip,.h5p,application/zip,application/vnd.h5p" hidden>
          <button type="button" data-edit class="primary">Edit</button>
          <button type="button" data-preview>Student view</button>
          <button type="button" data-download>Download .p2lrn</button>
          <button type="button" data-save hidden>Save course</button>
          <span class="meta" data-meta>No course</span>
        </div>
        <div class="warn" data-warn hidden>Changes are only in memory until you download or save the course.</div>
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
    const unit=document.createElement('button');unit.type='button';unit.textContent='+ Unit';unit.onclick=()=>this.addUnit();
    const lesson=document.createElement('button');lesson.type='button';lesson.textContent='+ Lesson';lesson.onclick=()=>this.addLesson();
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
    if(['course','unit'].includes(current.type))return current.id;
    return this.#studio.parentId(current.id)??this.#studio.rootId;
  }
  async addUnit(options={}){
    if(!this.#studio)throw new Error('No P2LRN course is open.');
    const created=this.#studio.addUnit(this.#insertionParent(),options);this.#selected=created.id;
    this.#renderTree();await this.#renderEditor();this.#updateState();return created;
  }
  async addLesson(options={}){
    if(!this.#studio)throw new Error('No P2LRN course is open.');
    const created=this.#studio.addLesson(this.#insertionParent(),options);this.#selected=created.id;
    this.#renderTree();await this.#renderEditor();this.#updateState();return created;
  }
  async #selectCreated(entity){this.#selected=entity.id;this.#renderTree();await this.#renderEditor();this.#updateState();const menu=this.shadowRoot.querySelector('[data-add-menu]');if(menu)menu.open=false;return entity;}
  async addContent(kind){
    if(!this.#studio)throw new Error('Create or open a course first.');
    if(kind==='lesson')return this.#selectCreated(this.#studio.addLesson(this.#insertionParent(),{title:'New lesson',language:'en'}));
    if(kind==='unit'){const unit=this.#studio.addUnit(this.#insertionParent(),{title:'New unit',language:'en'});return this.#selectCreated(unit);}
    if(kind==='file'){this.shadowRoot.querySelector('[data-resource-file]').click();return null;}
    if(kind==='reader'){this.shadowRoot.querySelector('[data-reader-file]').click();return null;}
    if(kind==='external'){this.shadowRoot.querySelector('[data-external-file]').click();return null;}
    if(kind==='url'){const url=prompt('Resource URL');if(!url)return null;return this.#selectCreated(this.#studio.addRemoteResource(this.#insertionParent(),{title:'Web resource',url}));}
    if(kind==='questionnaire')return this.#selectCreated(this.#studio.addQuestionnaire(this.#insertionParent(),{title:'Questionnaire',language:'en'}));
    if(['memory','matching','ordering','classification','true-false','fill-blanks','word-search','crossword','rosco','3d'].includes(kind))return this.#selectCreated(this.#studio.addGame(this.#insertionParent(),{kind,title:kind,language:'en'}));
    if(kind==='component'){const payload={schema:'https://p2lrn.org/schema/native-component/0.1',version:'0.1',component:{id:'https://p2lrn.org/component/callout',componentVersion:'1',dataVersion:'2',runtimeContractVersion:'1'},data:{tone:'info',body:'Edit this component'},title:'Component'};return this.#selectCreated(this.#studio.addEmbeddedResource(this.#insertionParent(),{title:'Component',filename:'component.json',mediaType:'application/vnd.p2lrn.component+json',bytes:new TextEncoder().encode(JSON.stringify(payload,null,2)+'\n'),profile:'https://p2lrn.org/profile/native-component'}));}
    if(kind==='composite'){const payload={schema:'https://p2lrn.org/schema/native-composite/0.1',version:'0.1',mode:'sequence',completion:'all',navigation:'open',title:'Composite'};return this.#selectCreated(this.#studio.addEmbeddedResource(this.#insertionParent(),{title:'Composite',filename:'composite.json',mediaType:'application/vnd.p2lrn.composite+json',bytes:new TextEncoder().encode(JSON.stringify(payload,null,2)+'\n'),profile:'https://p2lrn.org/profile/native-composite'}));}
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
    const title=document.createElement('h1');title.className='title';title.textContent=this.#studio.title(entity.id);title.contentEditable='true';
    const desc=document.createElement('p');desc.className='description';desc.textContent=entity.description?.es??entity.description?.en??'';desc.contentEditable='true';
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
        renderStructuredVisualEditor(sheet,{model:this.#studio,activityId:entity.id,mediaType:structured.mediaType,payload:structured.payload,onChange:()=>this.#updateState(),onStatus:(message)=>this.#status(message)});
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
        const n=document.createElement('div');n.className='notice';n.textContent='This activity is previewed with the Player but its internal package remains encapsulated.';sheet.append(n);
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
    if(!this.#studio)throw new Error('No P2LRN course is open.');
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
    const changes=this.#studio?.changeCount??0;this.#status(changes?changes+' unsaved change'+(changes===1?'':'s'):'Ready');
    this.shadowRoot.querySelector('[data-warn]').hidden=!changes;
  }
  #syncSaveButton(){if(this.shadowRoot)this.shadowRoot.querySelector('[data-save]').hidden=!this.saveEndpoint}
  #revoke(){if(this.#sourceObjectUrl)URL.revokeObjectURL(this.#sourceObjectUrl);if(this.#previewObjectUrl)URL.revokeObjectURL(this.#previewObjectUrl);this.#sourceObjectUrl=null;this.#previewObjectUrl=null}
}

if(globalThis.customElements&&!customElements.get('p2lrn-studio'))customElements.define('p2lrn-studio',P2LRNStudioElement);
