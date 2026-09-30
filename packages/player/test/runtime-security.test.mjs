import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createP2LRNRuntimeHandler,
  startP2LRNRuntimeHost,
} from '../server/runtime-host.mjs';

test('runtime host rejects wildcard and insecure non-local parent origins',()=>{
  assert.throws(
    ()=>createP2LRNRuntimeHandler({allowedParentOrigins:['*']}),
    /Wildcard allowedParentOrigins is not permitted/,
  );
  assert.throws(
    ()=>createP2LRNRuntimeHandler({allowedParentOrigins:['http://example.invalid']}),
    /must use HTTPS/,
  );
  assert.doesNotThrow(
    ()=>createP2LRNRuntimeHandler({allowedParentOrigins:['http://127.0.0.1:3000']}),
  );
});

test('runtime host defaults to loopback and never grants CORS to an untrusted origin',async()=>{
  const host=await startP2LRNRuntimeHost({
    basePath:'/runtime',
    allowedParentOrigins:['https://app.example.invalid'],
  });
  try{
    const parsed=new URL(host.origin);
    assert.ok(['127.0.0.1','[::1]','::1'].includes(parsed.hostname),host.origin);

    const denied=await fetch(host.baseUrl+'h5p/session',{
      method:'POST',
      headers:{
        Origin:'https://evil.example.invalid',
        'Content-Type':'application/vnd.p2lrn.h5p-session',
      },
      body:new Uint8Array([0]),
    });
    assert.equal(denied.status,403);
    assert.equal(denied.headers.get('access-control-allow-origin'),null);

    const preflight=await fetch(host.baseUrl+'h5p/session',{
      method:'OPTIONS',
      headers:{Origin:'https://app.example.invalid'},
    });
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get('access-control-allow-origin'),'https://app.example.invalid');
    assert.notEqual(preflight.headers.get('access-control-allow-origin'),'*');

    const anonymous=await fetch(host.baseUrl+'h5p/session',{
      method:'POST',
      headers:{'Content-Type':'application/vnd.p2lrn.h5p-session'},
      body:new Uint8Array([0]),
    });
    assert.equal(anonymous.status,403);
  }finally{
    await host.close();
  }
});

test('runtime host rejects unsupported methods under its route',async()=>{
  const host=await startP2LRNRuntimeHost({
    basePath:'/runtime',
    allowedParentOrigins:['https://app.example.invalid'],
  });
  try{
    const response=await fetch(host.baseUrl+'scorm/',{method:'PUT'});
    assert.equal(response.status,405);
    assert.equal(response.headers.get('allow'),'GET, HEAD');
  }finally{
    await host.close();
  }
});


test('runtime host applies defensive headers and frame-ancestor policy',async()=>{
  const host=await startP2LRNRuntimeHost({
    basePath:'/runtime',
    allowedParentOrigins:['https://app.example.invalid'],
  });
  try{
    const health=await fetch(host.baseUrl+'health');
    assert.equal(health.headers.get('x-content-type-options'),'nosniff');
    assert.equal(health.headers.get('referrer-policy'),'no-referrer');

    const scorm=await fetch(host.baseUrl+'scorm/');
    assert.equal(scorm.status,200);
    assert.equal(scorm.headers.get('x-content-type-options'),'nosniff');
    assert.equal(scorm.headers.get('referrer-policy'),'no-referrer');
    const csp=scorm.headers.get('content-security-policy')||'';
    assert.match(csp,/frame-ancestors https:\/\/app\.example\.invalid/u);
    assert.match(csp,/connect-src 'none'/u);

    const missing=await fetch(host.baseUrl+'does-not-exist');
    assert.equal(missing.status,404);
    assert.equal(missing.headers.get('x-content-type-options'),'nosniff');
    assert.equal(missing.headers.get('referrer-policy'),'no-referrer');
  }finally{
    await host.close();
  }
});
