import {posix} from 'node:path';
import type {DocumentPosition} from './types.js';
import {decodeXml} from './utils.js';

const EMU_PER_PIXEL_96=9525;

export interface OfficeImagePlacement {
  path:string;
  relationshipId?:string;
  index:number;
  paragraphIndex?:number;
  runIndex?:number;
  slide?:number;
  sheet?:string;
  position?:DocumentPosition;
  canvas?:{width:number;height:number};
  raw?:Record<string,unknown>;
}

function attr(attrs:string,name:string):string|undefined {
  const escaped=name.replace(/[.*+?^\${}()|[\]\\]/gu,'\\$&');
  return attrs.match(new RegExp('(?:^|\\s)' + escaped + '="([^"]*)"','iu'))?.[1];
}

function numberAttr(attrs:string,name:string):number|undefined {
  const value=attr(attrs,name);
  if (value===undefined) return undefined;
  const n=Number(value);
  return Number.isFinite(n)?n:undefined;
}

function px(emu:number|undefined):number|undefined {
  return Number.isFinite(emu)?Math.round((Number(emu)/EMU_PER_PIXEL_96)*100)/100:undefined;
}

function normalize(path:string):string {
  return posix.normalize(String(path).replace(/\\/gu,'/').replace(/^\/+/, ''));
}

function dirname(path:string):string {
  const value=normalize(path);
  return value.includes('/')?value.slice(0,value.lastIndexOf('/')):'';
}

function join(base:string,target:string):string {
  return normalize(posix.join(base,target));
}

export function parseRelationships(xml:string, sourcePath:string):Map<string,string> {
  const out=new Map<string,string>();
  for(const match of String(xml||'').matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/giu)){
    const attrs=match[1]??'';
    const id=attr(attrs,'Id');
    const target=attr(attrs,'Target');
    if(!id||!target)continue;
    const path=target.startsWith('/')?normalize(target):join(dirname(sourcePath),target);
    out.set(id,path);
  }
  return out;
}

export function relationshipIds(fragment:string):string[] {
  const out=new Set<string>();
  for(const pattern of [
    /<a:blip\b[^>]*(?:r:embed|r:link)="([^"]+)"/giu,
    /<v:imagedata\b[^>]*(?:r:id|o:relid)="([^"]+)"/giu,
    /<asvg:svgBlip\b[^>]*(?:r:embed|r:link)="([^"]+)"/giu,
  ]){
    for(const match of fragment.matchAll(pattern)) if(match[1]) out.add(match[1]);
  }
  return [...out];
}

function transform(fragment:string):{position?:DocumentPosition;raw?:Record<string,unknown>} {
  const xfrm=fragment.match(/<a:xfrm[\s\S]*?<\/a:xfrm>/iu)?.[0]??fragment;
  const off=xfrm.match(/<a:off\b([^>]*)\/>/iu)?.[1]??'';
  const ext=xfrm.match(/<a:ext\b([^>]*)\/>/iu)?.[1]??'';
  const x=numberAttr(off,'x');
  const y=numberAttr(off,'y');
  const width=numberAttr(ext,'cx');
  const height=numberAttr(ext,'cy');
  const position:DocumentPosition={x:px(x),y:px(y),width:px(width),height:px(height)};
  const clean=Object.fromEntries(Object.entries(position).filter(([,value])=>value!==undefined)) as DocumentPosition;
  return {
    position:Object.keys(clean).length?clean:undefined,
    raw:{xEmu:x,yEmu:y,widthEmu:width,heightEmu:height},
  };
}

