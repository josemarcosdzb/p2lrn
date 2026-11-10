import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const VALID_BODY=Object.freeze({
  name:'Security Test',email:'security@example.invalid',
  subject:'Website verification',message:'Please validate this security test message.',
  page:'/contacto/',turnstileToken:'test-token',
});
let counter=0;
async function harness({secret='test-secret',required='true',siteResult={success:true,hostname:'p2lrn.org',action:'contact'},siteError=false}={}){
  let handler=null;
  const calls=[];
  const priorDeno=globalThis.Deno,priorFetch=globalThis.fetch;
  globalThis.Deno={
    env:{get(key){
      return {SUPABASE_URL:'https://test.supabase.invalid',
        SUPABASE_SERVICE_ROLE_KEY:'test-only-not-secret',
        TURNSTILE_SECRET_KEY:secret,TURNSTILE_REQUIRED:required}[key]??'';
    }},
    serve(fn){handler=fn},
  };
  globalThis.fetch=async(url,opts)=>{
    calls.push(String(url));
    if(String(url).includes('turnstile/v0/siteverify')){
      if(siteError)throw Error('Simulated Siteverify outage');
      return Response.json(siteResult);
    }
    if(String(url).includes('submit_p2lrn_contact'))return new Response(null,{status:204});
    throw Error('Unexpected outbound URL in security test');
  };
  // Import an independent instance for each policy scenario. Node's TypeScript
  // module cache normalizes URL query strings in some Windows runtimes.
  const ts=readFileSync(new URL('../supabase/functions/p2lrn-contact/index.ts',import.meta.url),'utf8');
  const js=ts.replace(/\b([A-Za-z_$][\w$]*):\s*(string|number|Request)\b/g,'$1');
  const url='data:text/javascript;base64,'+Buffer.from(js,'utf8').toString('base64')+'#scenario-'+counter++;
  await import(url);
  assert.equal(typeof handler,'function');
  const request=body=>new Request('https://test.supabase.invalid/functions/v1/p2lrn-contact',{
    method:'POST',headers:{origin:'https://p2lrn.org','content-type':'application/json'},body:JSON.stringify(body),
  });
  return {handler,calls,request,restore(){
    globalThis.Deno=priorDeno;globalThis.fetch=priorFetch;
  }};
}

test('valid single-use Turnstile response gates the contact write',async()=>{
 const ctx=await harness();
 try{
  const response=await ctx.handler(ctx.request(VALID_BODY));
  assert.equal(response.status,200);
  assert.equal(ctx.calls.length,2);
  assert.match(ctx.calls[0],/turnstile\/v0\/siteverify/);
  assert.match(ctx.calls[1],/submit_p2lrn_contact/);
 }finally{ctx.restore()}
});
for(const [name,siteResult] of [
 ['expired-or-replayed',{success:false,'error-codes':['timeout-or-duplicate']}],
 ['wrong-host',{success:true,hostname:'evil.invalid',action:'contact'}],
 ['wrong-action',{success:true,hostname:'p2lrn.org',action:'other'}],
]){
 test(name+' Turnstile response never reaches privileged SQL',async()=>{
  const ctx=await harness({siteResult});
  try{const response=await ctx.handler(ctx.request(VALID_BODY));
    assert.equal(response.status,403);assert.equal(ctx.calls.length,1);
  }finally{ctx.restore()}
 });
}
test('missing token and broken Siteverify reject safely',async()=>{
 const ctx=await harness({siteError:true});
 try{assert.equal((await ctx.handler(ctx.request({...VALID_BODY,turnstileToken:''}))).status,403);
     assert.equal(ctx.calls.length,0);
     assert.equal((await ctx.handler(ctx.request(VALID_BODY))).status,403);
     assert.equal(ctx.calls.length,1);
 }finally{ctx.restore()}
});
test('requiring Turnstile without configured secret fails closed',async()=>{
 const ctx=await harness({secret:'',required:'true'});
 try{const response=await ctx.handler(ctx.request(VALID_BODY));
 assert.equal(response.status,503);assert.equal(ctx.calls.length,0)}
 finally{ctx.restore()}
});
test('cross-origin submission rejected before Turnstile and SQL',async()=>{
 const ctx=await harness();
 try{
  const req=new Request('https://test.supabase.invalid/functions/v1/p2lrn-contact',{
    method:'POST',headers:{origin:'https://hostile.invalid','content-type':'application/json'},
    body:JSON.stringify(VALID_BODY),
  });
  const res=await ctx.handler(req);
  assert.equal(res.status,403);assert.equal(ctx.calls.length,0);
 }finally{ctx.restore()}
});

test('oversized chunked contact JSON is rejected before challenge verification or SQL',async()=>{
 const ctx=await harness();
 try{
  const request=new Request('https://test.supabase.invalid/functions/v1/p2lrn-contact',{
   method:'POST',headers:{origin:'https://p2lrn.org','content-type':'application/json'},
   body:new ReadableStream({start(controller){
    controller.enqueue(new TextEncoder().encode('{"name":"'+('X'.repeat(16000))));
    controller.close();
   }}),duplex:'half'
  });
  const response=await ctx.handler(request);
  assert.equal(response.status,413);
  assert.equal(ctx.calls.length,0);
 }finally{ctx.restore()}
});
