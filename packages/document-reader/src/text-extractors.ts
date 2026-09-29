import type {CanonicalDocument, DocumentBlock, DocumentInput, FileDetection, ReaderOptions} from './types.js';
import {DocumentReaderError} from './types.js';
import {nextId, normalizeText, objectValue, stripTags} from './utils.js';
import {readZip} from './zip.js';

function base(file: DocumentInput, detection: FileDetection, strategy: CanonicalDocument['origin']['extractionStrategy']): Omit<CanonicalDocument,'metadata'|'blocks'|'tables'|'warnings'> {
  return {
    version:'p2lrn.document-reader.v1',
    origin:{
      fileName:detection.fileName,
      originalExtension:detection.extension,
      originalMime:detection.mimeType,
      detectedType:detection.type,
      extractionStrategy:strategy,
    },
  };
}

export async function readTxt(file: DocumentInput, detection: FileDetection): Promise<CanonicalDocument> {
  const text=normalizeText(file.buffer.toString('utf8'));
  if(!text) throw new DocumentReaderError('TXT file is empty.','P2LRN_READER_EMPTY');
  const blocks:DocumentBlock[]=[];
  let blank=0;
  for(const raw of file.buffer.toString('utf8').replace(/\r\n?/g,'\n').split('\n')){
    const line=raw.trim();
    if(!line){blank++;continue;}
    blocks.push({
      id:nextId('txt'),
      type:'PARAGRAPH',
      text:line,
      order:blocks.length+1,
      source:{type:'TXT',raw:{blankLinesBefore:blocks.length===0?0:blank}},
    });
    blank=0;
  }
  return {...base(file,detection,'TXT_LINES'),metadata:{},blocks,tables:[],warnings:[]};
}

export async function readMarkdown(file: DocumentInput, detection: FileDetection): Promise<CanonicalDocument> {
  const text=normalizeText(file.buffer.toString('utf8'));
  if(!text) throw new DocumentReaderError('Markdown file is empty.','P2LRN_READER_EMPTY');
  const blocks:DocumentBlock[]=[];
  for(const raw of text.split('\n')){
    const line=raw.trim(); if(!line) continue;
    const heading=/^(#{1,6})\s+(.+)$/u.exec(line);
    if(heading){
      blocks.push({id:nextId('md_h'),type:'TITLE',text:heading[2]!.trim(),level:heading[1]!.length,order:blocks.length+1,source:{type:'MARKDOWN',raw:{markdown:line}}});
      continue;
    }
    const list=/^[-*+]\s+(.+)$/u.exec(line);
    blocks.push({id:nextId('md'),type:list?'LIST':'PARAGRAPH',text:(list?.[1]??line).trim(),order:blocks.length+1,source:{type:'MARKDOWN',raw:{markdown:line}}});
  }
  return {...base(file,detection,'MARKDOWN_LINES'),metadata:{detectedTitle:blocks.find(x=>x.type==='TITLE')?.text},blocks,tables:[],warnings:[]};
}

function detectSeparator(text:string){
  const line=text.split(/\r?\n/u).find(x=>x.trim())??'';
  return [',',';','\t'].map(separator=>({separator,count:(line.match(new RegExp(separator==='\t'?'\\t':`\\${separator}`,'g'))??[]).length})).sort((a,b)=>b.count-a.count)[0]?.separator??',';
}
function parseCsv(text:string, separator:string){
  const rows:string[][]=[]; let row:string[]=[]; let cell=''; let quoted=false;
  for(let i=0;i<text.length;i+=1){
    const ch=text[i]!; const next=text[i+1];
    if(ch==='"'&&quoted&&next==='"'){cell+='"';i++;continue;}
    if(ch==='"'){quoted=!quoted;continue;}
    if(ch===separator&&!quoted){row.push(cell.trim());cell='';continue;}
    if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&next==='\n')i++;
      row.push(cell.trim()); if(row.some(Boolean))rows.push(row);
      row=[];cell='';continue;
    }
    cell+=ch;
  }
  row.push(cell.trim()); if(row.some(Boolean))rows.push(row);
  return rows;
}

export async function readCsv(file:DocumentInput,detection:FileDetection):Promise<CanonicalDocument>{
  const text=normalizeText(file.buffer.toString('utf8'));
  if(!text)throw new DocumentReaderError('CSV file is empty.','P2LRN_READER_EMPTY');
  const matrix=parseCsv(text,detectSeparator(text));
  if(!matrix.length)throw new DocumentReaderError('CSV has no readable rows.','P2LRN_READER_EMPTY');
  const columns=(matrix[0]??[]).map((v,i)=>v.trim()||`column_${i+1}`);
  const rows=matrix.slice(1).map(row=>Object.fromEntries(columns.map((c,i)=>[c,row[i]??''])));
  const blocks=rows.map((row,i):DocumentBlock=>({id:nextId('csv'),type:'METADATA',text:JSON.stringify(row),order:i+1,source:{type:'CSV',raw:row}}));
  return {...base(file,detection,'CSV_TABLE'),metadata:{},blocks,tables:[{id:nextId('csv_table'),order:1,name:'CSV',columns,rows}],warnings:[]};
}

