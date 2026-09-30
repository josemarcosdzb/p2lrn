import type {DocumentBlock, DocumentReaderDetection, DocumentReaderInput, DocumentTable, LightweightExtractedDocument} from './types.js';
import {blockTypeForText, decodeXml, finalizeBlocks, finalizeTables, normalizeText, stableId} from './utils.js';

function textBlocks(lines:string[], source:DocumentReaderDetection['type']):DocumentBlock[] {
  const blocks:DocumentBlock[]=[];
  let paragraph:string[]=[];

  const flush=()=>{
    const text=paragraph.join(' ').replace(/\s+/gu,' ').trim();
    paragraph=[];
    if(!text)return;
    blocks.push({
      id:stableId('text_block',blocks.length+1),
      type:blockTypeForText(text),
      text,
      order:blocks.length+1,
      source:{type:source},
    });
  };

  lines.forEach((raw,index)=>{
    const line=raw.trim();
    if(!line){flush();return;}
    const md=line.match(/^(#{1,6})\s+(.+)$/u);
    if(md){
      flush();
      blocks.push({
        id:stableId('heading',blocks.length+1),
        type:'TITLE',
        text:md[2]!.trim(),
        order:blocks.length+1,
        level:md[1]!.length,
        source:{type:source,raw:{line:index+1}},
      });
      return;
    }
    if(/^(?:[-*•]|\d+[.)])\s+/u.test(line)){
      flush();
      blocks.push({
        id:stableId('list',blocks.length+1),
        type:blockTypeForText(line,'LIST'),
        text:line.replace(/^(?:[-*•]|\d+[.)])\s+/u,''),
        order:blocks.length+1,
        source:{type:source,raw:{line:index+1}},
      });
      return;
    }
    if(line.endsWith('?')||/^(?:respuesta|soluci[oó]n|answer)\s*:/iu.test(line)||/^(?:[A-H][.)]|\([A-H]\))\s+/u.test(line)){
      flush();
      blocks.push({
        id:stableId('qa',blocks.length+1),
        type:blockTypeForText(line),
        text:line,
        order:blocks.length+1,
        source:{type:source,raw:{line:index+1}},
      });
      return;
    }
    if(line.length<=120 && index<20 && !/[.;,:]$/u.test(line) && line===line.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/u.test(line)){
      flush();
      blocks.push({
        id:stableId('heading',blocks.length+1),
        type:'TITLE',
        text:line,
        order:blocks.length+1,
        level:2,
        source:{type:source,raw:{line:index+1}},
      });
      return;
    }
    paragraph.push(line);
  });
  flush();
  return finalizeBlocks(blocks);
}

function stripHtml(value:string):string {
  return decodeXml(value
    .replace(/<script\b[\s\S]*?<\/script>/giu,' ')
    .replace(/<style\b[\s\S]*?<\/style>/giu,' ')
    .replace(/<\/(?:p|div|section|article|h[1-6]|li|tr|blockquote)>/giu,'\n')
    .replace(/<br\s*\/?>/giu,'\n')
    .replace(/<li\b[^>]*>/giu,'- ')
    .replace(/<[^>]+>/gu,' '));
}

function stripRtf(value:string):string {
  return value
    .replace(/\\par[d]?\b/giu,'\n')
    .replace(/\\tab\b/giu,'\t')
    .replace(/\\'[0-9a-f]{2}/giu,' ')
    .replace(/\\[a-z]+-?\d* ?/giu,'')
    .replace(/[{}]/gu,' ')
    .replace(/\s+/gu,' ')
    .replace(/ ?\n ?/gu,'\n');
}

function stripTex(value:string):string {
  return value
    .replace(/%.*$/gmu,'')
    .replace(/\\(?:section|subsection|subsubsection)\*?\{([^}]*)\}/giu,'\n#$1\n')
    .replace(/\\(?:textbf|textit|emph)\{([^}]*)\}/giu,'$1')
    .replace(/\\begin\{[^}]+\}|\\end\{[^}]+\}/giu,'\n')
    .replace(/\\[a-zA-Z]+(?:\[[^\]]*\])?/gu,' ')
    .replace(/[{}]/gu,' ');
}

