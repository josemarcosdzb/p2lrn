import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';

async function freePort(){
  return await new Promise((resolvePort,reject)=>{
    const s=createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{
      const a=s.address();if(!a||typeof a==='string')return reject(new Error('No test port'));
      const port=a.port;s.close(e=>e?reject(e):resolvePort(port));
    });
  });
}
async function json(url,options={}){
  const r=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const data=await r.json();if(!r.ok)throw new Error(data.error||r.statusText);return data;
}
async function started(child){
  await new Promise((resolveStart,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Editor did not start')),10000);
    const onData=(chunk)=>{if(String(chunk).includes('P2LRN Editor listening')){clearTimeout(timer);child.stdout.off('data',onData);resolveStart();}};
    child.stdout.on('data',onData);child.once('exit',code=>{clearTimeout(timer);reject(new Error('Editor exited before start: '+code));});child.once('error',reject);
  });
}

test('Editor API creates a native quiz and builds a downloadable P2LRN package',async()=>{
  const dataDir=mkdtempSync(join(tmpdir(),'p2lrn-editor-e2e-')),port=await freePort();
  const app=resolve('apps/editor/server.mjs');
  const child=spawn(process.execPath,[app],{cwd:resolve('.'),env:{...process.env,P2LRN_EDITOR_PORT:String(port),P2LRN_EDITOR_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
  try{
    await started(child);
    const base=`http://127.0.0.1:${port}`;
    const health=await json(base+'/api/health');assert.equal(health.ok,true);
    const created=await json(base+'/api/projects',{method:'POST',body:JSON.stringify({title:'Curso E2E',language:'es'})});
    assert.ok(created.id);

    const markdown=new TextEncoder().encode('# 1 Fundamentos\n\n## 1.1 Introducción\n\nContenido importado.\n');
    const importedResponse=await fetch(base+`/api/projects/${created.id}/import-document?name=curso.md`,{method:'POST',headers:{'Content-Type':'text/markdown'},body:markdown});
    assert.equal(importedResponse.status,201);
    const imported=await importedResponse.json();
    assert.equal(imported.imported.created.modules,1);
    assert.equal(imported.imported.created.lessons,1);
    assert.equal(imported.summary.counts.units,2);
    assert.equal(imported.summary.counts.activities,1);

    const duplicateResponse=await fetch(base+`/api/projects/${created.id}/import-document?name=curso.md`,{method:'POST',headers:{'Content-Type':'text/markdown'},body:markdown});
    assert.equal(duplicateResponse.status,400);
    const afterDuplicate=await json(base+`/api/projects/${created.id}`);
    assert.equal(afterDuplicate.summary.counts.units,2);
    assert.equal(afterDuplicate.summary.counts.activities,1);

    const quiz={
      schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',version:'0.4.0',title:'Quiz E2E',language:'es',
      grading:{mode:'embedded-key'},questions:[{id:'q1',type:'true-false',prompt:'P2LRN es portable',points:1,choices:[{id:'true',text:'Verdadero'},{id:'false',text:'Falso'}],solution:{choiceIds:['true']}}]
    };
    const authored=await json(base+`/api/projects/${created.id}/questionnaires`,{method:'POST',body:JSON.stringify({title:'Quiz E2E',renderer:'https://p2lrn.org/renderer/questionnaire/standard',data:quiz})});
    assert.equal(authored.summary.counts.activities,2);
    const built=await json(base+`/api/projects/${created.id}/build`,{method:'POST',body:'{}'});
    assert.match(built.result.contentRoot,/^sha256:/);
    const packageResponse=await fetch(base+built.packageUrl);assert.equal(packageResponse.status,200);
    assert.match(packageResponse.headers.get('content-type')||'',/application\/vnd\.p2lrn\+zip/);
    const bytes=new Uint8Array(await packageResponse.arrayBuffer());assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b);
    const player=await fetch(base+'/player/p2lrn.esm.js');assert.equal(player.status,200);assert.ok((await player.text()).includes('P2LRN'));
  }finally{
    child.kill('SIGTERM');await new Promise(r=>setTimeout(r,50));if(!child.killed)child.kill('SIGKILL');rmSync(dataDir,{recursive:true,force:true});
  }
});
