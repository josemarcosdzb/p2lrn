import type {CanonicalDocument, DocumentBlock, DocumentInput, FileDetection} from './types.js';
import {DocumentReaderError} from './types.js';
import {nextId, normalizeText} from './utils.js';

type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

export async function readPdf(file:DocumentInput,detection:FileDetection):Promise<CanonicalDocument>{
  const moduleName='pdfjs-dist/legacy/build/pdf.mjs';
  let pdfjs:any;
  try{
    pdfjs=await import(moduleName);
  }catch{
    throw new DocumentReaderError(
      'PDF support is optional. Install pdfjs-dist@5.4.296 to read PDF text.',
      'P2LRN_READER_PDF_OPTIONAL_DEPENDENCY',
    );
  }

  const bytes=new Uint8Array(file.buffer.buffer,file.buffer.byteOffset,file.buffer.byteLength);
  let document:any;
  try{
    document=await pdfjs.getDocument({
      data:bytes,
      useWorkerFetch:false,
      isEvalSupported:false,
      disableFontFace:true,
      verbosity:0,
    }).promise;
  }catch(error){
    throw new DocumentReaderError(
      `PDF cannot be opened: ${error instanceof Error?error.message:'unknown PDF error'}`,
      'P2LRN_READER_PDF',
    );
  }

  const blocks:DocumentBlock[]=[];
  for(let pageNumber=1;pageNumber<=document.numPages;pageNumber+=1){
    const page=await document.getPage(pageNumber);
    const content=await page.getTextContent();
    const items=(content.items as PdfTextItem[])
      .filter(item=>typeof item.str==='string'&&item.str.trim())
      .map(item=>({
        text:normalizeText(item.str??''),
        x:Number(item.transform?.[4]??0),
        y:Number(item.transform?.[5]??0),
        fontSize:Math.abs(Number(item.transform?.[3]??item.height??0)),
      }))
      .filter(item=>item.text);

    items.sort((a,b)=>{
      const dy=Math.abs(a.y-b.y);
      if(dy>2)return b.y-a.y;
      return a.x-b.x;
    });

    const lines:Array<{y:number;items:typeof items}>=[];
    for(const item of items){
      let line=lines.find(candidate=>Math.abs(candidate.y-item.y)<=Math.max(2,item.fontSize*.25));
      if(!line){line={y:item.y,items:[]};lines.push(line);}
      line.items.push(item);
    }
    lines.sort((a,b)=>b.y-a.y);
    for(const line of lines){
      line.items.sort((a,b)=>a.x-b.x);
      const text=normalizeText(line.items.map(item=>item.text).join(' '));
      if(!text)continue;
      const maxFont=Math.max(...line.items.map(item=>item.fontSize),0);
      blocks.push({
        id:nextId('pdf'),
        type:maxFont>=18?'TITLE':maxFont>=14?'SUBTITLE':'PARAGRAPH',
        text,
        order:blocks.length+1,
        page:pageNumber,
        style:maxFont?{fontSize:maxFont}:undefined,
        source:{type:'PDF',raw:{page:pageNumber,y:line.y}},
      });
    }
  }

  if(!blocks.length){
    throw new DocumentReaderError(
      'PDF contains no extractable text. OCR is intentionally not included in the lightweight Reader.',
      'P2LRN_READER_PDF_NO_TEXT',
    );
  }

  return {
    version:'p2lrn.document-reader.v1',
    origin:{
      fileName:detection.fileName,
      originalExtension:detection.extension,
      originalMime:detection.mimeType,
      detectedType:'PDF',
      extractionStrategy:'PDF_TEXT',
    },
    metadata:{
      detectedTitle:blocks.find(block=>block.type==='TITLE')?.text??blocks[0]?.text,
      pages:document.numPages,
    },
    blocks,
    tables:[],
    warnings:[],
  };
}
