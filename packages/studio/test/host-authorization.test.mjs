import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeP2LRNStudioRequest} from '../server/index.mjs';

const options={
  operation:'save',coursePath:'centre/cours',
  authenticate:async()=>({id:'teacher-1'}),
  authorize:async({principal,operation,coursePath})=>
    principal.id==='teacher-1'&&operation==='save'&&coursePath==='centre/cours',
  checkCsrf:async()=>true,
};
const req=(method='POST')=>new Request('https://example.invalid/api/p2lrn/studio/save',{method});
test('Studio Host authorization fails closed if no authenticated Host callbacks are supplied',async()=>{
  let res=await authorizeP2LRNStudioRequest(req(),{operation:'save'});
  assert.equal(res.status,503);
  assert.equal((await res.json()).error,'HOST_AUTHORIZATION_NOT_CONFIGURED');
  assert.equal((await authorizeP2LRNStudioRequest(req('GET'),options)).status,405);
  await assert.rejects(authorizeP2LRNStudioRequest(req(),{operation:'unknown'}),/Invalid Studio operation/);
});
test('Studio Host authorization rejects unauthenticated, cross-course and CSRF-invalid requests',async()=>{
  const r=req();
  assert.equal((await authorizeP2LRNStudioRequest(r,{...options,authenticate:async()=>null})).status,401);
  assert.equal((await authorizeP2LRNStudioRequest(r,{...options,authorize:async()=>false})).status,403);
  assert.equal((await authorizeP2LRNStudioRequest(r,{...options,checkCsrf:async()=>false})).status,403);
  assert.equal((await authorizeP2LRNStudioRequest(r,{...options,authenticate:async()=>{throw new Error('secret')}})).status,403);
  assert.equal(await authorizeP2LRNStudioRequest(r,options),null);
});
test('Studio authorization runs before reading upload body',async()=>{
  const stream=new ReadableStream({pull(){throw new Error('Body must not be read before checking access');}});
  const req=new Request('https://example.invalid/api/p2lrn/studio/save',
    {method:'POST',body:stream,duplex:'half'});
  const denied=await authorizeP2LRNStudioRequest(req,{operation:'save'});
  assert.equal(denied.status,503);
  assert.equal(req.bodyUsed,false);
});
