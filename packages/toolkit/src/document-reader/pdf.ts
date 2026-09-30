import type {DocumentBlock,DocumentReaderInput,ExtractedDocument} from './types.js';
import {readerId} from './utils.js';

type PdfTextItem={str?:string;transform?:number[];width?:number;height?:number;fontName?:string};

const dynamicImport = new Function('specifier','return import(specifier)') as (specifier:string)=>Promise<any>;

async function loadPdfJs():Promise<any>{
  for(const specifier of ['pdfjs-dist/legacy/build/pdf.mjs','pdfjs-dist/build/pdf.mjs']){
    try{return await dynamicImport(specifier);}catch{}
  }
  throw new Error(
    'PDF text extraction requires the optional "pdfjs-dist" package. Install it explicitly; OCR and Docling are intentionally not part of @p2lrn/toolkit.',
  );
}

function groupLines(items:PdfTextItem[]):Array<{text:string;y:number;fontSize:number;bold:boolean}>{
  const normalized=items.map(item=>({
    text:String(item.str??'').trim(),
    x:Number(item.transform?.[4]??0),
    y:Number(item.transform?.[5]??0),
    fontSize:Math.abs(Number(item.transform?.[3]??item.height??0)),
    bold:/bold|black|semibold/i.test(String(item.fontName??'')),
  })).filter(item=>item.text);
  normalized.sort((a,b)=>Math.abs(b.y-a.y)>2?b.y-a.y:a.x-b.x);
  const rows:Array<{y:number;parts:typeof normalized}>=[];
  for(const item of normalized){
    let row=rows.find(candidate=>Math.abs(candidate.y-item.y)<=2);
    if(!row){row={y:item.y,parts:[]};rows.push(row);}
    row.parts.push(item);
  }
  return rows.map(row=>{
    row.parts.sort((a,b)=>a.x-b.x);
    return {
      text:row.parts.map(part=>part.text).join(' ').replace(/\s+/g,' ').trim(),
      y:row.y,
      fontSize:Math.max(...row.parts.map(part=>part.fontSize||0)),
      bold:row.parts.some(part=>part.bold),
    };
  }).filter(row=>row.text);
}

export async function extractPdfText(input:DocumentReaderInput):Promise<ExtractedDocument>{
  const pdfjs=await loadPdfJs();
  const document=await pdfjs.getDocument({data:new Uint8Array(input.data),disableWorker:true}).promise;
  const blocks:DocumentBlock[]=[];
  let detectedTitle:string|undefined;
  let author:string|undefined;
  try{
    const metadata=await document.getMetadata?.();
    const info=metadata?.info??{};
    detectedTitle=typeof info.Title==='string'?info.Title.trim()||undefined:undefined;
    author=typeof info.Author==='string'?info.Author.trim()||undefined:undefined;
  }catch{}

  for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){
    const page=await document.getPage(pageNumber);
    const content=await page.getTextContent();
    const rows=groupLines(content.items as PdfTextItem[]);
    const maxFont=Math.max(0,...rows.map(row=>row.fontSize));
    for(const row of rows){
      const title=(row.bold&&row.fontSize>=Math.max(12,maxFont*0.85))||row.fontSize>=15;
      blocks.push({
        id:readerId(title?'pdf_title':'pdf_paragraph'),
        type:title?'TITLE':'PARAGRAPH',
        text:row.text,order:blocks.length+1,page:pageNumber,
        style:{fontSize:row.fontSize,bold:row.bold},
        source:{type:'PDF',raw:{y:row.y}},
      });
    }
  }
  await document.destroy?.();
  if(!blocks.length) throw new Error('PDF contains no embedded readable text. OCR is intentionally disabled in the lightweight P2LRN document reader.');
  return {
    version:'p2lrn.document-reader.v1',
    source:{name:input.name,extension:'pdf',mediaType:input.mediaType,detectedType:'PDF',strategy:'PDF_TEXT'},
    metadata:{detectedTitle:detectedTitle??blocks.find(block=>block.type==='TITLE')?.text,author,pages:document.numPages},
    blocks,tables:[],warnings:[],
  };
}
