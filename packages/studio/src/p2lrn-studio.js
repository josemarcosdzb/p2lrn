import {openP2LRNPackageBytes,openP2LRNPackageURL} from '@p2lrn/player';
import {P2LRNStudioDocument} from './runtime/authoring-document.js';
import {exportP2LRNPackage} from './runtime/package-export.js';

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
.stage{padding:18px;min-width:0}
.sheet{max-width:980px;min-height:520px;margin:auto;background:#fff;border-radius:8px;padding:26px}
.title,.description,.surface{outline:0}
.title{font-size:34px;margin:0 0 8px}
.description{color:#667085;margin:0 0 18px;min-height:1.4em}
.surface{min-height:340px;border:1px dashed #98a2b3;border-radius:7px;padding:16px;line-height:1.6}
.notice{padding:14px;border:1px solid #d9dee7;border-radius:7px;background:#f8fafc;color:#667085}
.preview{display:block;min-height:520px;background:#fff;border-radius:8px}
.warn{padding:8px 10px;background:#fff8e6;border-bottom:1px solid #e7cb84;font-size:12px;color:#614b16}
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
  static get observedAttributes(){return['src','save-endpoint','course-path'];}
  #studio=null;#selected=null;#sourceUrl=null;#sourceObjectUrl=null;#previewObjectUrl=null;#mode='edit';#root=null;

  constructor(){
    super();
    this.attachShadow({mode:'open'});
    this.shadowRoot.innerHTML=`<style>${css}</style>
      <div class="shell">
        <div class="toolbar">
          <label><button type="button" data-open>Open .p2lrn</button><input data-file type="file" accept=".p2lrn,application/vnd.p2lrn+zip" hidden></label>
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
    q('[data-open]').addEventListener('click',()=>q('[data-file]').click());
    q('[data-file]').addEventListener('change',()=>{const f=q('[data-file]').files?.[0];if(f)this.openFile(f);});
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
  set saveEndpoint(v){v?this.setAttribute('save-endpoint',v):this.removeAttribute('save-endpoint')}
  get coursePath(){return (this.getAttribute('course-path')||'course').replace(/^\/+|\/+$/g,'')||'course'}
  set coursePath(v){this.setAttribute('course-path',v||'course')}

  async openFile(file){
    this.#revoke();
    const bytes=await file.arrayBuffer();
    const pkg=await openP2LRNPackageBytes(bytes);
    this.#sourceObjectUrl=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.p2lrn+zip'}));
    await this.#open(pkg,{name:file.name||'course.p2lrn',url:this.#sourceObjectUrl});
  }
  async openUrl(url){
    this.#revoke();
    const resolved=new URL(url,document.baseURI).href;
    const pkg=await openP2LRNPackageURL(resolved);
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
