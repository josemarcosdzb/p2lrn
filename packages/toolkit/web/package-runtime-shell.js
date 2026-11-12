export function startPackageRuntime({opaqueRuntime = false} = {}) {
const PROTOCOL = 'p2lrn-package-runtime/1';
const CMI5_PROTOCOL = 'p2lrn-cmi5-preview/1';
const stage = document.getElementById('stage');
const files = new Map();
const urls = new Map();
let inlineScriptId=0;
let channel = null;
let channelSend = null;
let active = false;
let resizeObserver = null;
let runtimeProfile = null;
let cmi5Config = null;
const legacyHandlerObservers = new WeakMap();
// Prevent repeated mutation-driven handler compilation from bypassing a
// per-document limit. No new privileges or network access are added.
let legacyHandlersInstalled = 0;
let legacyHandlerBytes = 0;

function reply(action, payload = {}) {
  channelSend?.({protocol:PROTOCOL, action, ...payload});
}
function fatal(message) {
  const pre = document.createElement('pre');
  pre.className = 'error';
  pre.textContent = String(message);
  stage.replaceChildren(pre);
}
function observeContentFrame(frame) {
  try { resizeObserver?.disconnect?.(); } catch {}
  resizeObserver = null;
  const doc = frame?.contentDocument;
  if (!doc) return;
  const report = () => {
    const height = Math.max(
      doc.documentElement?.scrollHeight ?? 0,
      doc.body?.scrollHeight ?? 0,
      420,
    );
    reply('resize', {height});
  };
  report();
  if (globalThis.ResizeObserver) {
    resizeObserver = new ResizeObserver(report);
    if (doc.documentElement) resizeObserver.observe(doc.documentElement);
    if (doc.body) resizeObserver.observe(doc.body);
  }
}
function normalize(path) {
  const out = [];
  for (const part of String(path || '').replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!out.length) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join('/');
}
function resolve(base, ref) {
  const raw = String(ref || '').trim();
  if (!raw || raw[0] === '#' || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) return null;
  const match = /^([^?#]*)(\?[^#]*)?(#.*)?$/u.exec(raw);
  const target = match?.[1] || '';
  const root = target.startsWith('/');
  const baseDir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  const path = normalize(root ? target.slice(1) : baseDir + target);
  return path && files.has(path) ? {path, suffix:(match?.[2] || '') + (match?.[3] || '')} : null;
}
// IMS Common Cartridge often stores referenced pictures under web_resources/
// while authored pages use LMS-specific URLs, $IMS-CC-FILEBASE$ aliases, or
// percent-encoded relative links. Resolve these to *existing package members*
// only; never fetch remote content or allow an ambiguous filename match.
function resolveBundledMedia(base, reference) {
  const direct=resolve(base,reference);
  if(direct)return direct;
  let raw=String(reference??'').trim();
  if(!raw||raw.startsWith('#')||/^(?:data|blob|javascript|file):/iu.test(raw))return null;
  const suffixMatch=/^([^?#]*)(\?[^#]*)?(#.*)?$/u.exec(raw);
  raw=suffixMatch?.[1]??raw;
  raw=raw.replace(/^\$IMS-CC-(?:FILEBASE|WEB-BASE)\$/iu,'').replace(/^\.\//u,'');
  if(/^(?:https?:)?\/\//iu.test(raw)){
    try{raw=new URL(raw.startsWith('//')?'https:'+raw:raw).pathname;}catch{return null;}
  }
  try{raw=decodeURIComponent(raw);}catch{return null;}
  if(raw.includes('\0')||raw.includes('\\'))return null;
  raw=raw.replace(/^\/+/u,'');
  const isMedia=(key)=>/^(?:image|video|audio|font)\//iu.test(files.get(key)?.mediaType??'') ||
    /\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico|mp3|ogg|wav|mp4|webm|woff2?|ttf|otf)$/iu.test(key);
  const baseDir=base.includes('/')?base.slice(0,base.lastIndexOf('/')+1):'';
  const possibilities=[
    normalize(baseDir+raw),normalize(raw),normalize('web_resources/'+raw),
    normalize('resources/'+raw),normalize('course_files/'+raw)
  ];
  for(const p of possibilities)if(p&&files.has(p)&&isMedia(p))return{path:p,suffix:''};
  const leaf=raw.split('/').at(-1)?.toLowerCase();
  if(!leaf||leaf.length<4)return null;
  const matches=[...files.keys()].filter(p=>isMedia(p)&&p.split('/').at(-1)?.toLowerCase()===leaf);
  return matches.length===1?{path:matches[0],suffix:''}:null;
}
function text(path) {
  return new TextDecoder('utf-8', {fatal:false}).decode(files.get(path).buffer);
}

function cmi5BridgeSource(config) {
  const encoded = JSON.stringify(config).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  return `(()=>{'use strict';
const cfg=${encoded};
const nativeFetch=globalThis.fetch.bind(globalThis);
const EXIT_HASH='#p2lrn-cmi5-exit';
let exitSent=false;
const localReturnURL=()=>String(location.href||'about:srcdoc').replace(/#.*$/,'')+EXIT_HASH;
const requestExit=(reason,returnURL=null)=>{
  if(exitSent)return;
  exitSent=true;
  emit('exit',{reason,returnURL:returnURL||null});
};
const checkExitNavigation=()=>{if(location.hash===EXIT_HASH)requestExit('return-url',location.href);};
addEventListener('hashchange',checkExitNavigation);
try{Object.defineProperty(globalThis,'close',{configurable:true,writable:true,value:()=>requestExit('window.close')});}catch{}
const states=new Map(Object.entries(cfg.initialStates||{}));
const emit=(action,payload={})=>${opaqueRuntime ? 'window' : 'parent'}.postMessage({protocol:'p2lrn-cmi5-preview/1',action,...payload},'*');
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...headers}});
const empty=(status=204,headers={})=>new Response(null,{status,headers});
const inputUrl=(input)=>{try{return new URL(typeof input==='string'?input:input.url,location.href);}catch{return null;}};
const requestMethod=(input,init)=>String(init?.method||(typeof Request!=='undefined'&&input instanceof Request?input.method:'GET')||'GET').toUpperCase();
const requestBody=async(input,init)=>{if(init&&Object.prototype.hasOwnProperty.call(init,'body'))return init.body==null?'':String(init.body);if(typeof Request!=='undefined'&&input instanceof Request){try{return await input.clone().text();}catch{return '';}}return '';};
globalThis.fetch=async(input,init={})=>{
  const url=inputUrl(input);
  if(!url||url.origin!==cfg.syntheticOrigin)return nativeFetch(input,init);
  const method=requestMethod(input,init);
  if(url.href.startsWith(cfg.fetchUrl)&&method==='POST')return json({'auth-token':'p2lrn-preview'});
  if(!url.href.startsWith(cfg.endpoint))return empty(404);
  const resource=url.pathname.slice(new URL(cfg.endpoint).pathname.length).replace(/^\\/+/, '');
  if(resource==='activities/state'){
    const stateId=url.searchParams.get('stateId')||'';
    if(method==='GET'){
      if(stateId==='LMS.LaunchData')return json({...cfg.launchData,returnURL:localReturnURL()});
      return states.has(stateId)?json(states.get(stateId)):empty(404);
    }
    if(method==='PUT'||method==='POST'){
      const raw=await requestBody(input,init);let value=raw;
      try{value=raw?JSON.parse(raw):null;}catch{}
      states.set(stateId,value);emit('state',{stateId,value});return empty(204);
    }
    if(method==='DELETE'){states.delete(stateId);emit('state',{stateId,value:null});return empty(204);}
  }
  if(resource==='agents/profile'){
    if(method==='GET')return empty(404);
    if(method==='PUT'||method==='POST')return empty(204,{'ETag':'"p2lrn-preview"'});
  }
  if(resource==='statements'){
    const raw=await requestBody(input,init);let parsed=null;
    try{parsed=raw?JSON.parse(raw):null;}catch{}
    if(Array.isArray(parsed))emit('statement',{statements:parsed});
    else if(parsed)emit('statement',{statement:parsed});
    return empty(204);
  }
  return empty(404);
};
let ctor=null;
const wrap=(Native)=>{
  if(typeof Native!=='function')return Native;
  function P2LRNCmi5(...args){return Reflect.construct(Native,[cfg.launchUrl,...args.slice(1)],Native);}
  try{Object.setPrototypeOf(P2LRNCmi5,Native);}catch{}
  P2LRNCmi5.prototype=Native.prototype;
  return P2LRNCmi5;
};
Object.defineProperty(globalThis,'Cmi5',{configurable:true,enumerable:true,get(){return ctor;},set(value){ctor=wrap(value);}});
})();`;
}

function stripSourceMapDirectives(source) {
  return String(source)
    .replace(/\/\/[#@]\s*sourceMappingURL=.*$/gmu, '')
    .replace(/\/\*[#@]\s*sourceMappingURL=[\s\S]*?\*\//gmu, '');
}
function rewriteCss(css, base, stack = new Set()) {
  return String(css)
    .replace(/@import\s+(?:url\()?\s*(['"]?)([^'")\s;]+)\1\s*\)?\s*;/giu, (all, _q, ref) => {
      const resolved = resolve(base, ref);
      if (!resolved || stack.has(resolved.path) || !files.get(resolved.path)?.mediaType?.includes('css')) return all;
      const next = new Set(stack); next.add(resolved.path);
      return rewriteCss(text(resolved.path), resolved.path, next);
    })
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/giu, (all, _q, ref) => {
      const resolved = resolveBundledMedia(base, ref);
      return resolved && urls.has(resolved.path) ? `url("${urls.get(resolved.path)}${resolved.suffix}")` : all;
    });
}
function rewriteElementTree(root, path) {
  const attrs = ['src','href','poster','data','background'];
  const elements = root?.querySelectorAll ? [...root.querySelectorAll('*')] : [];
  for (const el of elements) {
    for (const attr of attrs) {
      if (!el.hasAttribute(attr)) continue;
      const raw = el.getAttribute(attr);
      const tag = el.tagName.toLowerCase();
      const direct=resolve(path, raw);
      const resolved=direct??(
        ['img','source','video','audio','track'].includes(tag) &&
        ['src','poster','background'].includes(attr)
          ? resolveBundledMedia(path,raw)
          : null);
      if (!resolved) {
        // External image URLs cannot be loaded by the isolated package CSP.
        // Keep useful alt text visible and accessible rather than a broken
        // image, and never grant imported packages remote network access.
        if (tag === 'img' && attr === 'src' && /^(?:https?:)?\/\//iu.test(String(raw ?? '').trim())) {
          const alt = el.getAttribute('alt');
          if (alt === '') { el.remove(); break; }
          const label = (alt || '').trim() || 'Imagen externa no incluida en el paquete';
          const fallback = document.createElement('span');
          fallback.setAttribute('role', 'img');
          fallback.setAttribute('aria-label', label);
          fallback.setAttribute('data-p2lrn-source-missing', 'external-image');
          fallback.textContent = label;
          fallback.style.cssText = 'display:inline-block;border:1px dashed currentColor;padding:.25em .5em;max-width:100%';
          el.replaceWith(fallback);
          break;
        }
        continue;
      }
      const mt = files.get(resolved.path)?.mediaType || '';
      if ((tag === 'a' || tag === 'area') && (mt.includes('html') || mt.includes('xhtml'))) {
        el.setAttribute(attr, '#');
        el.setAttribute('data-p2lrn-member', resolved.path);
        continue;
      }
      if ((tag === 'iframe' || tag === 'frame') && (mt.includes('html') || mt.includes('xhtml'))) {
        el.removeAttribute(attr);
        el.setAttribute('data-p2lrn-frame-member', resolved.path);
        continue;
      }
      if (urls.has(resolved.path)) el.setAttribute(attr, urls.get(resolved.path) + resolved.suffix);
    }
    if (el.hasAttribute('style')) el.setAttribute('style', rewriteCss(el.getAttribute('style'), path));
    if (el.hasAttribute('srcset')) {
      el.setAttribute('srcset', el.getAttribute('srcset').split(',').map((item) => {
        const bits = item.trim().split(/\s+/);
        const resolved = resolveBundledMedia(path, bits[0]);
        if (resolved && urls.has(resolved.path)) bits[0] = urls.get(resolved.path) + resolved.suffix;
        return bits.join(' ');
      }).join(', '));
    }
  }
  for (const style of root?.querySelectorAll?.('style') ?? []) style.textContent = rewriteCss(style.textContent || '', path);
  for (const template of root?.querySelectorAll?.('template') ?? []) rewriteElementTree(template.content, path);
}
// Strip inline event attributes BEFORE passing untrusted HTML to DOMParser.
// Chromium may report an inline-handler CSP violation when parsing inert HTML,
// even if the attribute is removed before mounting. A bounded lexical scan
// rewrites attributes only in actual opening tags (not in script bodies,
// quoted attribute values, comments or raw CSS). The original handler source
// remains inert data until isolated Blob-backed listeners are registered.
function neutralizeEventHandlerMarkup(value) {
  const html=String(value??'');
  const lower=html.toLowerCase();
  let result='',position=0;
  while(position<html.length){
    const lt=html.indexOf('<',position);
    if(lt<0){result+=html.slice(position);break;}
    result+=html.slice(position,lt);
    if(html.startsWith('<!--',lt)){
      const end=html.indexOf('-->',lt+4);
      if(end<0){result+=html.slice(lt);break;}
      result+=html.slice(lt,end+3);position=end+3;continue;
    }
    const opening=/^<([a-z][a-z0-9:.-]*)/i.exec(html.slice(lt,lt+150));
    if(!opening){result+='<';position=lt+1;continue;}
    const name=opening[1].toLowerCase();
    let e=lt+opening[0].length,quote='';
    for(;e<html.length;e++){
      const c=html[e];
      if(quote){if(c===quote)quote='';}
      else if(c==='"'||c==="'")quote=c;
      else if(c==='>')break;
    }
    if(e===html.length){result+=html.slice(lt);break;}
    const tag=html.slice(lt,e+1);
    let k=opening[0].length;
    let safe=tag.slice(0,k);
    while(k<tag.length-1){
      if(/[\s/]/u.test(tag[k])){safe+=tag[k++];continue;}
      const start=k;
      while(k<tag.length-1&&!/[\s=\/<>]/u.test(tag[k]))k++;
      if(k===start){safe+=tag[k++];continue;}
      const attr=tag.slice(start,k);
      let equal=k;
      while(equal<tag.length-1&&/\s/u.test(tag[equal]))equal++;
      const hasValue=tag[equal]==='=';
      safe+=(hasValue&&/^on[a-z][a-z0-9]*$/iu.test(attr))
        ? 'data-p2lrn-legacy-'+attr.toLowerCase():attr;
      if(hasValue){
        safe+=tag.slice(k,equal+1);k=equal+1;
        while(k<tag.length-1&&/\s/u.test(tag[k]))safe+=tag[k++];
        if(tag[k]==='"'||tag[k]==="'"){
          const q=tag[k];safe+=tag[k++];
          while(k<tag.length-1){const c=tag[k++];safe+=c;if(c===q)break;}
        }else while(k<tag.length-1&&!/\s/u.test(tag[k]))safe+=tag[k++];
      }
    }
    result+=safe+'>';position=e+1;
    if(name==='script'||name==='style'||name==='textarea'){
      const close=lower.indexOf('</'+name,position);
      if(close>=0){result+=html.slice(position,close);position=close;}
    }
  }
  return result;
}
function rewriteDeferredMarkup(doc, path) {
  const templateTypes = new Set(['text/template','text/x-template','text/html','application/x-template']);
  for (const script of doc.querySelectorAll('script:not([src])')) {
    const type = String(script.getAttribute('type') || '').trim().toLowerCase();
    if (!templateTypes.has(type)) continue;
    const holder = doc.createElement('template');
    holder.innerHTML = neutralizeEventHandlerMarkup(script.textContent || '');
    rewriteElementTree(holder.content, path);
    script.textContent = holder.innerHTML;
  }
}
function rewriteHtml(path) {
  const doc = new DOMParser().parseFromString(neutralizeEventHandlerMarkup(text(path)), 'text/html');
  doc.querySelectorAll('base').forEach((node) => node.remove());
  // Never mount on* HTML attributes under a restrictive inherited CSP:
  // preserve their source as inert data until a sandbox-local blob registers
  // the equivalent event listeners.
  for(const el of doc.querySelectorAll('*')){
    for(const attr of [...el.attributes]){
      const name=attr.name.toLowerCase();
      if(!/^on[a-z][a-z0-9]*$/.test(name))continue;
      el.setAttribute('data-p2lrn-legacy-'+name,attr.value);
      el.removeAttribute(attr.name);
    }
  }
  const csp = doc.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'unsafe-inline' blob:; img-src blob: data:; media-src blob: data:; font-src blob: data:; frame-src blob: data: about:; connect-src blob:; form-action 'none'; base-uri 'none'; object-src 'none';";
  if (!doc.querySelector('meta[name="viewport"]')) {
    const viewport = doc.createElement('meta');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width,initial-scale=1';
    doc.head?.append(viewport);
  }
  const fit = doc.createElement('style');
  fit.setAttribute('data-p2lrn-runtime-fit', '1');
  fit.textContent = 'html,body{max-width:100%;min-width:0;overflow-x:auto}*,*::before,*::after{box-sizing:border-box}img,video,canvas,svg{max-width:100%;height:auto}iframe,object,embed,table,pre{max-width:100%}';
  doc.head?.append(fit);
  doc.head?.prepend(csp);
  if (runtimeProfile === 'https://p2lrn.org/profile/cmi5' && cmi5Config) {
    const bridge = doc.createElement('script');
    bridge.setAttribute('data-p2lrn-cmi5-bridge', '1');
    bridge.textContent = cmi5BridgeSource(cmi5Config);
    csp.after(bridge);
  }
  for (const script of doc.querySelectorAll('script:not([src])')) {
    const type = String(script.getAttribute('type') || '').trim().toLowerCase();
    if (['text/template','text/x-template','text/html','application/x-template'].includes(type)) continue;
    script.textContent = stripSourceMapDirectives(script.textContent || '');
  }
  rewriteElementTree(doc, path);
  rewriteDeferredMarkup(doc, path);
  return '<!doctype html>' + doc.documentElement.outerHTML;
}
function wireDocument(doc, path) {
  if (!doc) return;
  // Nested srcdoc frames are separate Document objects: observe and wire
  // handlers in their OWN sandboxed context. The outer MutationObserver cannot
  // see attributes or generated elements inside a child document.
  observeLegacyHandlers(doc);
  void installLegacyInlineHandlers(doc).catch(error=>
    reply('error',{message:'Legacy document handlers: '+String(error?.message??error)}));
  doc.addEventListener('click', (event) => {
    const anchor = event.target?.closest?.('a,area');
    if (!anchor) return;
    const member = anchor.getAttribute('data-p2lrn-member');
    if (member) {
      event.preventDefault();
      void navigate(member);
      return;
    }
    const href = anchor.getAttribute('href') || '';
    if (href && href !== '#' && !href.startsWith('#')) {
      event.preventDefault();
      reply('blocked-navigation', {href, member:path});
    }
  });
  for (const frame of doc.querySelectorAll('[data-p2lrn-frame-member]')) {
    const member = frame.getAttribute('data-p2lrn-frame-member');
    try {
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads');
      frame.srcdoc = rewriteHtml(member);
      frame.addEventListener('load', () => wireDocument(frame.contentDocument, member), {once:true});
    } catch {}
  }
}
async function installLegacyInlineHandlers(root) {
  const ownerDoc=root.nodeType===9?root:(root.ownerDocument??document);
  // Existing cmi5/IMS packages may rely on onclick/onchange HTML attributes.
  // A strict embedding CSP blocks those attributes even though package JS
  // runs in a sandboxed opaque-origin iframe. Convert them to blob-backed
  // listeners INSIDE that iframe, never in the host application.
  const handlers=[];
  const onLoadElements=[];
  let bytes=0;
  for(const el of root.querySelectorAll('*')) {
    let id=null;
    for(const attribute of [...el.attributes]) {
      const name=attribute.name.toLowerCase();
      const handlerName=name.startsWith('data-p2lrn-legacy-on')
        ? name.slice('data-p2lrn-legacy-'.length) : name;
      if(!/^on[a-z][a-z0-9]*$/.test(handlerName))continue;
      const source=attribute.value;
      el.removeAttribute(attribute.name);
      bytes+=source.length;
      legacyHandlerBytes+=source.length;
      legacyHandlersInstalled++;
      if(++inlineScriptId>5000||bytes>512*1024||
          legacyHandlersInstalled>5000||legacyHandlerBytes>512*1024)
        throw new Error('External package has too many legacy event handlers.');
      if(!id){
        id='p2lrn-legacy-'+inlineScriptId;
        el.setAttribute('data-p2lrn-legacy-id',id);
      }
      handlers.push({id,eventName:handlerName.slice(2),source});
      if(handlerName==='onload'&&(el===ownerDoc.body||el===ownerDoc.documentElement))
        onLoadElements.push(el);
    }
  }
  if(!handlers.length)return;
  const source=handlers.map(handler=>{
    const selector=JSON.stringify('[data-p2lrn-legacy-id="'+handler.id+'"]');
    const eventName=JSON.stringify(handler.eventName);
    // The source is deliberately executable, just like scripts in the
    // supplied package, but it never crosses the allow-scripts opaque sandbox.
    return '(function(){const node=document.querySelector('+selector+');if(!node)return;'+
      'node.addEventListener('+eventName+',function(event){'+
      'const result=(function(event){\n'+handler.source+'\n}).call(this,event);'+
      'if(result===false){event.preventDefault();event.stopPropagation();}'+
      '});})();';
  }).join('\n');
  const src=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  urls.set('p2lrn-events-'+(++inlineScriptId),src);
  const script=ownerDoc.createElement('script');
  script.src=src;
  await new Promise((resolve,reject)=>{
    script.addEventListener('load',resolve,{once:true});
    script.addEventListener('error',()=>reject(new Error('External package legacy events failed to initialize.')),{once:true});
    ownerDoc.head.append(script);
  });
  for(const el of onLoadElements)el.dispatchEvent(new Event('load'));
}

// Content may create legacy on* attributes using document.write, innerHTML or
// dynamic DOM APIs AFTER the initial HTML was inspected. A MutationObserver
// converts those attributes to blob-backed event listeners. This works under
// the existing strict CSP; it never enables unsafe-inline, eval, same-origin,
// remote networking, forms, or privileges in the host page.
function observeLegacyHandlers(doc=document) {
  if(legacyHandlerObservers.has(doc))return;
  let queued=false;
  let pending=Promise.resolve();
  const schedule=()=>{
    if(queued)return;
    queued=true;
    pending=pending.then(async()=>{
      queued=false;
      await installLegacyInlineHandlers(doc);
    }).catch(error=>{
      queued=false;
      reply('error',{message:'Dynamic legacy handlers: '+String(error?.message??error)});
    });
  };
  const Observer=doc.defaultView?.MutationObserver??MutationObserver;
  const observer=new Observer(mutations=>{
    if(mutations.some(m=>
      (m.type==='attributes' && /^(?:on[a-z][a-z0-9]*|data-p2lrn-legacy-on[a-z][a-z0-9]*)$/i.test(m.attributeName??'')) ||
      (m.type==='childList' && [...m.addedNodes].some(n=>n.nodeType===1))
    ))schedule();
  });
  observer.observe(doc,{subtree:true,childList:true,attributes:true});
  legacyHandlerObservers.set(doc,observer);
}
function makeUrls() {
  for (const [path, file] of files) {
    if (file.mediaType.includes('html') || file.mediaType.includes('xhtml') || file.mediaType.includes('css')) continue;
    urls.set(path, URL.createObjectURL(new Blob([file.mediaType.includes('javascript') ? stripSourceMapDirectives(text(path)) : file.buffer], {type:file.mediaType || 'application/octet-stream'})));
  }
  for (const [path, file] of files) {
    if (!file.mediaType.includes('css')) continue;
    urls.set(path, URL.createObjectURL(new Blob([rewriteCss(text(path), path, new Set([path]))], {type:'text/css'})));
  }
}
function splitReference(value) {
  const raw = String(value || '').trim();
  const match = /^([^?#]*)(\?[^#]*)?(#.*)?$/u.exec(raw);
  return {path:normalize(match?.[1] || ''), suffix:String(match?.[2] || '') + String(match?.[3] || '')};
}
async function navigate(path, suffix = '') {
  const parsed = splitReference(path);
  const normalized = parsed.path;
  const launchSuffix = suffix || parsed.suffix;
  if (!normalized || !files.has(normalized)) throw new Error(`Package launch member not found: ${path}`);
  const media = files.get(normalized).mediaType || '';
  if (!media.includes('html') && !media.includes('xhtml')) throw new Error(`Package launch member is not HTML/XHTML: ${normalized}`);
  if (opaqueRuntime) {
    const parsed = new DOMParser().parseFromString(rewriteHtml(normalized), 'text/html');
    document.head.replaceChildren(...[...parsed.head.childNodes].map(node => document.importNode(node, true)));
    document.body.replaceChildren(...[...parsed.body.childNodes].map(node => document.importNode(node, true)));
    wireDocument(document, normalized);
    // Install before executing any untrusted package script so that handlers
    // added during script initialization are registered without inline CSP.
    observeLegacyHandlers();
    for (const old of [...document.querySelectorAll('script')]) {
      // DOMParser scripts are inert. An opaque srcdoc frame inherits the
      // embedding document's CSP, which may prohibit inline JavaScript.
      const script = document.createElement('script');
      for (const attr of [...old.attributes]) script.setAttribute(attr.name, attr.value);
      const type=String(old.getAttribute('type')??'').trim().toLowerCase();
      if (!old.hasAttribute('src') &&
          (!type || ['module','text/javascript','application/javascript','text/ecmascript','application/ecmascript'].includes(type))) {
        const scriptUrl=URL.createObjectURL(new Blob([old.textContent??''],{type:'text/javascript'}));
        urls.set('p2lrn-inline-'+(++inlineScriptId),scriptUrl);
        script.setAttribute('src',scriptUrl);
      } else if (!old.hasAttribute('src')) script.textContent = old.textContent;
      const waits = script.hasAttribute('src') && !script.hasAttribute('async');
      const loaded = waits ? new Promise((resolve, reject) => {
        script.addEventListener('load', resolve, {once:true});
        script.addEventListener('error', () => reject(new Error('Package script failed: ' + (old.getAttribute('src')??'inline script'))), {once:true});
      }) : null;
      old.replaceWith(script);
      if (loaded) await loaded;
    }
    await installLegacyInlineHandlers(document);
    reply('ready', {member:normalized, suffix:launchSuffix, topology:'opaque-inline'});
    return;
  }
  const iframe = document.createElement('iframe');
  iframe.id = 'content';
  iframe.title = 'External package content';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.addEventListener('load', () => {
    try { wireDocument(iframe.contentDocument, normalized); } catch {}
    observeContentFrame(iframe);
    reply('ready', {member:normalized, suffix:launchSuffix});
  }, {once:true});
  iframe.srcdoc = rewriteHtml(normalized);
  if (launchSuffix) iframe.dataset.p2lrnLaunchSuffix = launchSuffix;
  stage.replaceChildren(iframe);
}
async function initialize(data) {
  if (active) return;
  active = true;
  runtimeProfile = typeof data.profile === 'string' ? data.profile : null;
  cmi5Config = data.cmi5 && typeof data.cmi5 === 'object' ? data.cmi5 : null;
  let total = 0;
  for (const file of data.files || []) {
    if (!file || typeof file.path !== 'string' || !(file.buffer instanceof ArrayBuffer)) continue;
    const path = normalize(file.path);
    if (!path || files.has(path)) continue;
    total += file.buffer.byteLength;
    if (total > 512 * 1024 * 1024) throw new Error('External package runtime payload exceeds 512 MiB.');
    files.set(path, {mediaType:String(file.mediaType || 'application/octet-stream'), buffer:file.buffer});
  }
  makeUrls();
  await navigate(String(data.launchMember || ''), String(data.launchSuffix || ''));
  reply('initialized', {files:files.size, profile:data.profile ?? null, member:String(data.launchMember || ''), suffix:String(data.launchSuffix || '')});
}
function onMessage(event) {
  const data = event.data;
  if (!data || data.protocol !== PROTOCOL) return;
  if (data.action === 'init') void initialize(data).catch((error) => { fatal(error?.message || String(error)); reply('error', {message:String(error?.message || error)}); });
  if (data.action === 'navigate' && active) void navigate(String(data.launchMember || '')).catch((error) => reply('error', {message:String(error?.message || error)}));
}
window.addEventListener('message', (event) => {
  const data = event.data;
  const content = stage.querySelector('#content');
  if (((opaqueRuntime && event.source === window) || (content && event.source === content.contentWindow)) && data?.protocol === CMI5_PROTOCOL) {
    if (data.action === 'statement') reply('cmi5-statement', {statement:data.statement ?? null, statements:Array.isArray(data.statements) ? data.statements : null});
    else if (data.action === 'state') reply('cmi5-state', {stateId:data.stateId ?? null, value:data.value ?? null});
    else if (data.action === 'exit') reply('cmi5-exit', {reason:data.reason ?? 'course-request', returnURL:data.returnURL ?? null});
    return;
  }
  const p = event.ports?.[0] ?? null;
  if (channel || event.source !== parent || !data || data.protocol !== PROTOCOL || data.action !== 'connect' || !p) return;
  channel = p;
  channelSend = p.postMessage.bind(p);
  channel.onmessage = onMessage;
  channel.start?.();
  reply('connected');
});
window.addEventListener('unload', () => { try { resizeObserver?.disconnect?.(); } catch {} try { channel?.close?.(); } catch {} for (const url of urls.values()) try { URL.revokeObjectURL(url); } catch {} });
parent.postMessage({protocol:PROTOCOL, action:'shell-ready'}, '*');


}
