import type {DocumentBlock, DocumentReaderDetection, DocumentReaderInput, DocumentReaderOptions, DocumentTable, LightweightExtractedDocument} from './types.js';
import {imageAssetsFromEntries, readZipEntries} from './archive.js';
import {pptxCanvas, pptxImagePlacements, pptxShapePosition, relationshipIds} from './office.js';
import {assetByPath, blockTypeForText, decodeXml, finalizeBlocks, finalizeTables, stableId} from './utils.js';

function slideNumber(path:string):number {
  return Number(path.match(/slide(\d+)\.xml$/iu)?.[1]??0);
}

function textsFromParagraph(xml:string):string[] {
  const values=[...xml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/giu)]
    .map(match=>decodeXml(match[1]??'').trim())
    .filter(Boolean);
  return values;
}

function tableFromPptx(xml:string,slide:number,index:number):DocumentTable|null {
  const tableXml=xml.match(/<a:tbl[\s\S]*?<\/a:tbl>/iu)?.[0];
  if(!tableXml)return null;
  const rows=(tableXml.match(/<a:tr[\s\S]*?<\/a:tr>/giu)??[])
    .map(row=>(row.match(/<a:tc[\s\S]*?<\/a:tc>/giu)??[])
      .map(cell=>[...cell.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/giu)]
        .map(match=>decodeXml(match[1]??''))
        .join(' ')
        .replace(/\s+/gu,' ')
        .trim()))
    .filter(row=>row.some(Boolean));
  if(!rows.length)return null;
  const first=rows[0]??[];
  const columns=first.map((value,column)=>value||'column_'+(column+1));
  const data=rows.slice(1).map(row=>Object.fromEntries(columns.map((column,columnIndex)=>[column,row[columnIndex]??''])));
  return {
    id:stableId('pptx_table',index+1),
    order:index+1,
    sheet:'Slide '+slide,
    name:'Table '+(index+1)+' - slide '+slide,
    columns,
    rows:data.length?data:[Object.fromEntries(columns.map(column=>[column,'']))],
  };
}

interface SlideElement {
  index:number;
  kind:'text'|'image'|'table';
  xml:string;
  x:number;
  y:number;
  position?:{x?:number;y?:number;width?:number;height?:number};
}

function slideElements(xml:string):SlideElement[] {
  const elements:SlideElement[]=[];
  const matches=[...xml.matchAll(/<p:(sp|pic|graphicFrame)\b[\s\S]*?<\/p:\1>/giu)];
  matches.forEach((match,index)=>{
    const fragment=match[0];
    const tag=(match[1]??'').toLowerCase();
    const position=pptxShapePosition(fragment);
    const kind:SlideElement['kind']=tag==='pic'?'image':/<a:tbl\b/iu.test(fragment)?'table':'text';
    elements.push({
      index,
      kind,
      xml:fragment,
      x:position?.x??Number.MAX_SAFE_INTEGER,
      y:position?.y??Number.MAX_SAFE_INTEGER,
      position,
    });
  });
  return elements.sort((a,b)=>{
    const ay=a.y===Number.MAX_SAFE_INTEGER?Number.MAX_SAFE_INTEGER:a.y;
    const by=b.y===Number.MAX_SAFE_INTEGER?Number.MAX_SAFE_INTEGER:b.y;
    if(Math.abs(ay-by)>2)return ay-by;
    if(Math.abs(a.x-b.x)>2)return a.x-b.x;
    return a.index-b.index;
  });
}

