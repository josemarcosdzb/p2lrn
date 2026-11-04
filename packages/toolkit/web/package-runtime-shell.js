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
      const resolved = resolve(base, ref);
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
      const resolved = resolve(path, raw);
      if (!resolved) continue;
      const tag = el.tagName.toLowerCase();
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
        const resolved = resolve(path, bits[0]);
        if (resolved && urls.has(resolved.path)) bits[0] = urls.get(resolved.path) + resolved.suffix;
        return bits.join(' ');
      }).join(', '));
    }
  }
  for (const style of root?.querySelectorAll?.('style') ?? []) style.textContent = rewriteCss(style.textContent || '', path);
  for (const template of root?.querySelectorAll?.('template') ?? []) rewriteElementTree(template.content, path);
}
function rewriteDeferredMarkup(doc, path) {
  const templateTypes = new Set(['text/template','text/x-template','text/html','application/x-template']);
  for (const script of doc.querySelectorAll('script:not([src])')) {
    const type = String(script.getAttribute('type') || '').trim().toLowerCase();
    if (!templateTypes.has(type)) continue;
    const holder = doc.createElement('template');
    holder.innerHTML = script.textContent || '';
    rewriteElementTree(holder.content, path);
    script.textContent = holder.innerHTML;
  }
}
function rewriteHtml(path) {
  const doc = new DOMParser().parseFromString(text(path), 'text/html');
  doc.querySelectorAll('base').forEach((node) => node.remove());
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
