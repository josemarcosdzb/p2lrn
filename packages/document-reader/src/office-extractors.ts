import type {CanonicalDocument, DocumentBlock, DocumentInput, ExtractedTable, FileDetection, ReaderOptions} from './types.js';
import {DocumentReaderError} from './types.js';
import {decodeXmlEntities, nextId, normalizeText} from './utils.js';
import {readZip} from './zip.js';

function base(file:DocumentInput,detection:FileDetection,strategy:CanonicalDocument['origin']['extractionStrategy']){
  return {
    version:'p2lrn.document-reader.v1' as const,
    origin:{
      fileName:detection.fileName,
      originalExtension:detection.extension,
      originalMime:detection.mimeType,
      detectedType:detection.type,
      extractionStrategy:strategy,
    },
  };
}

function xmlText(value:string){
  return normalizeText(
    decodeXmlEntities(
      value
        .replace(/<w:(?:br|cr)[^>]*\/>/giu,'\n')
        .replace(/<w:tab[^>]*\/>/giu,'\t')
        .replace(/<a:br[^>]*\/>/giu,'\n')
        .replace(/<[^>]+>/gu,' ')
    )
  );
}

function extractWordRuns(xml:string){
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/giu)]
    .map(match=>decodeXmlEntities(match[1]??''))
    .join('');
}

function docxParagraphType(xml:string){
  const style=/<w:pStyle[^>]*w:val=["']([^"']+)["']/iu.exec(xml)?.[1]?.toLowerCase()??'';
  if(style==='title'||style.includes('heading1')||style.includes('titulo1')) return {type:'TITLE' as const,level:style==='title'?1:1};
  const heading=/heading\s*([1-6])|titulo\s*([1-6])/iu.exec(style);
  if(heading){
    const level=Number(heading[1]??heading[2]??1);
    return {type:level<=1?'TITLE' as const:'SUBTITLE' as const,level};
  }
  if(/<w:numPr\b/iu.test(xml)) return {type:'LIST' as const};
  return {type:'PARAGRAPH' as const};
}

export async function readDocx(file:DocumentInput,detection:FileDetection,options:ReaderOptions={}):Promise<CanonicalDocument>{
  const entries=await readZip(file.buffer,options);
  const documentXml=entries.get('word/document.xml')?.toString('utf8');
  if(!documentXml) throw new DocumentReaderError('DOCX has no word/document.xml.','P2LRN_READER_DOCX');

  const blocks:DocumentBlock[]=[];
  for(const match of documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/giu)){
    const paragraph=match[0];
    const text=normalizeText(extractWordRuns(paragraph));
    if(!text) continue;
    const kind=docxParagraphType(paragraph);
    blocks.push({
      id:nextId('docx'),
      type:kind.type,
      text,
      order:blocks.length+1,
      level:kind.level,
      source:{type:'DOCX',raw:{style:/<w:pStyle[^>]*w:val=["']([^"']+)["']/iu.exec(paragraph)?.[1]??null}},
    });
  }

  const tables:ExtractedTable[]=[];
  for(const tableMatch of documentXml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/giu)){
    const rows=[...tableMatch[0].matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/giu)].map(rowMatch=>
      [...rowMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/giu)].map(cell=>normalizeText(extractWordRuns(cell[0])))
    );
    if(!rows.length) continue;
    const width=Math.max(...rows.map(row=>row.length),0);
    const columns=Array.from({length:width},(_,i)=>rows[0]?.[i]?.trim()||`column_${i+1}`);
    const dataRows=rows.slice(1).map(row=>Object.fromEntries(columns.map((column,i)=>[column,row[i]??''])));
    tables.push({id:nextId('docx_table'),order:tables.length+1,columns,rows:dataRows});
    blocks.push({id:nextId('docx_table_block'),type:'TABLE',text:columns.join(' | '),order:blocks.length+1,source:{type:'DOCX',raw:{tableIndex:tables.length}}});
  }

  const core=entries.get('docProps/core.xml')?.toString('utf8')??'';
  const title=/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/iu.exec(core)?.[1];
  const creator=/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/iu.exec(core)?.[1];

  return {
    ...base(file,detection,'DOCX_XML'),
    metadata:{
      detectedTitle:normalizeText(title??'')||blocks.find(x=>x.type==='TITLE')?.text||blocks[0]?.text,
      author:normalizeText(creator??'')||undefined,
    },
    blocks,
    tables,
    warnings:[],
  };
}

function slideNumber(name:string){
  return Number(/slide(\d+)\.xml$/iu.exec(name)?.[1]??Number.MAX_SAFE_INTEGER);
}