export function docxImagePlacements(entries:Map<string,Uint8Array>):OfficeImagePlacement[] {
  const document=new TextDecoder().decode(entries.get('word/document.xml')??new Uint8Array());
  const rels=parseRelationships(
    new TextDecoder().decode(entries.get('word/_rels/document.xml.rels')??new Uint8Array()),
    'word/document.xml',
  );
  const paragraphs=document.match(/<w:p[\s\S]*?<\/w:p>/giu)??[];
  const placements:OfficeImagePlacement[]=[];
  paragraphs.forEach((paragraph,paragraphIndex)=>{
    const runs=paragraph.match(/<w:r[\s\S]*?<\/w:r>/giu)??[paragraph];
    runs.forEach((run,runIndex)=>{
      for(const id of relationshipIds(run)){
        const path=rels.get(id);
        if(!path)continue;
        const extent=run.match(/<wp:extent\b([^>]*)\/>/iu)?.[1]??run.match(/<a:ext\b([^>]*)\/>/iu)?.[1]??'';
        const anchorH=run.match(/<wp:positionH\b[\s\S]*?<\/wp:positionH>/iu)?.[0]??'';
        const anchorV=run.match(/<wp:positionV\b[\s\S]*?<\/wp:positionV>/iu)?.[0]??'';
        const rawX=Number(anchorH.match(/<wp:posOffset>(-?\d+)<\/wp:posOffset>/iu)?.[1]);
        const rawY=Number(anchorV.match(/<wp:posOffset>(-?\d+)<\/wp:posOffset>/iu)?.[1]);
        const width=numberAttr(extent,'cx');
        const height=numberAttr(extent,'cy');
        const position:DocumentPosition={
          x:Number.isFinite(rawX)?px(rawX):undefined,
          y:Number.isFinite(rawY)?px(rawY):undefined,
          width:px(width),
          height:px(height),
        };
        const clean=Object.fromEntries(Object.entries(position).filter(([,value])=>value!==undefined)) as DocumentPosition;
        placements.push({
          path,
          index:placements.length,
          relationshipId:id,
          paragraphIndex,
          runIndex,
          position:Object.keys(clean).length?clean:undefined,
          raw:{
            layout:/<wp:inline\b/iu.test(run)?'inline':/<wp:anchor\b/iu.test(run)?'anchor':'unknown',
            relationshipId:id,
          },
        });
      }
    });
  });
  return placements;
}

export function pptxCanvas(entries:Map<string,Uint8Array>):{width:number;height:number}|undefined {
  const xml=new TextDecoder().decode(entries.get('ppt/presentation.xml')??new Uint8Array());
  const attrs=xml.match(/<p:sldSz\b([^>]*)\/?\s*>/iu)?.[1]??'';
  const width=px(numberAttr(attrs,'cx'));
  const height=px(numberAttr(attrs,'cy'));
  return width&&height?{width,height}:undefined;
}

export function pptxImagePlacements(entries:Map<string,Uint8Array>, slidePath:string, slide:number):OfficeImagePlacement[] {
  const xml=new TextDecoder().decode(entries.get(slidePath)??new Uint8Array());
  const relsPath=slidePath.replace('/slides/','/slides/_rels/')+'.rels';
  const rels=parseRelationships(new TextDecoder().decode(entries.get(relsPath)??new Uint8Array()),slidePath);
  const canvas=pptxCanvas(entries);
  const fragments=xml.match(/<p:pic[\s\S]*?<\/p:pic>/giu)??[];
  const placements:OfficeImagePlacement[]=[];
  fragments.forEach((fragment,index)=>{
    const id=relationshipIds(fragment)[0];
    if(!id)return;
    const path=rels.get(id);
    if(!path)return;
    const t=transform(fragment);
    placements.push({
      path,
      index,
      relationshipId:id,
      slide,
      sheet:'Slide '+slide,
      position:t.position,
      canvas,
      raw:t.raw,
    });
  });
  return placements;
}

export function pptxShapePosition(fragment:string):DocumentPosition|undefined {
  return transform(fragment).position;
}

export function xmlAttribute(fragment:string,name:string):string|undefined {
  return attr(fragment,name);
}

export function xmlText(fragment:string):string {
  return decodeXml(fragment.replace(/<[^>]+>/gu,' ').replace(/\s+/gu,' ').trim());
}
