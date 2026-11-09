// Resolve only inventory-verified resources of an imported HTML package member.
// Everything is rewritten to short-lived blob URLs inside a scripts-disabled
// opaque iframe; no remote loader, network permissions or host-origin access.
const decoder=new TextDecoder('utf-8',{fatal:false});
const MAX_ASSETS=500;
const MAX_ASSET_BYTES=128*1024*1024;

const EXT_TYPES=Object.freeze({
 '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif',
 '.webp':'image/webp','.svg':'image/svg+xml','.avif':'image/avif','.ico':'image/x-icon',
 '.css':'text/css','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf',
 '.otf':'font/otf','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg',
 '.mp4':'video/mp4','.webm':'video/webm','.pdf':'application/pdf',
});
function assetType(path){
 const lower=String(path).toLowerCase();
 return EXT_TYPES[lower.slice(lower.lastIndexOf('.'))]??'application/octet-stream';
}
function resolveMember(base,ref,names){
 let value=String(ref??'').trim();
 if(!value||value.startsWith('#')||/^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(value))return null;
 const matched=/^([^?#]*)(\?[^#]*)?(#.*)?$/u.exec(value);
 let target=matched?.[1]??'';
 if(!target)return null;
 const ims=/^\$IMS-CC-FILEBASE\$\//iu.exec(target);
 let absolute=target.startsWith('/');
 if(ims){target='web_resources/'+target.slice(ims[0].length);absolute=true;}
 try{target=decodeURIComponent(target);}catch{return null;}
 const directory=base.includes('/')?base.slice(0,base.lastIndexOf('/')+1):'';
 const out=[];
 for(const part of (absolute?target.replace(/^\//u,''):directory+target).replace(/\\/gu,'/').split('/')){
   if(!part||part==='.')continue;
   if(part==='..'){if(!out.length)return null;out.pop();continue;}
   if(/[\x00-\x1f]/u.test(part))return null;
   out.push(part);
 }
 const normalized=out.join('/');
 if(!normalized||!names.has(normalized))return null;
 const suffix=String(matched?.[3]??'');
 return {path:normalized,suffix};
}
async function replaceAsync(text,pattern,replacer){
 const matches=[...String(text).matchAll(pattern)];
 if(!matches.length)return text;
 let end=0,out='';
 for(const match of matches){
   const i=match.index;
   out+=text.slice(end,i)+await replacer(match);
   end=i+match[0].length;
 }
 return out+text.slice(end);
}
export async function rewriteImportedHtmlAssets({html,member,nested}){
 if(!nested?.read||!nested?.names)throw new Error('Imported HTML is missing its source package inventory.');
 const names=new Set(nested.names());
 if(!names.has(member))throw new Error('Imported HTML member is missing from source package: '+member);
 const objects=[],cached=new Map(),missingAssets=new Set();
 let used=0,loaded=0;
 const resolution=(base,ref)=>resolveMember(base,ref,names);
 async function makeResource(path,depth=0){
   if(depth>16)return null;
   if(cached.has(path))return cached.get(path);
   const promise=(async()=>{
     if(++loaded>MAX_ASSETS)throw new Error('Imported HTML references too many assets.');
     const bytes=await nested.read(path);
     used+=bytes.byteLength;
     if(used>MAX_ASSET_BYTES)throw new Error('Imported HTML assets exceed the 128 MiB preview limit.');
     let content=bytes;
     if(assetType(path)==='text/css'){
       content=await rewriteCss(decoder.decode(bytes),path,depth+1);
     }
     // Passive HTML runs with an opaque origin and scripts disabled. Chrome
     // cannot dereference host-origin blob URLs from that storage partition.
     // data: embeds stay self-contained without any network or JS permission.
     const blob=new Blob([content],{type:assetType(path)});
     const url=await new Promise((resolve,reject)=>{
       const reader=new FileReader();
       reader.addEventListener('load',()=>resolve(String(reader.result)),{once:true});
       reader.addEventListener('error',()=>reject(reader.error||new Error('Unable to embed imported asset')),{once:true});
       reader.readAsDataURL(blob);
     });
     return url;
   })();
   cached.set(path,promise);
   return promise;
 }
 async function hrefFor(base,ref,depth=0){
   const found=resolution(base,ref);
   if(!found)return null;
   return (await makeResource(found.path,depth+1))+found.suffix;
 }
 async function rewriteCss(css,base,depth=0){
   if(depth>16)return css;
   css=await replaceAsync(css,/@import\s+(?:url\(\s*)?(['"]?)([^'"\)\s;]+)\1\s*\)?\s*;/giu,async m=>{
     const ref=resolution(base,m[2]);
     if(!ref||assetType(ref.path)!=='text/css'||cached.has(ref.path))return m[0];
     // Inlining ensures relative URLs are resolved from the imported sheet,
     // not from a blob URL with no meaningful relative directory.
     cached.set(ref.path,Promise.resolve(null));
     const buffer=await nested.read(ref.path);
     used+=buffer.byteLength;
     if(used>MAX_ASSET_BYTES)throw new Error('Imported CSS exceeds the 128 MiB preview limit.');
     return await rewriteCss(decoder.decode(buffer),ref.path,depth+1);
   });
   return replaceAsync(css,/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/giu,async m=>{
     const url=await hrefFor(base,m[2],depth+1);
     return url?'url("'+url+'")':m[0];
   });
 }
 const doc=new DOMParser().parseFromString(String(html),'text/html');
 doc.querySelectorAll('base').forEach(el=>el.remove());
 const attrs=['src','poster','background'];
 for(const node of doc.querySelectorAll('*')){
   const tag=node.tagName.toLowerCase();
   if(tag==='script')continue; // renderer is intentionally scripts-disabled
   let replaced=false;
   for(const attr of attrs){
     if(!node.hasAttribute(attr))continue;
     const original=node.getAttribute(attr);
     const url=await hrefFor(member,original);
     if(url){node.setAttribute(attr,url);continue;}
     if(tag!=='img'||attr!=='src'||!original||/^(?:data:|blob:)/iu.test(original))continue;
     const path=String(original).split(/[?#]/u,1)[0];
     missingAssets.add(path);
     const description=(node.getAttribute('alt')||'').trim();
     if(/(?:divider|separador|ornament|decorativ)/iu.test(description)){
       const separator=doc.createElement('hr');
       separator.setAttribute('data-p2lrn-source-missing',path);
       separator.setAttribute('aria-label',description||'Separador visual');
       separator.style.cssText='height:2px;border:0;background:currentColor;opacity:.2;margin:1.25em 0';
       node.replaceWith(separator);
     }else{
       const fallback=doc.createElement('span');
       fallback.setAttribute('role','img');
       fallback.setAttribute('aria-label',description||'Imagen no incluida en el paquete');
       fallback.setAttribute('data-p2lrn-source-missing',path);
       fallback.textContent=description||'Imagen no incluida en el paquete';
       fallback.style.cssText='display:inline-block;border:1px dashed #888;padding:.25em .5em;color:inherit';
       node.replaceWith(fallback);
     }
     replaced=true;
     break;
   }
   if(replaced)continue;
   if(tag==='link'&&/stylesheet/i.test(node.getAttribute('rel')??'')){
     const url=await hrefFor(member,node.getAttribute('href'));
     if(url)node.setAttribute('href',url);
   }
   if(node.hasAttribute('style'))
     node.setAttribute('style',await rewriteCss(node.getAttribute('style'),member));
   if(node.hasAttribute('srcset')){
     const entries=String(node.getAttribute('srcset')).split(',');
     const rewritten=[];
     for(const entry of entries){
       const parts=entry.trim().split(/\s+/u),url=await hrefFor(member,parts[0]);
       if(url)parts[0]=url;
       rewritten.push(parts.join(' '));
     }
     node.setAttribute('srcset',rewritten.join(', '));
   }
 }
 for(const style of doc.querySelectorAll('style'))
   style.textContent=await rewriteCss(style.textContent??'',member);
 return {html:'<!doctype html>\n'+doc.documentElement.outerHTML,urls:objects,missingAssets:[...missingAssets]};
}
