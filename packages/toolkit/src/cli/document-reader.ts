#!/usr/bin/env node
import {readDocumentFile} from '../document-reader/index.js';

export async function main(argv=process.argv.slice(2)){
  if(argv.includes('--help')||argv.includes('-h')||!argv[0]){
    process.stdout.write(
      'Usage: p2lrn-document-reader <file>\n' +
      'Reads DOCX, PPTX, text/markup formats and optional native-text PDF.\n' +
      'PDF requires optional peer dependency pdfjs-dist. OCR and Docling are intentionally not used.\n'
    );
    return;
  }
  try{
    const document=await readDocumentFile(argv[0]);
    const printable={
      ...document,
      assets:document.assets.map(asset=>({
        id:asset.id,
        path:asset.path,
        name:asset.name,
        mediaType:asset.mediaType,
        bytes:asset.bytes.byteLength,
        page:asset.page,
        slide:asset.slide,
        position:asset.position,
        canvas:asset.canvas,
      })),
    };
    process.stdout.write(JSON.stringify(printable,null,2)+'\n');
  }catch(error){
    process.stderr.write('P2LRN Document Reader error: '+(error instanceof Error?error.message:String(error))+'\n');
    process.exitCode=1;
  }
}

void main();