function flattenJson(value:unknown,prefix='',out:string[]=[]):string[] {
  if(value===null||typeof value!=='object'){
    out.push((prefix?prefix+': ':'')+String(value??''));
    return out;
  }
  if(Array.isArray(value)){
    value.forEach((item,index)=>flattenJson(item,prefix?prefix+'['+index+']':'['+index+']',out));
    return out;
  }
  for(const [key,item] of Object.entries(value as Record<string,unknown>)){
    flattenJson(item,prefix?prefix+'.'+key:key,out);
  }
  return out;
}

function parseCsvLine(line:string,delimiter:string):string[] {
  const cells:string[]=[];
  let current='';
  let quoted=false;
  for(let i=0;i<line.length;i+=1){
    const char=line[i]!;
    if(char==='"'){
      if(quoted&&line[i+1]==='"'){current+='"';i+=1;}
      else quoted=!quoted;
      continue;
    }
    if(char===delimiter&&!quoted){cells.push(current.trim());current='';continue;}
    current+=char;
  }
  cells.push(current.trim());
  return cells;
}

function csvTable(text:string):DocumentTable|null {
  const lines=normalizeText(text).split('\n').filter(Boolean);
  if(!lines.length)return null;
  const delimiter=(lines[0]!.match(/;/gu)?.length??0)>(lines[0]!.match(/,/gu)?.length??0)?';':',';
  const rows=lines.map(line=>parseCsvLine(line,delimiter));
  if(!rows.length)return null;
  const first=rows[0]??[];
  const columns=first.map((value,index)=>value||'column_'+(index+1));
  const data=rows.slice(1).map(row=>Object.fromEntries(columns.map((column,index)=>[column,row[index]??''])));
  return {id:'csv_table_0001',order:1,name:'CSV',columns,rows:data};
}

export async function readTextDocument(
  input:DocumentReaderInput,
  detection:DocumentReaderDetection,
):Promise<LightweightExtractedDocument> {
  let text=new TextDecoder('utf-8',{fatal:false}).decode(input.bytes);
  const tables:DocumentTable[]=[];
  let blocks:DocumentBlock[]=[];

  if(detection.type==='HTML') text=stripHtml(text);
  else if(detection.type==='RTF') text=stripRtf(text);
  else if(detection.type==='TEX') text=stripTex(text);
  else if(detection.type==='XML') text=decodeXml(text.replace(/<[^>]+>/gu,'\n'));
  else if(detection.type==='JSON'){
    try{text=flattenJson(JSON.parse(text)).join('\n');}
    catch(error){throw new Error('Invalid JSON document: '+(error instanceof Error?error.message:String(error)));}
  }

  text=normalizeText(text);

  if(detection.type==='CSV'){
    const table=csvTable(text);
    if(!table)throw new Error('CSV document is empty.');
    tables.push(table);
    blocks=[{
      id:'csv_table_block_0001',
      type:'TABLE',
      text:'CSV',
      order:1,
      source:{type:'CSV',raw:{tableId:table.id}},
    }];
  }else{
    blocks=textBlocks(text.split('\n'),detection.type);
  }

  if(!blocks.length)throw new Error(detection.type+' document is empty after lightweight parsing.');

  return {
    version:'p2lrn.document-reader.v1',
    source:{
      name:detection.name,
      extension:detection.extension,
      mediaType:detection.mediaType,
      detectedType:detection.type,
      extractionStrategy:detection.type+'_LIGHT_TEXT',
    },
    metadata:{detectedTitle:blocks.find(block=>block.type==='TITLE')?.text},
    blocks:finalizeBlocks(blocks),
    tables:finalizeTables(tables),
    assets:[],
    warnings:[],
  };
}
