import express from 'express';
import {saveP2LRNStudioPackage} from '@p2lrn/studio/server';

export function installP2LRNStudio(app){
  app.post('__ENDPOINT__',express.raw({type:'application/vnd.p2lrn+zip',limit:'512mb'}),async(req,res,next)=>{
    try{
      const result=await saveP2LRNStudioPackage(req.body,{coursePath:'__COURSE_PATH__',filename:req.get('x-p2lrn-filename')||'course.p2lrn'});
      res.json(result);
    }catch(error){next(error)}
  });
}
