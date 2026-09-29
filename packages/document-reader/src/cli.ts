#!/usr/bin/env node
import {stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {P2LRNDocumentReader} from './reader.js';

const args=process.argv.slice(2);
const input=args.find(arg=>!arg.startsWith('--'));
if(!input){
  console.error('Usage: p2lrn-document-reader <file> [--json] [--no-pdf]');
  process.exit(2);
}
const path=resolve(input);
const info=await stat(path).catch(()=>null);
if(!info?.isFile()){
  console.error(`File not found: ${path}`);
  process.exit(2);
}
const reader=new P2LRNDocumentReader({pdf:!args.includes('--no-pdf')});
try{
  const result=await reader.readPath(path);
  if(args.includes('--json')){
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }else{
    console.log(JSON.stringify({
      version:result.version,
      file:result.origin.fileName,
      type:result.origin.detectedType,
      strategy:result.origin.extractionStrategy,
      title:result.metadata.detectedTitle??null,
      blocks:result.blocks.length,
      tables:result.tables.length,
      warnings:result.warnings,
    },null,2));
  }
}catch(error){
  console.error(error instanceof Error?error.message:String(error));
  process.exit(1);
}