export async function readPptx(
  input:DocumentReaderInput,
  detection:DocumentReaderDetection,
  options:DocumentReaderOptions,
):Promise<LightweightExtractedDocument> {
  const entries=readZipEntries(input.bytes);
  const slidePaths=[...entries.keys()]
    .filter(path=>/^ppt\/slides\/slide\d+\.xml$/iu.test(path))
    .sort((a,b)=>slideNumber(a)-slideNumber(b));
  if(!slidePaths.length)throw new Error('PPTX contains no readable slides.');

  const maxAssets=options.limits?.maxAssets??300;
  const maxAssetBytes=options.limits?.maxAssetBytes??64*1024*1024;
  const assets=imageAssetsFromEntries(entries,['ppt/media/'],maxAssets,maxAssetBytes);
  const assetsByPath=assetByPath(assets);
  const blocks:DocumentBlock[]=[];
  const tables:DocumentTable[]=[];
  const warnings:LightweightExtractedDocument['warnings']=[];
  const canvas=pptxCanvas(entries);

  for(const slidePath of slidePaths){
    const slide=slideNumber(slidePath);
    const sheet='Slide '+slide;
    const xml=new TextDecoder('utf-8',{fatal:false}).decode(entries.get(slidePath)??new Uint8Array());
    const placements=pptxImagePlacements(entries,slidePath,slide);
    const placementByRelationship=new Map(placements.filter(p=>p.relationshipId).map(p=>[p.relationshipId!,p]));

    for(const element of slideElements(xml)){
      if(element.kind==='image'){
        const rid=relationshipIds(element.xml)[0];
        const placement=rid?placementByRelationship.get(rid):undefined;
        if(!placement){
          warnings.push({path:'pptx.images',message:'PPTX image relationship could not be resolved on slide '+slide+'.',level:'WARNING'});
          continue;
        }
        const asset=assetsByPath.get(placement.path);
        if(!asset){
          warnings.push({path:'pptx.images',message:'Referenced PPTX image was not extracted: '+placement.path,level:'WARNING'});
          continue;
        }
        blocks.push({
          id:stableId('pptx_image',blocks.length+1),
          type:'IMAGE',
          text:asset.name,
          order:blocks.length+1,
          sheet,
          position:placement.position??element.position,
          assetId:asset.id,
          source:{type:'PPTX',raw:{slide,path:placement.path,relationshipId:placement.relationshipId,canvas}},
        });
        continue;
      }

      if(element.kind==='table'){
        const table=tableFromPptx(element.xml,slide,tables.length);
        if(table){
          tables.push(table);
          blocks.push({
            id:stableId('pptx_table_block',blocks.length+1),
            type:'TABLE',
            text:table.name??'Table',
            order:blocks.length+1,
            sheet,
            position:element.position,
            source:{type:'PPTX',raw:{slide,tableId:table.id,canvas}},
          });
        }
        continue;
      }

      const isTitle=/<p:ph\b[^>]*type="(?:title|ctrTitle)"/iu.test(element.xml);
      const paragraphs=element.xml.match(/<a:p[\s\S]*?<\/a:p>/giu)??[element.xml];
      paragraphs.forEach((paragraph,paragraphIndex)=>{
        const values=textsFromParagraph(paragraph);
        if(!values.length)return;
        const text=values.join(' ').replace(/\s+/gu,' ').trim();
        if(!text)return;
        const bullet=/<a:bu(?:Char|AutoNum|Blip)\b/iu.test(paragraph);
        const type=isTitle&&paragraphIndex===0?'TITLE':bullet?'LIST':blockTypeForText(text);
        blocks.push({
          id:stableId(type==='TITLE'?'pptx_title':'pptx_text',blocks.length+1),
          type,
          text,
          order:blocks.length+1,
          level:type==='TITLE'?2:undefined,
          sheet,
          position:element.position,
          source:{type:'PPTX',raw:{slide,shapeIndex:element.index,paragraphIndex,canvas}},
        });
      });
    }
  }

  if(!blocks.length)throw new Error('PPTX contains no lightweight-readable text, tables or images.');

  return {
    version:'p2lrn.document-reader.v1',
    source:{
      name:detection.name,
      extension:detection.extension,
      mediaType:detection.mediaType,
      detectedType:'PPTX',
      extractionStrategy:'PPTX_SLIDES_XML_LIGHT',
    },
    metadata:{
      detectedTitle:blocks.find(block=>block.type==='TITLE')?.text,
      sheets:slidePaths.map(path=>'Slide '+slideNumber(path)),
    },
    blocks:finalizeBlocks(blocks),
    tables:finalizeTables(tables),
    assets,
    warnings:assets.length?[{path:'pptx.images',message:'PPTX: '+assets.length+' embedded image(s) kept in memory without OCR.',level:'INFO'}]:[],
  };
}
