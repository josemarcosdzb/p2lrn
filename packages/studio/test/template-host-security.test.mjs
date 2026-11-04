import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const templates=new URL('../templates/',import.meta.url);
const hostUrl=new URL('../server/index.mjs',import.meta.url).href;
async function loadTemplate(name,dir){
  const original=await readFile(new URL(name,templates),'utf8');
  const replacements={
    '__ENDPOINT__':'/api/p2lrn/studio/save',
    '__READER_ENDPOINT__':'/api/p2lrn/studio/read',
    '__IMPORT_ENDPOINT__':'/api/p2lrn/studio/import',
    '__COURSE_PATH__':'academy/course',
  };
  let source=original.replaceAll("from '@p2lrn/studio/server'","from './stub.mjs'");
  for(const [from,to] of Object.entries(replacements))source=source.replaceAll(from,to);
  const target=join(dir,name);
  await writeFile(target,source);
  return import(pathToFileURL(target).href);
}
async function withStub(callback){
  const dir=await mkdtemp(join(tmpdir(),'p2lrn-studio-secure-templates-'));
  try{
    const stub=`export {authorizeP2LRNStudioRequest} from '__HOST_URL__';
export async function handleP2LRNStudioSave(){return new Response('SAVED');}
export async function handleP2LRNStudioReader(){return new Response('READ');}
export async function handleP2LRNStudioExternalImport(){return new Response('IMPORT');}
export async function saveP2LRNStudioPackage(){return {ok:true};}
export async function readP2LRNStudioDocument(){return {ok:true};}
export async function convertP2LRNStudioExternalPackage(){return {bytes:new Uint8Array([1]),report:{}};}
`.replace('__HOST_URL__',hostUrl);
    await writeFile(join(dir,'stub.mjs'),stub);
    return await callback(dir);
  }finally{await rm(dir,{force:true,recursive:true});}
}

const auth={
  authenticate:async()=>({id:'teacher'}),
  authorize:async({principal,operation,coursePath})=>
    principal.id==='teacher'&&['save','read','import'].includes(operation)&&coursePath==='academy/course',
  checkCsrf:async()=>true,
};
const request=(path='save',method='POST')=>new Request(
  'https://example.invalid/api/p2lrn/studio/'+path,{method});

test('Node Studio generated handler rejects unauthenticated uploads and authorizes per operation',async()=>{
  await withStub(async dir=>{
    const {handleP2LRNStudioRequest}=await loadTemplate('node-handler.mjs',dir);
    let reply=await handleP2LRNStudioRequest(request());
    assert.equal(reply.status,503);
    assert.equal((await reply.json()).error,'HOST_AUTHORIZATION_NOT_CONFIGURED');
    reply=await handleP2LRNStudioRequest(request(),{...auth,authenticate:async()=>null});
    assert.equal(reply.status,401);
    reply=await handleP2LRNStudioRequest(request(),{...auth,authorize:async()=>false});
    assert.equal(reply.status,403);
    reply=await handleP2LRNStudioRequest(request(),{...auth,checkCsrf:async()=>false});
    assert.equal(reply.status,403);
    for(const path of ['save','read','import']){
      reply=await handleP2LRNStudioRequest(request(path),auth);
      assert.equal(reply.status,200);
      assert.equal(await reply.text(),path==='save'?'SAVED':path==='read'?'READ':'IMPORT');
    }
    assert.equal((await handleP2LRNStudioRequest(request('save','GET'),auth)).status,405);
    assert.equal((await handleP2LRNStudioRequest(request('missing'),auth)).status,404);
  });
});

test('Hono Studio templates reject by default and pass verified Fetch Requests to shared bounded handlers',async()=>{
  await withStub(async dir=>{
    const {installP2LRNStudio}=await loadTemplate('hono-route.mjs',dir);
    const routes=new Map(),app={post(path,handler){routes.set(path,handler);}};
    assert.throws(()=>installP2LRNStudio(app),/Host must configure/);
    assert.equal(routes.size,0);
    installP2LRNStudio(app,auth);
    assert.equal(routes.size,3);
    const c={req:{raw:request()}};
    assert.equal((await routes.get('/api/p2lrn/studio/save')(c)).status,200);
    const untrustedRoutes=new Map();
    installP2LRNStudio({post(path,handler){untrustedRoutes.set(path,handler);}},{...auth,authenticate:async()=>null});
    assert.equal((await untrustedRoutes.get('/api/p2lrn/studio/save')(c)).status,401);
  });
});

test('Fastify guards run in onRequest, before allocating file upload buffers',async()=>{
  await withStub(async dir=>{
    const {installP2LRNStudio}=await loadTemplate('fastify-route.mjs',dir);
    const routes=new Map();
    const app={
      register:async callback=>callback(app),
      removeContentTypeParser(){},
      addContentTypeParser(){},
      post(path,options,handler){routes.set(path,{options,handler});},
    };
    await assert.rejects(installP2LRNStudio(app),/Host must configure/);
    assert.equal(routes.size,0);
    await installP2LRNStudio(app,auth);
    assert.equal(routes.size,3);
    for(const path of ['save','read','import']){
      const record=routes.get('/api/p2lrn/studio/'+path);
      assert.equal(typeof record.options.onRequest,'function');
      const req={headers:{}};
      const reply={statusCode:200,body:null,code(status){this.statusCode=status;return this;},
        send(body){this.body=body;return this;}};
      await record.options.onRequest(req,reply);
      assert.equal(reply.statusCode,200);
      assert.equal(reply.body,null);
    }
    const unauthorized=new Map();
    const otherApp={...app,post(path,options,handler){unauthorized.set(path,{options,handler});}};
    otherApp.register=async callback=>callback(otherApp);
    await installP2LRNStudio(otherApp,{...auth,authenticate:async()=>null});
    const hook=unauthorized.get('/api/p2lrn/studio/save').options.onRequest;
    const reply={statusCode:200,code(s){this.statusCode=s;return this;},send(v){this.body=v;}};
    await hook({headers:{}},reply);
    assert.equal(reply.statusCode,401);
    assert.equal(reply.body.error,'AUTHENTICATION_REQUIRED');
  });
});

test('Generated Fetch route templates check Host permissions before every document and course operation',async()=>{
  for(const framework of ['next','sveltekit','astro','remix','react-router']){
    for(const file of ['route','reader-route','import-route']){
      const code=await readFile(new URL(framework+'-'+file+'.ts',templates),'utf8');
      assert.match(code,/authorizeP2LRNStudioRequest\(request/);
      assert.match(code,/if\(denied\)return denied;/);
      assert.ok(code.indexOf('authorizeP2LRNStudioRequest(request')<
        code.lastIndexOf('return handleP2LRNStudio'),'Authorization must run before handler in '+framework+'-'+file);
    }
  }
});
