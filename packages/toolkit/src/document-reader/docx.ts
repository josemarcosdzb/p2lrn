import type {DocumentAsset, DocumentBlock, DocumentReaderDetection, DocumentReaderInput, DocumentReaderOptions, DocumentTable, LightweightExtractedDocument} from './types.js';
import {imageAssetsFromEntries, readZipEntries} from './archive.js';
import {docxImagePlacements} from './office.js';
import {assetByPath, blockTypeForText, decodeXml, finalizeBlocks, finalizeTables, stableId} from './utils.js';

function paragraphStyle(xml:string):{level?:number;bold:boolean;italic:boolean;underline:boolean} {
  const style=xml.match(/<w:pStyle[^>]+w:val="([^"]+)"/iu)?.[1]??'';
  const heading=style.match(/heading([1-6])/iu)??style.match(/t[ií]tulo([1-6])/iu);
  return {
    level:heading?Number(heading[1]):undefined,
    bold:/<w:b(?:\s|\/|>)/iu.test(xml),
    italic:/<w:i(?:\s|\/|>)/iu.test(xml),
    underline:/<w:u(?:\s|\/|>)/iu.test(xml),
  };
}

function runText(xml:string):string {
  const parts=[...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/giu)]
    .map(match=>decodeXml(match[1]??''));
  let value=parts.join('');
  if(/<w:(?:br|cr)[^>]*\/>/iu.test(xml)) value+='\n';
  if(/<w:tab[^>]*\/>/iu.test(xml)) value+='\t';
  return value;
}

function tableFromXml(xml:string,index:number):DocumentTable|null {
  const rows=(xml.match(/<w:tr[\s\S]*?<\/w:tr>/giu)??[])
    .map(row=>(row.match(/<w:tc[\s\S]*?<\/w:tc>/giu)??[])
      .map(cell=>[...cell.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/giu)]
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
    id:stableId('docx_table',index+1),
    order:index+1,
    name:'Table '+(index+1),
    columns,
    rows:data.length?data:[Object.fromEntries(columns.map(column=>[column,'']))],
  };
}

export async function readDocx(
  input:DocumentReaderInput,
  detection:DocumentReaderDetection,
  options:DocumentReaderOptions,
):Promise<LightweightExtractedDocument> {
  const entries=readZipEntries(input.bytes);
  const documentBytes=entries.get('word/document.xml');
  if(!documentBytes)throw new Error('DOCX does not contain word/document.xml.');
  const documentXml=new TextDecoder('utf-8',{fatal:false}).decode(documentBytes);
  const maxAssets=options.limits?.maxAssets??300;
  const maxAssetBytes=options.limits?.maxAssetBytes??64*1024*1024;
  const assets=imageAssetsFromEntries(entries,['word/media/'],maxAssets,maxAssetBytes);
  const assetsByPath=assetByPath(assets);
  const placements=docxImagePlacements(entries);
  const placementMap=new Map<string,typeof placements>();
  for(const placement of placements){
    const key=String(placement.paragraphIndex??-1)+':'+String(placement.runIndex??-1);
    placementMap.set(key,[...(placementMap.get(key)??[]),placement]);
  }

  const blocks:DocumentBlock[]=[];
  const tables:DocumentTable[]=[];
  const warnings:LightweightExtractedDocument['warnings']=[];
  const body=documentXml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/iu)?.[1]??documentXml;
  const nodes=[...body.matchAll(/<w:(p|tbl)\b[\s\S]*?<\/w:\1>/giu)];
  let paragraphIndex=0;

  const pushParagraphText=(text:string,style:ReturnType<typeof paragraphStyle>,paragraph:number,segment:number)=>{
    const normalized=text.replace(/[ \t]+/gu,' ').replace(/ *\n */gu,'\n').trim();
    if(!normalized)return;
    const heading=style.level!==undefined;
    blocks.push({
      id:stableId(heading?'docx_heading':'docx_text',blocks.length+1),
      type:heading?'TITLE':blockTypeForText(normalized),
      text:normalized,
      order:blocks.length+1,
      level:style.level,
      style:{bold:style.bold||undefined,italic:style.italic||undefined,underline:style.underline||undefined},
      source:{type:'DOCX',raw:{paragraphIndex:paragraph,segment}},
    });
  };

  for(const match of nodes){
    const kind=(match[1]??'').toLowerCase();
    const xml=match[0];
    if(kind==='tbl'){
      const table=tableFromXml(xml,tables.length);
      if(table){
        tables.push(table);
        blocks.push({
          id:stableId('docx_table_block',blocks.length+1),
          type:'TABLE',
          text:table.name??'Table',
          order:blocks.length+1,
          source:{type:'DOCX',raw:{tableId:table.id}},
        });
      }
      continue;
    }

    const style=paragraphStyle(xml);
    const runs=xml.match(/<w:r[\s\S]*?<\/w:r>/giu)??[xml];
    let pending='';
    let segment=0;
    runs.forEach((run,runIndex)=>{
      pending+=runText(run);
      const runPlacements=placementMap.get(String(paragraphIndex)+':'+String(runIndex))??[];
      if(runPlacements.length){
        pushParagraphText(pending,style,paragraphIndex,segment++);
        pending='';
        for(const placement of runPlacements){
          const asset=assetsByPath.get(placement.path);
          if(!asset){
            warnings.push({path:'docx.images',message:'Referenced DOCX image was not extracted: '+placement.path,level:'WARNING'});
            continue;
          }
          blocks.push({
            id:stableId('docx_image',blocks.length+1),
            type:'IMAGE',
            text:asset.name,
            order:blocks.length+1,
            position:placement.position,
            assetId:asset.id,
            source:{type:'DOCX',raw:{path:placement.path,paragraphIndex,runIndex,relationshipId:placement.relationshipId}},
          });
        }
      }
    });
    pushParagraphText(pending,style,paragraphIndex,segment);
    paragraphIndex+=1;
  }

  if(!blocks.length)throw new Error('DOCX contains no lightweight-readable text, tables or images.');

  return {
    version:'p2lrn.document-reader.v1',
    source:{
      name:detection.name,
      extension:detection.extension,
      mediaType:detection.mediaType,
      detectedType:'DOCX',
      extractionStrategy:'DOCX_XML_LIGHT',
    },
    metadata:{detectedTitle:blocks.find(block=>block.type==='TITLE')?.text},
    blocks:finalizeBlocks(blocks),
    tables:finalizeTables(tables),
    assets,
    warnings:[
      ...(assets.length?[{path:'docx.images',message:'DOCX: '+assets.length+' embedded image(s) kept in memory without OCR.',level:'INFO' as const}]:[]),
      ...warnings,
    ],
  };
}
