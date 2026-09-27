import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {finalizeCanonicalDocument} from '../finalize.js';
import type {DocumentExtractor,DocumentReadContext} from '../contracts.js';
import type {AssetReference,CanonicalBlock,CanonicalTable,MaterializedAsset,SourceDocumentInput} from '../types.js';
import {readZipEntries,bytesText} from '../office/zip.js';
import {attr,blocks,guessImageMediaType,officeRelationships,xmlDecode,xmlText} from '../office/xml.js';

const EMU_PER_PIXEL_96=9525;
function digest(bytes:Uint8Array):string{return 'sha256:'+createHash('sha256').update(bytes).digest('hex');}
function uniqueColumns(values:string[]):string[]{const used=new Map<string,number>();return values.map((v,i)=>{const base=v.trim()||`Columna ${i+1}`,n=(used.get(base)??0)+1;used.set(base,n);return n===1?base:`${base} ${n}`;});}
function styleLevels(stylesXml:string):Map<string,number>{
  const result=new Map<string,number>();
  for(const {xml} of blocks(stylesXml,'w:style')){
    const open=xml.match(/<w:style\b([^>]*)>/i)?.[1]??'',id=attr(open,'w:styleId');if(!id)continue;
    const nameAttrs=xml.match(/<w:name\b([^>]*)\/?\s*>/i)?.[1]??'',name=attr(nameAttrs,'w:val')??'';
    const outlineAttrs=xml.match(/<w:outlineLvl\b([^>]*)\/?\s*>/i)?.[1]??'',outline=Number(attr(outlineAttrs,'w:val'));
    let level=Number.isInteger(outline)&&outline>=0?outline+1:undefined;
    if(!level){const m=(name||id).match(/(?:heading|title|t[ií]tulo)\s*([1-9])/i)??id.match(/(?:Heading|Title)([1-9])/i);if(m)level=Number(m[1]);}
    if(level)result.set(id,level);
  }
  return result;
}
function paragraphStyle(xml:string):string|undefined{return attr(xml.match(/<w:pStyle\b([^>]*)\/?\s*>/i)?.[1]??'','w:val');}
function imageRefs(xml:string):string[]{return [...xml.matchAll(/<a:blip\b[^>]*(?:r:embed|r:link)="([^"]+)"/gi)].map(m=>m[1]!).filter(Boolean);}
function imageBox(xml:string){
  const extent=xml.match(/<wp:extent\b([^>]*)\/?\s*>/i)?.[1]??'',cx=Number(attr(extent,'cx')),cy=Number(attr(extent,'cy'));
  const xRaw=Number(xml.match(/<wp:positionH\b[\s\S]*?<wp:posOffset>(-?\d+)<\/wp:posOffset>/i)?.[1]);
  const yRaw=Number(xml.match(/<wp:positionV\b[\s\S]*?<wp:posOffset>(-?\d+)<\/wp:posOffset>/i)?.[1]);
  const finite=(n:number)=>Number.isFinite(n)?Math.round(n/EMU_PER_PIXEL_96*100)/100:undefined;
  const x=finite(xRaw),y=finite(yRaw),width=finite(cx),height=finite(cy);
  return x!=null||y!=null||width!=null||height!=null?{x,y,width,height}:undefined;
}
function tableFromXml(xml:string,id:string,order:number):CanonicalTable{
  const matrix=blocks(xml,'w:tr').map(r=>blocks(r.xml,'w:tc').map(c=>xmlText(c.xml,['w:t'])));
  const width=Math.max(1,...matrix.map(r=>r.length));
  const first=matrix[0]??[],columns=uniqueColumns(Array.from({length:width},(_,i)=>first[i]??''));
  const data=matrix.length>1?matrix.slice(1):[];
  return{id,order,name:`Tabla ${id.replace(/\D/g,'')||''}`.trim(),columns,rows:data.map(row=>Object.fromEntries(columns.map((col,i)=>[col,row[i]??'']))),cells:{headers:first.length?[first.map((text)=>({text,header:true}))]:[],rows:data.map(row=>row.map(text=>({text})))},source:{format:'DOCX',raw:{bodyOrder:order}}};
}
function coreMetadata(entries:Map<string,Uint8Array>){
  const core=bytesText(entries,'docProps/core.xml');
  const tag=(name:string)=>xmlDecode(core.match(new RegExp('<'+name+'\\b[^>]*>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]??'').replace(/<[^>]+>/g,'').trim()||undefined;
  return{title:tag('dc:title'),author:tag('dc:creator')};
}
function warningsFor(entries:Map<string,Uint8Array>){
  const names=[...entries.keys()],warnings=[] as Array<{path:string;message:string;level:'WARNING'}>;
  const features=[[/^word\/header\d+\.xml$/i,'encabezados de página'],[/^word\/footer\d+\.xml$/i,'pies de página'],[/^word\/footnotes\.xml$/i,'notas al pie'],[/^word\/endnotes\.xml$/i,'notas finales'],[/^word\/comments\.xml$/i,'comentarios']] as const;
  for(const [re,label] of features)if(names.some(n=>re.test(n)))warnings.push({path:'docx.features',message:`El DOCX contiene ${label}; se preserva la advertencia de fidelidad para revisión.`,level:'WARNING'});
  return warnings;
}

export const docxExtractor:DocumentExtractor={
  id:'p2lrn.docx.v1',formats:['DOCX'],
  async extract(input:SourceDocumentInput,_detection,context:DocumentReadContext){
    const entries=await readZipEntries(input.bytes,{maxFiles:context.maxFiles,maxUncompressedBytes:context.maxUncompressedBytes});
    const documentXml=bytesText(entries,'word/document.xml');if(!documentXml)throw new Error('DOCX has no word/document.xml.');
    const styles=styleLevels(bytesText(entries,'word/styles.xml'));
    const rels=officeRelationships(bytesText(entries,'word/_rels/document.xml.rels'),'word/document.xml');
    const body=documentXml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/i)?.[1]??documentXml;
    const elements=[...body.matchAll(/<w:(p|tbl)\b[\s\S]*?<\/w:\1>/gi)].map((m,i)=>({kind:m[1]!.toLowerCase(),xml:m[0],sourceIndex:m.index??0,index:i}));
    const blocksOut:CanonicalBlock[]=[],tables:CanonicalTable[]=[],assets:MaterializedAsset[]=[],assetByPath=new Map<string,AssetReference>();
    let order=0,paragraphIndex=0,tableIndex=0;
    const materialize=(path:string,relationshipId:string,box:CanonicalBlock['bbox'],raw:Record<string,unknown>)=>{
      const bytes=entries.get(path);if(!bytes)return undefined;
      let ref=assetByPath.get(path);
      if(!ref){ref={id:`docx-asset-${assetByPath.size+1}`,name:basename(path),mediaType:guessImageMediaType(path),size:bytes.byteLength,byteDigest:digest(bytes),sourcePath:path};assetByPath.set(path,ref);assets.push({reference:ref,bytes});}
      order+=1;blocksOut.push({id:`docx-image-${order}`,type:'IMAGE',text:ref.name,order,bbox:box,asset:ref,source:{format:'DOCX',raw:{...raw,relationshipId,path}}});return ref;
    };
    for(const element of elements){
      if(element.kind==='p'){
        paragraphIndex+=1;
        const text=xmlText(element.xml,['w:t']),style=paragraphStyle(element.xml),level=style?styles.get(style):undefined;
        const isList=/<w:numPr\b/i.test(element.xml);
        if(text){order+=1;blocksOut.push({id:`docx-p-${paragraphIndex}`,type:level?'TITLE':isList?'LIST':'PARAGRAPH',text,order,level,source:{format:'DOCX',raw:{paragraphIndex,style,list:isList,bodyIndex:element.index}}});}
        for(const rid of imageRefs(element.xml)){
          const path=rels.get(rid);if(path)materialize(path,rid,imageBox(element.xml),{paragraphIndex,bodyIndex:element.index,layout:/<wp:inline\b/i.test(element.xml)?'inline':/<wp:anchor\b/i.test(element.xml)?'anchor':'unknown'});
        }
      }else{
        tableIndex+=1;order+=1;
        const table=tableFromXml(element.xml,`docx-table-${tableIndex}`,order);tables.push(table);
        blocksOut.push({id:`docx-table-block-${tableIndex}`,type:'TABLE',text:table.name??`Tabla ${tableIndex}`,order,source:{format:'DOCX',raw:{tableId:table.id,bodyIndex:element.index}}});
        for(const rid of imageRefs(element.xml)){const path=rels.get(rid);if(path)materialize(path,rid,imageBox(element.xml),{tableId:table.id,insideTable:true,bodyIndex:element.index});}
      }
    }
    const meta=coreMetadata(entries),title=meta.title??blocksOut.find(b=>b.type==='TITLE')?.text;
    return{document:finalizeCanonicalDocument({source:input,format:'DOCX',strategy:'DOCX_XML',blocks:blocksOut,tables,metadata:{title,author:meta.author},warnings:warningsFor(entries),raw:{parser:'P2LRN_DOCX_V1',bodyElements:elements.length}}),assets};
  }
};
