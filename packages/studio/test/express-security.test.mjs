import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

test('Express Studio routes fail closed and gate authorization before reading upload bodies',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-express-guards-'));
  try{
    const original=await readFile(new URL('../templates/express-route.mjs',import.meta.url),'utf8');
    let code=original.replaceAll("'express'","'./express-stub.mjs'")
      .replaceAll("'@p2lrn/studio/server'","'./studio-stub.mjs'");
    await writeFile(join(root,'express-stub.mjs'),
      "export default {raw:()=>((req,res,next)=>next())};\n");
    await writeFile(join(root,'studio-stub.mjs'),
      "export async function handleP2LRNStudioSave(){return new Response('SAVE');}\n"+
      "export async function handleP2LRNStudioReader(){return new Response('READ');}\n"+
      "export async function handleP2LRNStudioExternalImport(){return new Response('IMPORT');}\n");
    await writeFile(join(root,'routes.mjs'),code);
    const {installP2LRNStudio}=await import(pathToFileURL(join(root,'routes.mjs')).href);
    const paths=new Map(),app={post(path,...handlers){paths.set(path,handlers);}};
    assert.throws(()=>installP2LRNStudio(app),/requires authenticate/);
    assert.equal(paths.size,0);
    let calls=0,authorized=false,csrf=false,identified=false;
    installP2LRNStudio(app,{
      authenticate:async()=>{calls++;return identified?{id:'learner'}:null;},
      authorize:async({operation,coursePath})=>{
        assert(['save','read','import'].includes(operation));
        assert.equal(coursePath,'__COURSE_PATH__');
        calls++;return authorized;
      },
      verifyCsrf:async()=>{calls++;return csrf;},
    });
    assert.equal(paths.size,3);
    async function exercise(action){
      const handlers=paths.get(action);
      const response={
        statusCode:200,body:null,status(code){this.statusCode=code;return this;},
        json(value){this.body=value;return this;},
      };
      const request={headers:{},get:()=>undefined};
      let nextCalls=0,lastError=null;
      await handlers[0](request,response,error=>{nextCalls++;lastError=error;});
      if(lastError)throw lastError;
      return {response,nextCalls};
    }
    let result=await exercise('__ENDPOINT__');
    assert.equal(result.response.statusCode,401);
    assert.equal(result.nextCalls,0);
    identified=true;
    result=await exercise('__ENDPOINT__');
    assert.equal(result.response.statusCode,403);
    assert.equal(result.nextCalls,0);
    authorized=true;
    result=await exercise('__READER_ENDPOINT__');
    assert.equal(result.response.statusCode,403);
    assert.equal(result.nextCalls,0);
    csrf=true;
    for(const endpoint of ['__ENDPOINT__','__READER_ENDPOINT__','__IMPORT_ENDPOINT__']){
      result=await exercise(endpoint);
      assert.equal(result.nextCalls,1,'Authorized operation may reach body parser: '+endpoint);
      assert.equal(result.response.statusCode,200);
    }
    assert(calls>=5);
  }finally{await rm(root,{recursive:true,force:true});}
});
