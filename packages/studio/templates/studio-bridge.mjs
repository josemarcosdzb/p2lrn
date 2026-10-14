#!/usr/bin/env node
import process from 'node:process';
import {readP2LRNStudioDocument,convertP2LRNStudioExternalPackage} from '@p2lrn/studio/server';

const action=process.argv[2];
const rawName=process.argv[3]||'file.bin';
const mediaType=process.argv[4]||undefined;
let filename=rawName;
try{filename=decodeURIComponent(rawName)}catch{}
const maxBytes=action==='read'?128*1024*1024:512*1024*1024;
const chunks=[];
let total=0;
for await(const chunk of process.stdin){
  const part=Buffer.from(chunk);
  total+=part.length;
  if(total>maxBytes)throw new Error(action==='read'?'Document too large':'Package too large');
  chunks.push(part);
}
const bytes=new Uint8Array(Buffer.concat(chunks));
if(action==='read'){
  const result=await readP2LRNStudioDocument(bytes,{filename,mediaType});
  process.stdout.write(JSON.stringify(result));
}else if(action==='import'){
  const result=await convertP2LRNStudioExternalPackage(bytes,{filename});
  process.stdout.write(Buffer.from(result.bytes));
}else{
  throw new Error('Unknown bridge action: '+String(action));
}
