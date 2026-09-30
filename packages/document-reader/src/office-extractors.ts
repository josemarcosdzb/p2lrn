import type {CanonicalDocument, DocumentBlock, DocumentInput, ExtractedTable, FileDetection, ReaderOptions} from './types.js';
import {DocumentReaderError} from './types.js';
import {decodeXmlEntities, nextId, normalizeText} from './utils.js';
import {readZip} from './zip.js';
import {docxAssets, pptxAssets, xlsxAssets} from './office-assets.js';

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

function tableFromDocxXml(xml:string,index:number):ExtractedTable|null{
  const rows=[...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/giu)].map(rowMatch=>
    [...rowMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/giu)].map(cell=>normalizeText(extractWordRuns(cell[0])))
  ).filter(row=>row.some(Boolean));
  if(!rows.length)return null;
  const width=Math.max(...rows.map(row=>row.length),0);
  const columns=Array.from({length:width},(_,i)=>rows[0]?.[i]?.trim()||'column_'+(i+1));
  const dataRows=rows.slice(1).map(row=>Object.fromEntries(columns.map((column,i)=>[column,row[i]??''])));
  return {id:nextId('docx_table'),order:index+1,name:'Table '+(index+1),columns,rows:dataRows};
}

export async function readDocx(file:DocumentInput,detection:FileDetection,options:ReaderOptions={}):Promise<CanonicalDocument>{
  const entries=await readZip(file.buffer,options);
  const documentXml=entries.get('word/document.xml')?.toString('utf8');
  if(!documentXml) throw new DocumentReaderError('DOCX has no word/document.xml.','P2LRN_READER_DOCX');

  const assets=docxAssets(entries,options);
  const assetsByRun=new Map<string,typeof assets>();
  for(const asset of assets){
    const key=String(asset.paragraphIndex??-1)+':'+String(asset.runIndex??-1);
    assetsByRun.set(key,[...(assetsByRun.get(key)??[]),asset]);
  }

  const blocks:DocumentBlock[]=[];
  const tables:ExtractedTable[]=[];
  const body=/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/iu.exec(documentXml)?.[1]??documentXml;
  const nodes=[...body.matchAll(/<w:(p|tbl)\b[\s\S]*?<\/w:\1>/giu)];
  let paragraphIndex=0;

  const pushText=(text:string,paragraph:string,segment:number)=>{
    const normalized=normalizeText(text);
    if(!normalized)return;
    const kind=docxParagraphType(paragraph);
    blocks.push({
      id:nextId('docx'),
      type:kind.type,
      text:normalized,
      order:blocks.length+1,
      level:kind.level,
      source:{type:'DOCX',raw:{
        style:/<w:pStyle[^>]*w:val=["']([^"']+)["']/iu.exec(paragraph)?.[1]??null,
        paragraphIndex,
        segment,
      }},
    });
  };

  for(const node of nodes){
    const kind=(node[1]??'').toLowerCase();
    const xml=node[0];
    if(kind==='tbl'){
      const table=tableFromDocxXml(xml,tables.length);
      if(table){
        tables.push(table);
        blocks.push({
          id:nextId('docx_table_block'),
          type:'TABLE',
          text:table.name??table.columns.join(' | '),
          order:blocks.length+1,
          source:{type:'DOCX',raw:{tableId:table.id,tableIndex:tables.length-1}},
        });
      }
      continue;
    }

    const runs=xml.match(/<w:r\b[\s\S]*?<\/w:r>/giu)??[xml];
    let pending='';
    let segment=0;
    runs.forEach((run,runIndex)=>{
      pending+=extractWordRuns(run);
      const runAssets=assetsByRun.get(String(paragraphIndex)+':'+String(runIndex))??[];
      if(runAssets.length){
        pushText(pending,xml,segment++);
        pending='';
        for(const asset of runAssets){
          blocks.push({
            id:nextId('docx_image'),
            type:'IMAGE_REFERENCE',
            text:asset.path.split('/').at(-1)??asset.path,
            order:blocks.length+1,
            position:asset.position,
            source:{type:'DOCX',raw:{
              assetId:asset.id,path:asset.path,sha256:asset.sha256,
              paragraphIndex,runIndex,
            }},
          });
        }
      }
    });
    pushText(pending,xml,segment);
    paragraphIndex+=1;
  }

  const core=entries.get('docProps/core.xml')?.toString('utf8')??'';
  const title=/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/iu.exec(core)?.[1];
  const creator=/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/iu.exec(core)?.[1];

  return {
    ...base(file,detection,'DOCX_XML'),
    metadata:{
      detectedTitle:normalizeText(title??'')||blocks.find(x=>x.type==='TITLE')?.text||blocks.find(x=>x.type==='PARAGRAPH')?.text,
      author:normalizeText(creator??'')||undefined,
    },
    blocks,
    tables,
    assets,
    warnings:[],
  };
}

