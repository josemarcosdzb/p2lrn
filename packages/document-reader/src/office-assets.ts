import {createHash} from 'node:crypto';
import type {ExtractedAsset, ReaderOptions} from './types.js';
import {nextId} from './utils.js';

const EMU_PER_PIXEL_96=9525;

function normalizePath(value:string){
  return value.replace(/^\/+/, '').replace(/\\/g,'/').replace(/\/\.\//g,'/');
}
function dirname(value:string){const v=normalizePath(value);const i=v.lastIndexOf('/');return i>=0?v.slice(0,i):'';}
function join(...parts:string[]){
  const stack:string[]=[];
  for(const part of parts.join('/').replace(/\\/g,'/').split('/')){
    if(!part||part==='.')continue;
    if(part==='..'){stack.pop();continue;}
    stack.push(part);
  }
  return stack.join('/');
}
function relsPath(path:string){const i=path.lastIndexOf('/');const dir=i>=0?path.slice(0,i):'';const base=i>=0?path.slice(i+1):path;return dir+'/_rels/'+base+'.rels';}
function attr(attrs:string,name:string){
  const escaped=name.replace(/[.*+?^$()|[\]\\]/g,'\\function attr(attrs:string,name:string){
  const escaped=name.replace(/[.*+?^$()|[\]\\]/g,'\\$&');
  return new RegExp('(?:^|\\s)'+escaped+'=["\\']([^"\\']*)["\\']','iu').exec(attrs)?.[1];
}');
  return new RegExp("(?:^|\\s)"+escaped+"=[\"']([^\"']*)[\"']","iu").exec(attrs)?.[1];
}
function numeric(attrs:string,name:string){const raw=attr(attrs,name);const n=raw===undefined?NaN:Number(raw);return Number.isFinite(n)?n:undefined;}
function px(value?:number){return Number.isFinite(value)?Math.round((Number(value)/EMU_PER_PIXEL_96)*100)/100:undefined;}
function relationMap(xml:string,sourcePath:string,root:string){
  const map=new Map<string,string>();
  for(const match of xml.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/giu)){
    const attrs=match[1]??'';const id=attr(attrs,'Id');const target=attr(attrs,'Target');
    if(!id||!target)continue;
    const path=target.startsWith('/')?normalizePath(target):/^(media|drawings|slides|worksheets)\//iu.test(target)?normalizePath(root+'/'+target):normalizePath(join(dirname(sourcePath),target));
    map.set(id,path);
  }
  return map;
}
function imageId(xml:string){
  return /<a:blip\b[^>]*(?:r:embed|r:link)=["']([^"']+)["']/iu.exec(xml)?.[1]??/<v:imagedata\b[^>]*(?:r:id|o:relid)=["']([^"']+)["']/iu.exec(xml)?.[1];
}
function mime(path:string){
  const ext=path.split('.').at(-1)?.toLowerCase();
  return ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',bmp:'image/bmp',svg:'image/svg+xml',tif:'image/tiff',tiff:'image/tiff'} as Record<string,string>)[ext??'']??'application/octet-stream';
}
function asset(entries:Map<string,Buffer>,path:string,options:ReaderOptions,extra:Partial<ExtractedAsset>={}):ExtractedAsset|null{
  const normalized=normalizePath(path);const data=entries.get(normalized);if(!data)return null;
  return {id:nextId('asset'),path:normalized,mediaType:mime(normalized),size:data.length,sha256:'sha256:'+createHash('sha256').update(data).digest('hex'),buffer:options.includeAssetBytes?Buffer.from(data):undefined,...extra};
}

export function docxAssets(entries:Map<string,Buffer>,options:ReaderOptions={}):ExtractedAsset[]{
  const documentXml=entries.get('word/document.xml')?.toString('utf8')??'';
  const rels=relationMap(entries.get('word/_rels/document.xml.rels')?.toString('utf8')??'','word/document.xml','word');
  const out:ExtractedAsset[]=[];
  const paragraphs=documentXml.match(/<w:p\b[\s\S]*?<\/w:p>/giu)??[];
  paragraphs.forEach((paragraph,paragraphIndex)=>{
    const runs=paragraph.match(/<w:r\b[\s\S]*?<\/w:r>/giu)??[paragraph];
    runs.forEach((run,runIndex)=>{
      const id=imageId(run);if(!id)return;const path=rels.get(id);if(!path)return;
      const extent=/<wp:extent\b([^>]*)\/>/iu.exec(run)?.[1]??/<a:ext\b([^>]*)\/>/iu.exec(run)?.[1]??'';
      const a=asset(entries,path,options,{paragraphIndex,runIndex,position:{width:px(numeric(extent,'cx')),height:px(numeric(extent,'cy'))},source:{format:'DOCX',relationshipId:id}});
      if(a)out.push(a);
    });
  });
  return out;
}

export function pptxAssets(entries:Map<string,Buffer>,options:ReaderOptions={}):ExtractedAsset[]{
  const out:ExtractedAsset[]=[];
  for(const [name,data] of entries){
    if(!/^ppt\/slides\/slide\d+\.xml$/iu.test(name))continue;
    const page=Number(/slide(\d+)\.xml$/iu.exec(name)?.[1]??0);
    const rels=relationMap(entries.get(relsPath(name))?.toString('utf8')??'',name,'ppt');
    const xml=data.toString('utf8');
    const pics=xml.match(/<p:pic\b[\s\S]*?<\/p:pic>/giu)??[];
    for(const pic of pics){
      const id=imageId(pic);if(!id)continue;const path=rels.get(id);if(!path)continue;
      const xfrm=/<a:xfrm\b[\s\S]*?<\/a:xfrm>/iu.exec(pic)?.[0]??pic;
      const off=/<a:off\b([^>]*)\/>/iu.exec(xfrm)?.[1]??'';const ext=/<a:ext\b([^>]*)\/>/iu.exec(xfrm)?.[1]??'';
      const a=asset(entries,path,options,{page,sheet:'Slide '+page,position:{x:px(numeric(off,'x')),y:px(numeric(off,'y')),width:px(numeric(ext,'cx')),height:px(numeric(ext,'cy'))},source:{format:'PPTX',relationshipId:id}});
      if(a)out.push(a);
    }
  }
  return out.sort((a,b)=>(a.page??0)-(b.page??0)||(a.position?.y??Infinity)-(b.position?.y??Infinity));
}

export function xlsxAssets(entries:Map<string,Buffer>,options:ReaderOptions={}):ExtractedAsset[]{
  const out:ExtractedAsset[]=[];
  for(const [path] of entries){
    if(!/^xl\/media\//iu.test(path))continue;
    const a=asset(entries,path,options,{source:{format:'XLSX'}});if(a)out.push(a);
  }
  return out;
}