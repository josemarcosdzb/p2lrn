import express from 'express';
import {saveP2LRNStudioPackage,readP2LRNStudioDocument,convertP2LRNStudioExternalPackage} from '@p2lrn/studio/server';

const raw=(limit)=>express.raw({type:'*/*',limit});
const filename=(req,fallback)=>{const value=req.get('x-p2lrn-filename')||fallback;try{return decodeURIComponent(value)}catch{return value}};

export function installP2LRNStudio(app){
  app.post('__ENDPOINT__',raw('512mb'),async(req,res,next)=>{
    try{res.json(await saveP2LRNStudioPackage(req.body,{coursePath:'__COURSE_PATH__',filename:filename(req,'course.p2lrn')}))}catch(error){next(error)}
  });
  app.post('__READER_ENDPOINT__',raw('128mb'),async(req,res,next)=>{
    try{res.json(await readP2LRNStudioDocument(req.body,{filename:filename(req,'document.bin'),mediaType:req.get('content-type')||undefined}))}catch(error){next(error)}
  });
  app.post('__IMPORT_ENDPOINT__',raw('512mb'),async(req,res,next)=>{
    try{const result=await convertP2LRNStudioExternalPackage(req.body,{filename:filename(req,'package.zip')});res.type('application/vnd.p2lrn+zip').send(Buffer.from(result.bytes))}catch(error){next(error)}
  });
}
