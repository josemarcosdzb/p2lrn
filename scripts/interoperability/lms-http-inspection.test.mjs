import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyLmsResponse,connectivityState} from './lms-http-inspection.mjs';

const page=(status,body,other={})=>classifyLmsResponse({
 status,body,mediaType:'text/html; charset=utf-8',
 requestedUrl:'http://jose-moodle-qa-20261017.localhost/login/index.php',...other
});

test('Caddy 200 with empty response is not usable and never counts as content',()=>{
 const result=page(200,'',{mediaType:''});
 assert.equal(result.classification,'EMPTY_HTTP_RESPONSE');
 assert.equal(result.payloadObserved,false);
 assert.equal(result.bodyLength,0);
 assert.equal(connectivityState({direct:{reached:false},proxy:{reached:true,...result}}),'EMPTY_HTTP_RESPONSE');
});

test('real LMS HTML counts only as content, never an authenticated student',()=>{
 const result=page(200,'<!doctype html><title>Mi Campus Moodle</title><p>Login</p>');
 assert.equal(result.classification,'HTTP_CONTENT_PRESENT');
 assert.equal(result.payloadObserved,true);
 assert.equal(result.title,'Mi Campus Moodle');
 assert.equal(connectivityState({direct:{reached:true,...result}}),'HTTP_CONTENT_OBSERVED_NOT_AUTHENTICATED');
});

test('LMS login redirects do not prove content or credentials and redact query',()=>{
 const result=page(303,'',{location:'http://127.0.0.1:3000/entrar?redirect=%2Flms&session=secret'});
 assert.equal(result.classification,'REDIRECT_ONLY');
 assert.equal(result.redirectTarget,'http://127.0.0.1:3000/entrar');
 assert.equal(result.payloadObserved,false);
 assert.equal(connectivityState({direct:{reached:true,...result}}),'HTTP_REDIRECT_ONLY');
});

test('404 with HTML error body is never a reachable LMS page',()=>{
 const result=page(404,'<title>HTTP Status 404</title>');
 assert.equal(result.classification,'HTTP_ERROR');
 assert.equal(result.payloadObserved,false);
 assert.equal(connectivityState({direct:{reached:true,...result}}),'HTTP_ERROR_OR_INVALID_RESPONSE');
});

test('forged or malformed provider health never passes',()=>{
 for(const data of [
  {status:'ok',standalone:false,provider:'P2LRN LTI 1.3'},
  {status:'ok',standalone:true,provider:'Another server'},
  {provider:'P2LRN LTI 1.3'},
  {status:'ok',standalone:true,provider:'P2LRN LTI 1.3',extra:'but non JSON'}
 ]){
  const response=classifyLmsResponse({
   status:200,body:JSON.stringify(data),mediaType:data.extra?'text/html':'application/json',expected:'health'
  });
  assert.equal(response.ltiHealthOk,false);
  assert.equal(response.payloadObserved,false);
  assert.equal(response.classification,'INVALID_LTI_HEALTH');
 }
});

test('real validated standalone provider health JSON is accepted only as a service check',()=>{
 const r=classifyLmsResponse({
  status:200,body:JSON.stringify({status:'ok',standalone:true,provider:'P2LRN LTI 1.3'}),
  mediaType:'application/json',expected:'health'
 });
 assert.equal(r.classification,'LTI_ENDPOINT_VALID');
 assert.equal(r.ltiHealthOk,true);
});

test('JWKS requires public RSA keys and rejects private key material',()=>{
 const key={kty:'RSA',n:'a'.repeat(340),e:'AQAB'};
 const good=classifyLmsResponse({
  status:200,body:JSON.stringify({keys:[key]}),mediaType:'application/json',expected:'jwks'
 });
 assert.equal(good.jwksKeys,1);
 assert.equal(good.payloadObserved,true);
 const bad=classifyLmsResponse({
  status:200,body:JSON.stringify({keys:[{...key,d:'private'}]}),mediaType:'application/json',expected:'jwks'
 });
 assert.equal(bad.classification,'INVALID_PUBLIC_JWKS');
 assert.equal(bad.payloadObserved,false);
 assert.equal(bad.jwksKeys,null);
});

test('status 200 text without a JSON body cannot be labelled successful LTI health',()=>{
 const r=classifyLmsResponse({status:200,body:'ok',mediaType:'text/plain',expected:'health'});
 assert.equal(r.classification,'INVALID_LTI_HEALTH');
 assert.equal(r.payloadObserved,false);
});

test('invalid response expectations and HTTP status are rejected',()=>{
 assert.throws(()=>classifyLmsResponse({status:0}),/Invalid HTTP status/);
 assert.throws(()=>classifyLmsResponse({status:200,expected:'officialGrade'}),/Unknown expected/);
});

test('fallback prioritizes genuinely meaningful response over misleading empty success',()=>{
 const direct={reached:true,...page(200,'',{mediaType:''})};
 const proxy={reached:true,...page(200,'<title>Chamilo</title>')};
 assert.equal(connectivityState({direct,proxy}),'PROXY_CONTENT_OBSERVED_NOT_AUTHENTICATED');
});

test('push preflight does not spawn duplicate historical Studio courses or captures',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/p2lrn-interoperability-real.yml',import.meta.url),'utf8');
 const names=['create-one-real-studio-course','verify-fixed-original-in-independent-web',
  'verify-original-offline-windows','create-version-two-in-real-studio',
  'verify-original-h5p-scorm-and-drag-frames','verify-independent-web-reentry'];
 for(const name of names){
  const beginning=workflow.indexOf('\n  '+name+':');
  assert.ok(beginning>0,name+' job must exist');
  const next=workflow.slice(beginning+4).search(/\n  [a-z][a-z0-9-]+:/);
  const section=next>=0?workflow.slice(beginning,beginning+4+next):workflow.slice(beginning);
  assert.match(section,/^\s{4}if: github\.event_name == 'workflow_dispatch'$/m,
   name+' is not allowed to rerun historical courses on push');
 }
 assert.match(workflow,/\$dir=Join-Path \$env:RUNNER_TEMP 'p2lrn-interoperability-preflight'/);
});