function slideNumber(name:string){
  return Number(/slide(\d+)\.xml$/iu.exec(name)?.[1]??Number.MAX_SAFE_INTEGER);
}

function emuPx(value:number|undefined){
  return Number.isFinite(value)?Math.round((Number(value)/9525)*100)/100:undefined;
}
function pptxElementPosition(fragment:string){
  const xfrm=/<a:xfrm\b[\s\S]*?<\/a:xfrm>/iu.exec(fragment)?.[0]??fragment;
  const off=/<a:off\b([^>]*)\/>/iu.exec(xfrm)?.[1]??'';
  const ext=/<a:ext\b([^>]*)\/>/iu.exec(xfrm)?.[1]??'';
  const num=(attrs:string,name:string)=>{
    const raw=new RegExp("(?:^|\\\\s)"+name+"=[\\\"'](-?\\\\d+(?:\\\\.\\\\d+)?)[\\\"']","iu").exec(attrs)?.[1];
    const n=raw===undefined?NaN:Number(raw);return Number.isFinite(n)?n:undefined;
  };
  return {x:emuPx(num(off,'x')),y:emuPx(num(off,'y')),width:emuPx(num(ext,'cx')),height:emuPx(num(ext,'cy'))};
}
function pptxTable(fragment:string,slide:number,index:number):ExtractedTable|null{
  const tableXml=/<a:tbl\b[\s\S]*?<\/a:tbl>/iu.exec(fragment)?.[0];
  if(!tableXml)return null;
  const rows=[...tableXml.matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/giu)].map(row=>
    [...row[0].matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/giu)].map(cell=>
      normalizeText([...cell[0].matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/giu)].map(x=>decodeXmlEntities(x[1]??'')).join(' '))
    )
  ).filter(row=>row.some(Boolean));
  if(!rows.length)return null;
  const width=Math.max(...rows.map(row=>row.length),0);
  const columns=Array.from({length:width},(_,i)=>rows[0]?.[i]?.trim()||'column_'+(i+1));
  const dataRows=rows.slice(1).map(row=>Object.fromEntries(columns.map((column,i)=>[column,row[i]??''])));
  return {id:nextId('pptx_table'),order:index+1,sheet:'Slide '+slide,name:'Table '+(index+1)+' - slide '+slide,columns,rows:dataRows};
}

