import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAsyncLtiStore} from './lti-async-store.mjs';

test('asynchronous worker preserves SQLite integrity and bounded concurrency',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'p2lrn-lti-async-'));
 const store=createAsyncLtiStore(join(folder,'state.sqlite'),{engine:'sqlite'});
 try{
  await store.ready;
  assert.equal(store.healthy,true);
  assert.equal(await store.count('platforms'),0);
  const stateHash='a'.repeat(64);
  await store.transactions.create({
   stateHash,nonceHash:'b'.repeat(64),browserHash:'c'.repeat(64),
   issuer:'https://lms.example',clientId:'client',registrationId:'reg1',
   deploymentHint:null,targetLinkUri:'https://tool.example/lti/launch',
   expiresAt:Math.floor(Date.now()/1000)+120
  });
  const consumed=await Promise.all(Array.from({length:8},()=>store.transactions.consume(stateHash)));
  assert.equal(consumed.filter(Boolean).length,1,'OIDC state must remain single-use');
  const decisions=await Promise.all(Array.from({length:12},()=>store.admitSecurityRequest([
   {scope:'async-worker-limiter',limit:3,seconds:60}
  ])));
  assert.equal(decisions.filter(Boolean).length,3);
  assert.equal(decisions.filter(x=>x===false).length,9);
 }finally{
  await store.close();
  rmSync(folder,{recursive:true,force:true});
 }
 assert.equal(store.healthy,false);
 await assert.rejects(store.count('platforms'),/not ready/);
});
