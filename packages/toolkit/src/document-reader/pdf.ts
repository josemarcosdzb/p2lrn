import type {DocumentBlock, DocumentReaderDetection, DocumentReaderInput, LightweightExtractedDocument} from './types.js';
import {blockTypeForText, finalizeBlocks, stableId} from './utils.js';

interface PdfTextItem {
  str?:string;
  transform?:number[];
  width?:number;
  height?:number;
  fontName?:string;
}

async function loadPdfJs():Promise<any> {
  for(const moduleName of ['pdfjs-dist/legacy/build/pdf.mjs','pdfjs-dist/build/pdf.mjs']){
    try{return await import(moduleName);}
    catch{}
  }
  const error=new Error('PDF text extraction is optional in the lightweight P2LRN Reader. Install pdfjs-dist to enable it. OCR is intentionally not used.');
  (error as Error & {code?:string}).code='P2LRN_DOCUMENT_READER_PDFJS_MISSING';
  throw error;
}

function groupLines(items:PdfTextItem[]):Array<{text:string;x:number;y:number;fontSize:number;bold:boolean}> {
  const normalized=items.flatMap(item=>{
    const text=String(item.str??'').trim();
    const transform=item.transform??[];
    if(!text||transform.length<6)return [];
    const x=Number(transform[4]??0);
    const y=Number(transform[5]??0);
    const fontSize=Math.max(Math.abs(Number(transform[0]??0)),Math.abs(Number(transform[3]??0)),Number(item.height??0),1);
    return [{text,x,y,fontSize,bold:/bold|black|heavy|semibold/iu.test(String(item.fontName??''))}];
  }).sort((a,b)=>Math.abs(a.y-b.y)>2?b.y-a.y:a.x-b.x);

  const lines:Array<{y:number;items:typeof normalized}>= [];
  for(const item of normalized){
    let line=lines.find(candidate=>Math.abs(candidate.y-item.y)<=Math.max(2,item.fontSize*0.25));
    if(!line){
      line={y:item.y,items:[]};
      lines.push(line);
    }
    line.items.push(item);
  }

  return lines
    .sort((a,b)=>b.y-a.y)
    .map(line=>{
      const sorted=[...line.items].sort((a,b)=>a.x-b.x);
      return {
        text:sorted.map(item=>item.text).join(' ').replace(/\s+/gu,' ').trim(),
        x:sorted[0]?.x??0,
        y:line.y,
        fontSize:Math.max(...sorted.map(item=>item.fontSize)),
        bold:sorted.some(item=>item.bold),
      };
    })
    .filter(line=>line.text);
}

export async function readPdf(
  input:DocumentReaderInput,
  detection:DocumentReaderDetection,
):Promise<LightweightExtractedDocument> {
  const pdfjs=await loadPdfJs();
  const task=pdfjs.getDocument({data:new Uint8Array(input.bytes),disableWorker:true});
  const document=await task.promise;
  const blocks:DocumentBlock[]=[];
  let detectedTitle:string|undefined;
  let author:string|undefined;

  try{
    const metadata=await document.getMetadata?.();
    const info=metadata?.info??{};
    detectedTitle=typeof info.Title==='string'&&info.Title.trim()?info.Title.trim():undefined;
    author=typeof info.Author==='string'&&info.Author.trim()?info.Author.trim():undefined;
  }catch{}

  for(let pageNumber=1;pageNumber<=document.numPages;pageNumber+=1){
    const page=await document.getPage(pageNumber);
    const viewport=page.getViewport({scale:1});
    const content=await page.getTextContent();
    const lines=groupLines(content.items as PdfTextItem[]);
    const medianFont=[...lines].map(line=>line.fontSize).sort((a,b)=>a-b)[Math.floor(lines.length/2)]??10;

    for(const line of lines){
      const heading=line.bold&&line.fontSize>=medianFont*1.25;
      blocks.push({
        id:stableId(heading?'pdf_heading':'pdf_text',blocks.length+1),
        type:heading?'TITLE':blockTypeForText(line.text),
        text:line.text,
        order:blocks.length+1,
        page:pageNumber,
        position:{x:line.x,y:line.y},
        style:{fontSize:Math.round(line.fontSize*100)/100,bold:line.bold||undefined},
        source:{type:'PDF',raw:{page:pageNumber,canvas:{width:viewport.width,height:viewport.height}}},
      });
    }
  }

  await document.destroy?.();
  if(!blocks.length){
    throw new Error('PDF contains no extractable text. The lightweight P2LRN Reader does not run OCR; scanned PDFs must be handled externally.');
  }

  return {
    version:'p2lrn.document-reader.v1',
    source:{
      name:detection.name,
      extension:detection.extension,
      mediaType:detection.mediaType,
      detectedType:'PDF',
      extractionStrategy:'PDF_TEXT_PDFJS_OPTIONAL',
    },
    metadata:{
      detectedTitle:detectedTitle??blocks.find(block=>block.type==='TITLE')?.text,
      author,
      pages:document.numPages,
    },
    blocks:finalizeBlocks(blocks),
    tables:[],
    assets:[],
    warnings:[{
      path:'pdf',
      message:'Lightweight PDF mode extracts native text only. OCR and rendered-page image extraction are intentionally disabled.',
      level:'INFO',
    }],
  };
}
