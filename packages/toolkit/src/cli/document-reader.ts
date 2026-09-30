#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {basename} from 'node:path';
import {readDocument} from '../document-reader/index.js';

const args=process.argv.slice(2);
if(args.includes('--help')||args.length===0){
  process.stdout.write(
    'Usage: p2lrn-document-reader <file> [--pretty]\n'+
    'Lightweight standalone reader for DOCX, PPTX, ODT, EPUB and structured text.\n'+
    'PDF text extraction is available only when optional pdfjs-dist is installed. OCR and Docling are not used.\n',
  );
  process.exit(0);
}
const path=args.find(arg=>!arg.startsWith('--'));
if(!path) throw new Error('Document path is required.');
const data=new Uint8Array(await readFile(path));
const result=await readDocument({name:basename(path),data});
process.stdout.write(JSON.stringify(result,null,args.includes('--pretty')?2:0)+'\n');
