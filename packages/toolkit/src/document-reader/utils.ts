let sequence=0;
export function readerId(prefix:string):string {
  sequence=(sequence+1)%0x7fffffff;
  return `${prefix}_${sequence.toString(36)}`;
}

export function extensionOf(name:string):string {
  const clean=String(name||'').split(/[?#]/,1)[0]??'';
  const i=clean.lastIndexOf('.');
  return i>=0?clean.slice(i+1).toLowerCase():'';
}

export function decodeXml(value:string):string {
  return String(value)
    .replace(/&nbsp;/g,' ')
    .replace(/&amp;/g,'&')
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"')
    .replace(/&apos;/g,"'")
    .replace(/&#(\d+);/g,(_,code)=>String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi,(_,code)=>String.fromCharCode(parseInt(code,16)));
}

export function cleanText(value:string):string {
  return decodeXml(value)
    .replace(/\r/g,'')
    .replace(/[ \t]+/g,' ')
    .replace(/ *\n */g,'\n')
    .trim();
}

export function xmlText(value:string):string {
  return cleanText(
    String(value)
      .replace(/<(?:w:)?(?:br|cr)[^>]*\/>/gi,'\n')
      .replace(/<(?:w:)?tab[^>]*\/>/gi,'\t')
      .replace(/<[^>]+>/g,' '),
  );
}

export function mediaTypeForAsset(path:string):string|undefined {
  const ext=extensionOf(path);
  return ({
    png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',
    webp:'image/webp',svg:'image/svg+xml',bmp:'image/bmp',tif:'image/tiff',tiff:'image/tiff',
    emf:'image/emf',wmf:'image/wmf'
  } as Record<string,string>)[ext];
}

export function normalizeZipRelative(base:string,target:string):string {
  const root=base.split('/').slice(0,-1);
  const out=[...root];
  for(const part of String(target).replace(/\\/g,'/').split('/')){
    if(!part||part==='.') continue;
    if(part==='..') out.pop(); else out.push(part);
  }
  return out.join('/');
}

export function xmlAttributes(tag:string):Record<string,string> {
  return Object.fromEntries(
    [...String(tag).matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)]
      .map(([,name,value])=>[String(name).toLowerCase(),decodeXml(String(value))]),
  );
}