export async function readJson(file:DocumentInput,detection:FileDetection):Promise<CanonicalDocument>{
  const text=normalizeText(file.buffer.toString('utf8'));
  if(!text)throw new DocumentReaderError('JSON file is empty.','P2LRN_READER_EMPTY');
  let raw:unknown;
  try{raw=JSON.parse(text);}catch(error){throw new DocumentReaderError(`Invalid JSON: ${error instanceof Error?error.message:'parse error'}`,'P2LRN_READER_JSON');}
  const obj=objectValue(raw); const course=objectValue(obj?.course??obj?.curso);
  const title=[course?.title,course?.titulo,obj?.title,obj?.titulo].find(v=>typeof v==='string'&&v.trim()) as string|undefined;
  const source=Array.isArray(obj?.content)?obj?.content:Array.isArray(obj?.contenido)?obj?.contenido:[];
  const lines=(source as unknown[]).flatMap(v=>typeof v==='string'?v.split(/\r?\n/u):[]).map(normalizeText).filter(Boolean);
  const blocks=lines.length?lines.map((line,i):DocumentBlock=>({id:nextId('json'),type:'PARAGRAPH',text:line,order:i+1,source:{type:'JSON'}})):[{id:nextId('json_raw'),type:'METADATA',text,order:1,source:{type:'JSON',raw:obj??{}}}];
  return {...base(file,detection,'JSON_CANONICAL'),metadata:{detectedTitle:title?.trim()},blocks,tables:[],raw,warnings:[]};
}

function cleanRtf(text:string){
  return normalizeText(text
    .replace(/\\par[d]?\b/gu,'\n')
    .replace(/\\'[0-9a-fA-F]{2}/gu,' ')
    .replace(/\\[a-zA-Z]+-?\d* ?/gu,' ')
    .replace(/[{}]/g,' '));
}
function cleanTex(text:string){
  return normalizeText(text
    .replace(/%.*$/gmu,'')
    .replace(/\\(?:section|subsection|subsubsection|chapter|title)\*?\{([^}]*)\}/gu,'\n$1\n')
    .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/gu,' ')
    .replace(/[{}]/g,' '));
}

export async function readStructured(file:DocumentInput,detection:FileDetection,options:ReaderOptions={}):Promise<CanonicalDocument>{
  let text=''; let strategy:CanonicalDocument['origin']['extractionStrategy']='HTML_TEXT';
  if(detection.type==='ODT'){
    const entries=await readZip(file.buffer,options);
    text=stripTags(entries.get('content.xml')?.toString('utf8')??'');
    strategy='ODT_XML';
  } else if(detection.type==='EPUB'){
    const entries=await readZip(file.buffer,options);
    const parts=[...entries.entries()].filter(([name])=>/\.(?:xhtml|html|htm)$/iu.test(name)).sort(([a],[b])=>a.localeCompare(b)).map(([,data])=>stripTags(data.toString('utf8'))).filter(Boolean);
    text=normalizeText(parts.join('\n\n'));
    strategy='EPUB_XHTML';
  } else {
    const raw=file.buffer.toString('utf8');
    switch(detection.type){
      case 'HTML': text=stripTags(raw); strategy='HTML_TEXT'; break;
      case 'RTF': text=cleanRtf(raw); strategy='RTF_TEXT'; break;
      case 'TEX': text=cleanTex(raw); strategy='TEX_TEXT'; break;
      case 'XML': text=stripTags(raw); strategy='XML_TEXT'; break;
      case 'YAML': text=normalizeText(raw); strategy='YAML_TEXT'; break;
      default: text=normalizeText(raw); strategy='TXT_LINES'; break;
    }
  }
  if(!text)throw new DocumentReaderError(`${detection.type} contains no readable text.`,'P2LRN_READER_EMPTY');
  const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
  const blocks=lines.map((line,i):DocumentBlock=>({id:nextId('structured'),type:'PARAGRAPH',text:line,order:i+1,source:{type:detection.type}}));
  return {...base(file,detection,strategy),metadata:{detectedTitle:lines.find(x=>x.length>=4&&x.length<=120)},blocks,tables:[],warnings:[]};
}
