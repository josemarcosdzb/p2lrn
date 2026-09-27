import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {finalizeCanonicalDocument} from '../finalize.js';
import type {DocumentExtractor,DocumentReadContext} from '../contracts.js';
import type {AssetReference,BoundingBox,CanonicalBlock,CanonicalTable,MaterializedAsset,SourceDocumentInput} from '../types.js';
import {readZipEntries,bytesText} from '../office/zip.js';
import {attr,blocks,guessImageMediaType,officeRelationships,xmlDecode,xmlText} from '../office/xml.js';

const EMU_PER_PIXEL_96=9525;
function digest(bytes:Uint8Array):string{return 'sha256:'+createHash('sha256').update(bytes).digest('hex');}
function emu(value:unknown):number|undefined{const n=Number(value);return Number.isFinite(n)?Math.round(n/EMU_PER_PIXEL_96*100)/100:undefined;}
function canvas(entries:Map<string,Uint8Array>){
  const xml=bytesText(entries,'ppt/presentation.xml'),attrs=xml.match(/<p:sldSz\b([^>]*)\/?\s*>/i)?.[1]??'';
  const width=emu(attr(attrs,'cx')),height=emu(attr(attrs,'cy'));return width&&height?{width,height}:undefined;
}
function shapeBox(xml:string,slideCanvas?:{width:number;height:number}):BoundingBox|undefined{
  const xfrm=xml.match(/<a:xfrm\b[\s\S]*?<\/a:xfrm>/i)?.[0]??xml;
  const off=xfrm.match(/<a:off\b([^>]*)\/?\s*>/i)?.[1]??'',ext=xfrm.match(/<a:ext\b([^>]*)\/?\s*>/i)?.[1]??'';
  const x=emu(attr(off,'x')),y=emu(attr(off,'y')),width=emu(attr(ext,'cx')),height=emu(attr(ext,'cy'));
  if(x==null&&y==null&&width==null&&height==null)return undefined;
  return{x,y,width,height,coordinateSystem:'TOP_LEFT',canvasWidth:slideCanvas?.width,canvasHeight:slideCanvas?.height};
}
function coreMetadata(entries:Map<string,Uint8Array>){
  const core=bytesText(entries,'docProps/core.xml');
  const tag=(name:string)=>xmlDecode(core.match(new RegExp('<'+name+'\\b[^>]*>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]??'').replace(/<[^>]+>/g,'').trim()||undefined;
  return{title:tag('dc:title'),author:tag('dc:creator')};
}
function uniqueColumns(values:string[]):string[]{const used=new Map<string,number>();return values.map((v,i)=>{const base=v.trim()||`Columna ${i+1}`,n=(used.get(base)??0)+1;used.set(base,n);return n===1?base:`${base} ${n}`;});}
function tableFromXml(xml:string,id:string,order:number,slide:number):CanonicalTable{
  const matrix=blocks(xml,'a:tr').map(row=>blocks(row.xml,'a:tc').map(cell=>xmlText(cell.xml,['a:t'])));
  const width=Math.max(1,...matrix.map(r=>r.length)),first=matrix[0]??[],columns=uniqueColumns(Array.from({length:width},(_,i)=>first[i]??'')),data=matrix.length>1?matrix.slice(1):[];
  return{id,order,slide,name:`Tabla diapositiva ${slide}`,columns,rows:data.map(row=>Object.fromEntries(columns.map((col,i)=>[col,row[i]??'']))),cells:{headers:first.length?[first.map(text=>({text,header:true}))]:[],rows:data.map(row=>row.map(text=>({text})))},source:{format:'PPTX',raw:{slide}}};
}
function slideNumber(path:string):number{return Number(path.match(/slide(\d+)\.xml$/i)?.[1]??0);}
function slideRelsPath(path:string):string{const name=path.split('/').pop()!;return path.replace('/slides/'+name,'/slides/_rels/'+name+'.rels');}
function warningsFor(entries:Map<string,Uint8Array>){
  const names=[...entries.keys()],warnings=[] as Array<{path:string;message:string;level:'WARNING'}>;
  const features=[[/^ppt\/notesSlides\/notesSlide\d+\.xml$/i,'notas del presentador'],[/^ppt\/charts\/chart\d+\.xml$/i,'gráficos editables'],[/^ppt\/diagrams\//i,'SmartArt'],[/^ppt\/comments\//i,'comentarios']] as const;
  for(const [re,label] of features)if(names.some(n=>re.test(n)))warnings.push({path:'pptx.features',message:`El PPTX contiene ${label}; se conserva la advertencia de fidelidad para revisión.`,level:'WARNING'});
  return warnings;
}

export const pptxExtractor:DocumentExtractor={
  id:'p2lrn.pptx.v1',formats:['PPTX'],
  async extract(input:SourceDocumentInput,_detection,context:DocumentReadContext){
    const entries=await readZipEntries(input.bytes,{maxFiles:context.maxFiles,maxUncompressedBytes:context.maxUncompressedBytes});
    const slides=[...entries.keys()].filter(n=>/^ppt\/slides\/slide\d+\.xml$/i.test(n)).sort((a,b)=>slideNumber(a)-slideNumber(b));
    if(!slides.length)throw new Error('PPTX has no slides.');
    const slideCanvas=canvas(entries),blocksOut:CanonicalBlock[]=[],tables:CanonicalTable[]=[],assets:MaterializedAsset[]=[],assetByPath=new Map<string,AssetReference>();
    let tableIndex=0;
    const materialize=(path:string,slide:number,order:number,box:BoundingBox|undefined,relationshipId:string,raw:Record<string,unknown>)=>{
      const bytes=entries.get(path);if(!bytes)return;
      let ref=assetByPath.get(path);if(!ref){ref={id:`pptx-asset-${assetByPath.size+1}`,name:basename(path),mediaType:guessImageMediaType(path),size:bytes.byteLength,byteDigest:digest(bytes),sourcePath:path,slide};assetByPath.set(path,ref);assets.push({reference:ref,bytes});}
      blocksOut.push({id:`pptx-image-${slide}-${order}`,type:'IMAGE',text:ref.name,order,slide,bbox:box,asset:ref,source:{format:'PPTX',raw:{slide,relationshipId,path,...raw}}});
    };

    for(const path of slides){
      const slide=slideNumber(path),xml=bytesText(entries,path),rels=officeRelationships(bytesText(entries,slideRelsPath(path)),path);
      const shapes=[...xml.matchAll(/<p:(sp|pic|graphicFrame)\b[\s\S]*?<\/p:\1>/gi)].map((m,i)=>({kind:m[1]!.toLowerCase(),xml:m[0],index:m.index??0,shapeIndex:i+1}));
      const hasNativeTitle=shapes.some(s=>s.kind==='sp'&&/<p:ph\b[^>]*type="(?:title|ctrTitle)"/i.test(s.xml)&&Boolean(xmlText(s.xml,['a:t'])));
      if(!hasNativeTitle){
        blocksOut.push({id:`pptx-slide-${slide}-title`,type:'TITLE',text:`Diapositiva ${slide}`,level:2,order:slide*1_000_000,slide,source:{format:'PPTX',raw:{slide,syntheticSlideTitle:true,sourceOrder:0}}});
      }
      for(const shape of shapes){
        const baseOrder=slide*1_000_000+shape.shapeIndex*1000,box=shapeBox(shape.xml,slideCanvas);
        if(shape.kind==='pic'){
          const rid=shape.xml.match(/<a:blip\b[^>]*(?:r:embed|r:link)="([^"]+)"/i)?.[1],assetPath=rid?rels.get(rid):undefined;
          if(rid&&assetPath)materialize(assetPath,slide,baseOrder,box,rid,{shapeIndex:shape.shapeIndex});
          continue;
        }
        if(shape.kind==='graphicframe'&&/<a:tbl\b/i.test(shape.xml)){
          tableIndex+=1;const table=tableFromXml(shape.xml,`pptx-table-${tableIndex}`,baseOrder,slide);tables.push(table);
          blocksOut.push({id:`pptx-table-block-${tableIndex}`,type:'TABLE',text:table.name??'Tabla',order:baseOrder,slide,bbox:box,source:{format:'PPTX',raw:{slide,shapeIndex:shape.shapeIndex,tableId:table.id}}});
          continue;
        }
        const paragraphs=blocks(shape.xml,'a:p').filter(p=>Boolean(xmlText(p.xml,['a:t'])));
        const titlePlaceholder=/<p:ph\b[^>]*type="(?:title|ctrTitle)"/i.test(shape.xml);
        if(!paragraphs.length){
          const text=xmlText(shape.xml,['a:t']);if(text)blocksOut.push({id:`pptx-text-${slide}-${shape.shapeIndex}`,type:titlePlaceholder?'TITLE':'PARAGRAPH',text,level:titlePlaceholder?2:undefined,order:baseOrder,slide,bbox:box,source:{format:'PPTX',raw:{slide,shapeIndex:shape.shapeIndex,placeholderTitle:titlePlaceholder}}});
          continue;
        }
        paragraphs.forEach((p,pi)=>{
          const text=xmlText(p.xml,['a:t']);if(!text)return;
          const list=/<a:(?:buChar|buAutoNum)\b/i.test(p.xml);
          blocksOut.push({id:`pptx-text-${slide}-${shape.shapeIndex}-${pi+1}`,type:titlePlaceholder&&pi===0?'TITLE':list?'LIST':'PARAGRAPH',text,level:titlePlaceholder&&pi===0?2:undefined,order:baseOrder+pi+1,slide,bbox:box,source:{format:'PPTX',raw:{slide,shapeIndex:shape.shapeIndex,paragraphIndex:pi+1,placeholderTitle:titlePlaceholder&&pi===0,list}}});
        });
      }
    }
    const meta=coreMetadata(entries),firstTitle=blocksOut.find(b=>b.type==='TITLE'&&b.source?.raw?.syntheticSlideTitle!==true)?.text;
    return{document:finalizeCanonicalDocument({source:input,format:'PPTX',strategy:'PPTX_SLIDES_XML',blocks:blocksOut,tables,metadata:{title:meta.title??firstTitle,author:meta.author},warnings:warningsFor(entries),raw:{parser:'P2LRN_PPTX_V1',slides:slides.length,canvas:slideCanvas}}),assets};
  }
};
