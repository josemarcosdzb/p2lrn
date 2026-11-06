import {studioDropRuntimeSource} from './lesson-drop-runtime.js';

// Opt-in for a Studio-created drag-and-drop lesson only; ordinary HTML retains
// the existing script-disabled iframe. No script from package content is kept.
export function prepareStudioDropSandbox(text){
  const doc=new DOMParser().parseFromString(String(text),'text/html');
  if(!doc.querySelector('[data-p2lrn-dnd="1"][data-p2lrn-layout="drag-drop"]'))return null;
  doc.querySelectorAll('script,iframe,frame,frameset,object,embed,form,input,button,select,textarea,meta,base,link,style,svg,math,template,portal,foreignObject')
    .forEach(node=>node.remove());
  const allowed=new Set([
    'html','head','body','main','article','section','header','footer','nav','aside',
    'h1','h2','h3','h4','h5','h6','p','div','span','br','hr','blockquote',
    'strong','b','em','i','u','s','del','ins','mark','small','sub','sup','pre','code',
    'ul','ol','li','dl','dt','dd','figure','figcaption','table','thead','tbody',
    'tfoot','tr','th','td','caption','a','img','audio','video','source','picture',
    'details','summary','time','q','abbr',
  ]);
  const attributes=new Set([
    'class','id','title','alt','width','height','style','href','src','poster',
    'controls','muted','loop','playsinline','preload','target','rel','colspan',
    'rowspan','scope','align','dir','lang','start','type','reversed','value','open',
    'role','loading','decoding','datetime','cite',
  ]);
  for(const node of [...doc.querySelectorAll('*')]){
    const tag=node.localName.toLowerCase();
    if(!allowed.has(tag)){
      if(!['html','head','body'].includes(tag))
        node.replaceWith(doc.createTextNode(node.textContent??''));
      continue;
    }
    for(const attr of [...node.attributes]){
      const key=attr.name.toLowerCase(),value=attr.value.trim();
      if(key.startsWith('on')||['nonce','srcdoc','srcset','xlink:href'].includes(key)||
         (!attributes.has(key)&&!key.startsWith('aria-')&&!key.startsWith('data-'))){
        node.removeAttribute(attr.name);continue;
      }
      if(key==='style'&&/(?:url\s*\(|image-set\s*\(|expression\s*\(|@import|behavior\s*:|-moz-binding|position\s*:\s*(?:fixed|sticky)|z-index\s*:|\\)/i.test(value)){
        node.removeAttribute(attr.name);continue;
      }
      if(['href','src','poster'].includes(key)){
        const dataImage=key==='src'&&tag==='img'&&/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[a-z0-9+/=]+$/i.test(value);
        const fragment=key==='href'&&/^#[\w-]+$/.test(value);
        const simpleContact=key==='href'&&/^(?:mailto:[^<>\s]+|tel:[+\d -]+)$/i.test(value);
        let http=false;
        if(!dataImage&&!fragment&&!simpleContact&&!/[\u0000-\u001f\u007f]/u.test(value)&&!value.startsWith('//')&&!value.startsWith('\\')){
          try{http=['http:','https:'].includes(new URL(value,'https://p2lrn.invalid/').protocol);}catch{}
        }
        if(!dataImage&&!fragment&&!simpleContact&&!http)node.removeAttribute(attr.name);
      }
      if(key==='target'&&!['_self','_blank'].includes(value))node.removeAttribute(attr.name);
    }
    if(tag==='a'&&node.getAttribute('target')==='_blank')
      node.setAttribute('rel','noopener noreferrer');
  }
  const bytes=new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  const nonce=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
  const policy=[
    "default-src 'none'",
    "img-src data: blob:",
    "media-src data: blob:",
    "style-src 'unsafe-inline'",
    "font-src data:",
    "script-src 'nonce-"+nonce+"'",
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
  const meta=doc.createElement('meta');
  meta.httpEquiv='Content-Security-Policy';
  meta.content=policy;
  doc.head.prepend(meta);
  // This is the only script in the resulting document and it originates from
  // Player code. The iframe has allow-scripts but NO allow-same-origin.
  const script=doc.createElement('script');
  script.setAttribute('nonce',nonce);
  script.textContent=studioDropRuntimeSource;
  doc.body.append(script);
  return {interactive:true,html:'<!doctype html>\n'+doc.documentElement.outerHTML};
}