export async function readPptx(file:DocumentInput,detection:FileDetection,options:ReaderOptions={}):Promise<CanonicalDocument>{
  const entries=await readZip(file.buffer,options);
  const slides=[...entries.entries()]
    .filter(([name])=>/^ppt\/slides\/slide\d+\.xml$/iu.test(name))
    .sort(([a],[b])=>slideNumber(a)-slideNumber(b));
  if(!slides.length) throw new DocumentReaderError('PPTX contains no readable slides.','P2LRN_READER_PPTX');

  const blocks:DocumentBlock[]=[];
  for(const [name,data] of slides){
    const slide=slideNumber(name);
    const xml=data.toString('utf8');
    const paragraphs=[...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/giu)]
      .map(match=>[...match[0].matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/giu)].map(x=>decodeXmlEntities(x[1]??'')).join(''))
      .map(normalizeText)
      .filter(Boolean);
    const lines=paragraphs.length?paragraphs:[...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/giu)].map(x=>normalizeText(decodeXmlEntities(x[1]??''))).filter(Boolean);
    lines.forEach((text,index)=>{
      blocks.push({
        id:nextId('pptx'),
        type:index===0?'TITLE':'PARAGRAPH',
        text,
        order:blocks.length+1,
        page:slide,
        sheet:`Slide ${slide}`,
        source:{type:'PPTX',raw:{slide,index}},
      });
    });
  }
  return {
    ...base(file,detection,'PPTX_SLIDES_XML'),
    metadata:{
      detectedTitle:blocks.find(x=>x.type==='TITLE')?.text,
      pages:slides.length,
      sheets:slides.map(([,],i)=>`Slide ${i+1}`),
    },
    blocks,
    tables:[],
    warnings:[],
  };
}

function excelColumn(ref:string){
  const letters=/^[A-Z]+/u.exec(ref.toUpperCase())?.[0]??'';
  let value=0;
  for(const ch of letters) value=value*26+(ch.charCodeAt(0)-64);
  return Math.max(0,value-1);
}

function readSharedStrings(xml:string){
  return [...xml.matchAll(/<si\b[\s\S]*?<\/si>/giu)].map(si=>
    [...si[0].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/giu)].map(t=>decodeXmlEntities(t[1]??'')).join('')
  );
}

function sheetNames(entries:Map<string,Buffer>){
  const workbook=entries.get('xl/workbook.xml')?.toString('utf8')??'';
  const names=new Map<number,string>();
  let index=1;
  for(const match of workbook.matchAll(/<sheet\b[^>]*name=["']([^"']+)["'][^>]*>/giu)){
    names.set(index++,decodeXmlEntities(match[1]??''));
  }
  return names;
}

export async function readXlsx(file:DocumentInput,detection:FileDetection,options:ReaderOptions={}):Promise<CanonicalDocument>{
  const entries=await readZip(file.buffer,options);
  const shared=readSharedStrings(entries.get('xl/sharedStrings.xml')?.toString('utf8')??'');
  const names=sheetNames(entries);
  const worksheets=[...entries.entries()]
    .filter(([name])=>/^xl\/worksheets\/sheet\d+\.xml$/iu.test(name))
    .sort(([a],[b])=>Number(/sheet(\d+)/u.exec(a)?.[1]??0)-Number(/sheet(\d+)/u.exec(b)?.[1]??0));
  if(!worksheets.length) throw new DocumentReaderError('XLSX contains no readable worksheets.','P2LRN_READER_XLSX');

  const blocks:DocumentBlock[]=[];
  const tables:ExtractedTable[]=[];
  for(const [name,data] of worksheets){
    const number=Number(/sheet(\d+)/u.exec(name)?.[1]??tables.length+1);
    const sheet=names.get(number)??`Sheet ${number}`;
    const rows:string[][]=[];
    for(const rowMatch of data.toString('utf8').matchAll(/<row\b[\s\S]*?<\/row>/giu)){
      const cells:string[]=[];
      for(const cellMatch of rowMatch[0].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/giu)){
        const attrs=cellMatch[1]??''; const body=cellMatch[2]??'';
        const ref=/\br=["']([^"']+)["']/iu.exec(attrs)?.[1]??'';
        const type=/\bt=["']([^"']+)["']/iu.exec(attrs)?.[1]??'';
        let value=/<v[^>]*>([\s\S]*?)<\/v>/iu.exec(body)?.[1]??'';
        if(type==='s') value=shared[Number(value)]??value;
        if(type==='inlineStr') value=[...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/giu)].map(x=>decodeXmlEntities(x[1]??'')).join('');
        cells[excelColumn(ref)]=normalizeText(decodeXmlEntities(value));
      }
      rows.push(cells);
    }
    const width=Math.max(...rows.map(row=>row.length),0);
    const columns=Array.from({length:width},(_,i)=>rows[0]?.[i]?.trim()||`column_${i+1}`);
    const tableRows=rows.slice(1).map(row=>Object.fromEntries(columns.map((column,i)=>[column,row[i]??''])));
    tables.push({id:nextId('xlsx_table'),order:tables.length+1,sheet,name:sheet,columns,rows:tableRows});
    tableRows.forEach((row,i)=>blocks.push({id:nextId('xlsx_row'),type:'METADATA',text:JSON.stringify(row),order:blocks.length+1,sheet,source:{type:'XLSX',raw:{sheet,row:i+2}}}));
  }

  return {
    ...base(file,detection,'XLSX_TABLE'),
    metadata:{sheets:[...new Set(tables.map(x=>x.sheet).filter((x):x is string=>Boolean(x)))]},
    blocks,
    tables,
    warnings:[],
  };
}
