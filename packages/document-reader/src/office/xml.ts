function escapeRegex(value:string):string{return value.replace(/[^A-Za-z0-9_]/g,'\\$&');}
export function xmlDecode(value:string):string{
  return value.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_m,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_m,n)=>String.fromCodePoint(parseInt(n,16)));
}
export function xmlText(xml:string,tags:string[]=['w:t','a:t','t']):string{
  const escaped=tags.map(escapeRegex).join('|');
  const re=new RegExp('<(?:'+escaped+')\\b[^>]*>([\\s\\S]*?)<\\/(?:'+escaped+')>','gi');
  return [...xml.matchAll(re)].map(m=>xmlDecode(m[1]??'')).join(' ').replace(/\s+/g,' ').trim();
}
export function attr(xmlOrAttrs:string,name:string):string|undefined{
  const escaped=escapeRegex(name);
  return xmlDecode(xmlOrAttrs.match(new RegExp('(?:^|\\s)'+escaped+'="([^"]*)"','i'))?.[1]??'')||undefined;
}
export function blocks(xml:string,tag:string):Array<{xml:string;index:number}>{
  const escaped=escapeRegex(tag);
  const re=new RegExp('<'+escaped+'\\b[\\s\\S]*?<\\/'+escaped+'>','gi');
  return [...xml.matchAll(re)].map(m=>({xml:m[0],index:m.index??0}));
}
export function compact<T extends Record<string,unknown>>(value:T):Partial<T>{
  return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined&&v!==null&&v!=='')) as Partial<T>;
}
export function normalizeOfficePath(sourcePath:string,target:string):string{
  if(target.startsWith('/'))return target.slice(1).replace(/\\/g,'/');
  const base=sourcePath.split('/');base.pop();
  for(const part of target.replace(/\\/g,'/').split('/')){
    if(!part||part==='.')continue;
    if(part==='..')base.pop();else base.push(part);
  }
  return base.join('/');
}
export function officeRelationships(xml:string,sourcePath:string):Map<string,string>{
  const out=new Map<string,string>();
  for(const match of xml.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/gi)){
    const attrs=match[1]??'',id=attr(attrs,'Id'),target=attr(attrs,'Target');if(!id||!target)continue;
    out.set(id,normalizeOfficePath(sourcePath,target));
  }
  return out;
}
export function guessImageMediaType(path:string):string{
  const ext=path.toLowerCase().split('.').pop();
  return ext==='png'?'image/png':ext==='jpg'||ext==='jpeg'?'image/jpeg':ext==='gif'?'image/gif':ext==='webp'?'image/webp':ext==='svg'?'image/svg+xml':ext==='bmp'?'image/bmp':ext==='tif'||ext==='tiff'?'image/tiff':'application/octet-stream';
}
