import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {finalizeCanonicalDocument} from '../finalize.js';
import {bytesText,readZipEntries} from '../office/zip.js';
import {attr,blocks,guessImageMediaType,xmlDecode,xmlText} from '../office/xml.js';
import {htmlExtractor} from './text-structured.js';
import type {DocumentExtractor,DocumentReadContext,FormatDetection} from '../contracts.js';
import type {AssetReference,CanonicalBlock,CanonicalTable,MaterializedAsset,SourceDocumentInput} from '../types.js';

function digest(bytes:Uint8Array):string{return 'sha256:'+createHash('sha256').update(bytes).digest('hex');}
function cleanText(value:string):string{return xmlDecode(value.replace(/<text:(?:line-break|tab)\b[^>]*\/?\s*>/gi,' ')).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();}
function packagePath(base:string,target:string):string{
  const raw=target.split(/[?#]/,1)[0]!.replace(/\\/g,'/');
  const parts=base.split('/');parts.pop();
  for(const part of raw.split('/')){
    if(!part||part==='.')continue;
    if(part==='..'){if(!parts.length)throw new Error(`Package reference escapes archive root: ${target}`);parts.pop();continue;}
    let decoded=part;try{decoded=decodeURIComponent(part);}catch{}
    if(!decoded||decoded==='.'||decoded==='..')throw new Error(`Unsafe package path segment: ${target}`);
    parts.push(decoded);
  }
  return parts.join('/');
}
function uniqueColumns(values:string[]):string[]{const seen=new Map<string,number>();return values.map((value,index)=>{const base=value.trim()||`Columna ${index+1}`,n=(seen.get(base)??0)+1;seen.set(base,n);return n===1?base:`${base} ${n}`;});}
function makeAsset(format:'ODT'|'EPUB',path:string,bytes:Uint8Array,index:number):{reference:AssetReference;bytes:Uint8Array}{
  const reference:AssetReference={id:`${format.toLowerCase()}-asset-${index}`,name:basename(path),mediaType:guessImageMediaType(path),size:bytes.byteLength,byteDigest:digest(bytes),sourcePath:path};
  return{reference,bytes};
}

function odtTable(xml:string,id:string,order:number):CanonicalTable{
  const matrix=blocks(xml,'table:table-row').map(row=>blocks(row.xml,'table:table-cell').map(cell=>xmlText(cell.xml,['text:p','text:span'])));
  const width=Math.max(1,...matrix.map(row=>row.length)),header=matrix[0]??[],columns=uniqueColumns(Array.from({length:width},(_,i)=>header[i]??'')),data=matrix.slice(1);
  return{id,order,name:`Tabla ${id.replace(/\D/g,'')||''}`.trim(),columns,rows:data.map(row=>Object.fromEntries(columns.map((column,i)=>[column,row[i]??'']))),cells:{headers:header.length?[header.map(value=>({text:value,header:true}))]:[],rows:data.map(row=>row.map(value=>({text:value})))},source:{format:'ODT',raw:{parser:'P2LRN_ODT_V1'}}};
}
function odtMetadata(entries:Map<string,Uint8Array>){
  const xml=bytesText(entries,'meta.xml');
  const value=(tag:string)=>cleanText(xml.match(new RegExp('<'+tag+'\\b[^>]*>([\\s\\S]*?)<\\/'+tag+'>','i'))?.[1]??'')||undefined;
  return{title:value('dc:title'),author:value('meta:initial-creator')??value('dc:creator'),language:value('dc:language')};
}
function imageTargets(xml:string):string[]{return[...xml.matchAll(/<draw:image\b([^>]*)\/?\s*>/gi)].map(match=>attr(match[1]??'','xlink:href')).filter((value):value is string=>Boolean(value));}

export const odtExtractor:DocumentExtractor={
  id:'p2lrn.odt.v1',formats:['ODT'],
  async extract(input,_detection,context){
    const entries=await readZipEntries(input.bytes,{maxFiles:context.maxFiles,maxUncompressedBytes:context.maxUncompressedBytes});
    const content=bytesText(entries,'content.xml');if(!content)throw new Error('ODT has no content.xml.');
    const mimetype=bytesText(entries,'mimetype').trim();if(mimetype&&mimetype!=='application/vnd.oasis.opendocument.text')throw new Error(`ODT mimetype is invalid: ${mimetype}`);
    const officeText=content.match(/<office:text\b[^>]*>([\s\S]*?)<\/office:text\s*>/i)?.[1]??content;
    const elements=[...officeText.matchAll(/<(text:h|text:p|text:list|table:table)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)];
    const out:CanonicalBlock[]=[],tables:CanonicalTable[]=[],assets:MaterializedAsset[]=[],assetByPath=new Map<string,AssetReference>(),warnings=[] as Array<{path:string;message:string;level:'WARNING'}>;let order=0,tableIndex=0;
    const addImages=(fragment:string,sourceOrder:number)=>{for(const target of imageTargets(fragment)){let path:string;try{path=packagePath('content.xml',target);}catch(error){warnings.push({path:'odt.images',message:String(error instanceof Error?error.message:error),level:'WARNING'});continue;}const bytes=entries.get(path);if(!bytes){warnings.push({path:'odt.images',message:`ODT image is referenced but missing from archive: ${path}`,level:'WARNING'});continue;}let ref=assetByPath.get(path);if(!ref){if(context.maxImages!=null&&assets.length>=context.maxImages)throw new Error(`ODT exceeds image-count limit: ${context.maxImages}`);const materialized=makeAsset('ODT',path,bytes,assets.length+1);assets.push(materialized);ref=materialized.reference;assetByPath.set(path,ref);}order+=1;out.push({id:`odt-image-${order}`,type:'IMAGE',text:ref.name,order,asset:ref,source:{format:'ODT',raw:{internalFile:'content.xml',assetPath:path,sourceElementOrder:sourceOrder}}});}};
    for(let index=0;index<elements.length;index++){const match=elements[index]!,tag=match[1]!.toLowerCase(),fragment=match[0];
      if(tag==='table:table'){tableIndex+=1;order+=1;const table=odtTable(fragment,`odt-table-${tableIndex}`,order);tables.push(table);out.push({id:`odt-table-block-${tableIndex}`,type:'TABLE',text:table.name??`Tabla ${tableIndex}`,order,source:{format:'ODT',raw:{tableId:table.id,internalFile:'content.xml',sourceElementOrder:index}}});addImages(fragment,index);continue;}
      if(tag==='text:list'){
        for(const item of blocks(fragment,'text:list-item')){const value=xmlText(item.xml,['text:p','text:span']);if(value){order+=1;out.push({id:`odt-list-${order}`,type:'LIST',text:value,order,source:{format:'ODT',raw:{internalFile:'content.xml',sourceElementOrder:index}}});}}
        addImages(fragment,index);continue;
      }
      const value=xmlText(fragment,['text:span','text:p','text:h'])||cleanText(fragment),heading=tag==='text:h',level=heading?Number(attr(fragment.match(/<text:h\b([^>]*)>/i)?.[1]??'','text:outline-level')??1):undefined;
      if(value){order+=1;out.push({id:`odt-block-${order}`,type:heading?'TITLE':'PARAGRAPH',text:value,order,level:Number.isInteger(level)&&level!>0?Math.min(9,level!):undefined,source:{format:'ODT',raw:{internalFile:'content.xml',sourceElementOrder:index}}});}
      addImages(fragment,index);
    }
    if(/<office:annotation\b/i.test(content))warnings.push({path:'odt.annotations',message:'ODT contains annotations/comments; they are not promoted to visible course content.',level:'WARNING'});
    const metadata=odtMetadata(entries);return{document:finalizeCanonicalDocument({source:input,format:'ODT',strategy:'ODT_XML',blocks:out,tables,metadata,warnings,raw:{parser:'P2LRN_ODT_V1',internalFiles:entries.size}}),assets};
  }
};

interface EpubManifestItem{id:string;path:string;mediaType:string;properties?:string;}
function epubPackage(entries:Map<string,Uint8Array>){
  const container=bytesText(entries,'META-INF/container.xml');if(!container)throw new Error('EPUB has no META-INF/container.xml.');
  const rootAttrs=container.match(/<rootfile\b([^>]*)\/?\s*>/i)?.[1]??'',rootfile=attr(rootAttrs,'full-path');if(!rootfile)throw new Error('EPUB container has no rootfile.');
  const opf=bytesText(entries,rootfile);if(!opf)throw new Error(`EPUB root package is missing: ${rootfile}`);
  const manifest=new Map<string,EpubManifestItem>();
  for(const match of opf.matchAll(/<item\b([^>]*)\/?\s*>/gi)){const attrs=match[1]??'',id=attr(attrs,'id'),href=attr(attrs,'href'),mediaType=attr(attrs,'media-type');if(!id||!href||!mediaType)continue;manifest.set(id,{id,path:packagePath(rootfile,href),mediaType,properties:attr(attrs,'properties')});}
  const spine=[...opf.matchAll(/<itemref\b([^>]*)\/?\s*>/gi)].map(match=>attr(match[1]??'','idref')).filter((value):value is string=>Boolean(value));
  const meta=(tag:string)=>cleanText(opf.match(new RegExp('<'+tag+'\\b[^>]*>([\\s\\S]*?)<\\/'+tag+'>','i'))?.[1]??'')||undefined;
  return{rootfile,manifest,spine,metadata:{title:meta('dc:title'),author:meta('dc:creator'),language:meta('dc:language')}};
}
export const epubExtractor:DocumentExtractor={
  id:'p2lrn.epub.v1',formats:['EPUB'],
  async extract(input,_detection,context:DocumentReadContext){
    const entries=await readZipEntries(input.bytes,{maxFiles:context.maxFiles,maxUncompressedBytes:context.maxUncompressedBytes}),pkg=epubPackage(entries);
    const blocksOut:CanonicalBlock[]=[],tables:CanonicalTable[]=[],assets:MaterializedAsset[]=[],assetByPath=new Map<string,AssetReference>(),warnings=[] as Array<{path:string;message:string;level:'WARNING'}>;let order=0;
    const htmlDetection:FormatDetection={format:'HTML',confidence:1,reason:'EPUB spine XHTML'};
    for(let spineIndex=0;spineIndex<pkg.spine.length;spineIndex++){
      const idref=pkg.spine[spineIndex]!,item=pkg.manifest.get(idref);if(!item){warnings.push({path:`epub.spine[${spineIndex}]`,message:`Spine references missing manifest id: ${idref}`,level:'WARNING'});continue;}
      if(!/xhtml|html/i.test(item.mediaType)){warnings.push({path:`epub.spine[${spineIndex}]`,message:`Spine item is not XHTML/HTML and was preserved only as archive context: ${item.path}`,level:'WARNING'});continue;}
      const bytes=entries.get(item.path);if(!bytes){warnings.push({path:`epub.spine[${spineIndex}]`,message:`Spine document is missing: ${item.path}`,level:'WARNING'});continue;}
      const part=await htmlExtractor.extract({name:item.path,bytes,mediaType:item.mediaType},htmlDetection,context);
      const tableIdMap=new Map<string,string>();
      for(const table of part.document.tables){const id=`epub-${spineIndex+1}-${table.id}`;tableIdMap.set(table.id,id);tables.push({...table,id,order:tables.length+1,source:{format:'EPUB',raw:{...(table.source?.raw??{}),internalFile:item.path,spineIndex}}});}
      for(const block of part.document.blocks){
        order+=1;const raw={...(block.source?.raw??{}),internalFile:item.path,spineIndex};let asset=block.asset;
        if(block.type==='TABLE'&&typeof raw.tableId==='string'&&tableIdMap.has(raw.tableId))raw.tableId=tableIdMap.get(raw.tableId)!;
        if(block.type==='IMAGE'&&!asset&&typeof raw.src==='string'&&!raw.src.startsWith('data:')){
          let path:string|undefined;try{path=packagePath(item.path,raw.src);}catch(error){warnings.push({path:`epub.spine[${spineIndex}].image`,message:String(error instanceof Error?error.message:error),level:'WARNING'});}
          if(path){const imageBytes=entries.get(path);if(imageBytes){let ref=assetByPath.get(path);if(!ref){if(context.maxImages!=null&&assets.length>=context.maxImages)throw new Error(`EPUB exceeds image-count limit: ${context.maxImages}`);const materialized=makeAsset('EPUB',path,imageBytes,assets.length+1);assets.push(materialized);ref=materialized.reference;assetByPath.set(path,ref);}asset=ref;raw.unmaterialized=false;raw.assetPath=path;}else warnings.push({path:`epub.spine[${spineIndex}].image`,message:`EPUB image is referenced but missing: ${path}`,level:'WARNING'});}}
        if(block.asset){const existing=part.assets.find(value=>value.reference.id===block.asset?.id);if(existing){const id=`epub-inline-${spineIndex+1}-${assets.length+1}`,reference={...existing.reference,id,sourcePath:item.path+'#data-uri'};assets.push({reference,bytes:existing.bytes});asset=reference;}}
        blocksOut.push({...block,id:`epub-${spineIndex+1}-${block.id}`,order,asset,source:{format:'EPUB',raw}});
      }
      for(const warning of part.document.warnings)if(!/Image bytes were not embedded/.test(warning.message))warnings.push({path:`epub.spine[${spineIndex}].${warning.path}`,message:warning.message,level:warning.level==='ERROR'?'WARNING':warning.level??'WARNING'});
    }
    if(!pkg.spine.length)throw new Error('EPUB package has no spine items.');
    return{document:finalizeCanonicalDocument({source:input,format:'EPUB',strategy:'EPUB_XHTML',blocks:blocksOut,tables,metadata:pkg.metadata,warnings,raw:{parser:'P2LRN_EPUB_V1',rootfile:pkg.rootfile,spineItems:pkg.spine.length}}),assets};
  }
};