export async function readPptx(file:DocumentInput,detection:FileDetection,options:ReaderOptions={}):Promise<CanonicalDocument>{
  const entries=await readZip(file.buffer,options);
  const slides=[...entries.entries()]
    .filter(([name])=>/^ppt\/slides\/slide\d+\.xml$/iu.test(name))
    .sort(([a],[b])=>slideNumber(a)-slideNumber(b));
  if(!slides.length) throw new DocumentReaderError('PPTX contains no readable slides.','P2LRN_READER_PPTX');

  const assets=pptxAssets(entries,options);
  const blocks:DocumentBlock[]=[];
  const tables:ExtractedTable[]=[];

  for(const [name,data] of slides){
    const slide=slideNumber(name);
    const sheet='Slide '+slide;
    const xml=data.toString('utf8');
    const slideAssets=(assets.filter(asset=>asset.page===slide));
    const assetsByRelationship=new Map(slideAssets.map(asset=>[String(asset.source?.relationshipId??''),asset]));
    const elements=[...xml.matchAll(/<p:(sp|pic|graphicFrame)\b[\s\S]*?<\/p:\1>/giu)].map((match,index)=>{
      const fragment=match[0];
      const tag=(match[1]??'').toLowerCase();
      const position=pptxElementPosition(fragment);
      return {fragment,tag,index,position};
    }).sort((a,b)=>{
      const ay=a.position.y??Number.MAX_SAFE_INTEGER;
      const by=b.position.y??Number.MAX_SAFE_INTEGER;
      if(Math.abs(ay-by)>2)return ay-by;
      const ax=a.position.x??Number.MAX_SAFE_INTEGER;
      const bx=b.position.x??Number.MAX_SAFE_INTEGER;
      if(Math.abs(ax-bx)>2)return ax-bx;
      return a.index-b.index;
    });

    let titleWritten=false;
    for(const element of elements){
      if(element.tag==='pic'){
        const relationshipId=/<a:blip\b[^>]*(?:r:embed|r:link)=["']([^"']+)["']/iu.exec(element.fragment)?.[1];
        const asset=relationshipId?assetsByRelationship.get(relationshipId):undefined;
        if(!asset)continue;
        blocks.push({
          id:nextId('pptx_image'),
          type:'IMAGE_REFERENCE',
          text:asset.path.split('/').at(-1)??asset.path,
          order:blocks.length+1,
          page:slide,
          sheet,
          position:asset.position??element.position,
          source:{type:'PPTX',raw:{assetId:asset.id,path:asset.path,sha256:asset.sha256,relationshipId}},
        });
        continue;
      }

      if(element.tag==='graphicframe'&&/<a:tbl\b/iu.test(element.fragment)){
        const table=pptxTable(element.fragment,slide,tables.length);
        if(table){
          tables.push(table);
          blocks.push({
            id:nextId('pptx_table_block'),
            type:'TABLE',
            text:table.name??table.columns.join(' | '),
            order:blocks.length+1,
            page:slide,
            sheet,
            position:element.position,
            source:{type:'PPTX',raw:{tableId:table.id,slide}},
          });
        }
        continue;
      }

      const titlePlaceholder=/<p:ph\b[^>]*type=["'](?:title|ctrTitle)["']/iu.test(element.fragment);
      const paragraphs=[...element.fragment.matchAll(/<a:p\b[\s\S]*?<\/a:p>/giu)];
      const sourceParagraphs=paragraphs.length?paragraphs.map(x=>x[0]):[element.fragment];
      sourceParagraphs.forEach((paragraph,paragraphIndex)=>{
        const text=normalizeText([...paragraph.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/giu)].map(x=>decodeXmlEntities(x[1]??'')).join(' '));
        if(!text)return;
        const bullet=/<a:bu(?:Char|AutoNum|Blip)\b/iu.test(paragraph);
        const isTitle=(titlePlaceholder&&paragraphIndex===0)||(!titleWritten&&blocks.filter(x=>x.page===slide&&x.type!=='IMAGE_REFERENCE').length===0);
        const type=isTitle?'TITLE':bullet?'LIST':'PARAGRAPH';
        if(isTitle)titleWritten=true;
        blocks.push({
          id:nextId('pptx'),
          type,
          text,
          order:blocks.length+1,
          page:slide,
          sheet,
          position:element.position,
          source:{type:'PPTX',raw:{slide,shapeIndex:element.index,paragraphIndex}},
        });
      });
    }

    if(!elements.length){
      const lines=[...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/giu)]
        .map(x=>normalizeText(decodeXmlEntities(x[1]??''))).filter(Boolean);
      lines.forEach((text,index)=>blocks.push({
        id:nextId('pptx'),type:index===0?'TITLE':'PARAGRAPH',text,
        order:blocks.length+1,page:slide,sheet,source:{type:'PPTX',raw:{slide,index,fallback:true}},
      }));
      for(const asset of slideAssets){
        blocks.push({
          id:nextId('pptx_image'),type:'IMAGE_REFERENCE',
          text:asset.path.split('/').at(-1)??asset.path,order:blocks.length+1,
          page:slide,sheet,position:asset.position,
          source:{type:'PPTX',raw:{assetId:asset.id,path:asset.path,sha256:asset.sha256,fallback:true}},
        });
      }
    }
  }

  return {
    ...base(file,detection,'PPTX_SLIDES_XML'),
    metadata:{
      detectedTitle:blocks.find(x=>x.type==='TITLE')?.text,
      pages:slides.length,
      sheets:slides.map(([name])=>'Slide '+slideNumber(name)),
    },
    blocks,
    tables,
    assets,
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

  const assets=xlsxAssets(entries,options);
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

  for(const asset of assets){
    blocks.push({
      id:nextId('xlsx_image'),
      type:'IMAGE_REFERENCE',
      text:asset.path.split('/').at(-1)??asset.path,
      order:blocks.length+1,
      sheet:asset.sheet,
      position:asset.position,
      source:{type:'XLSX',raw:{assetId:asset.id,path:asset.path,sha256:asset.sha256,cell:asset.cell}},
    });
  }

  return {
    ...base(file,detection,'XLSX_TABLE'),
    metadata:{sheets:[...new Set(tables.map(x=>x.sheet).filter((x):x is string=>Boolean(x)))]},
    blocks,
    tables,
    assets,
    warnings:[],
  };
}
