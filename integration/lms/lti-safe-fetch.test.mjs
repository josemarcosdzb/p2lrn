import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {pinnedLmsFetch,publicLmsAddress,validatedLmsAddresses} from './lti-safe-fetch.mjs';

test('private, mapped, local, link-local and metadata IPs are never approved for LMS services',()=>{
 for(const address of ['127.0.0.1','10.1.1.1','172.16.0.1','192.168.1.2',
  '169.254.169.254','100.64.0.1','0.1.1.1','224.0.0.1',
  '::1','fe80::1','fc00::1','::ffff:127.0.0.1'])
  assert.equal(publicLmsAddress(address),false,address);
 for(const address of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])
  assert.equal(publicLmsAddress(address),true,address);
});

test('LMS connection uses only the pre-approved address and rejects implicit redirects',async()=>{
 const listener=http.createServer((request,response)=>{
  assert.equal(request.headers.host?.startsWith('qa.localhost:'),true);
  response.writeHead(request.url==='/redirect'?302:200,{
   'content-type':'application/json','location':'http://127.0.0.1/private'});
  response.end(JSON.stringify({from:'approved local QA address'}));
 });
 await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
 try{
  const port=listener.address().port;
  let resolutions=0;
  const lookup=async()=>{resolutions++;return [{address:'127.0.0.1',family:4}]};
  const config={lookup,allowInsecureLoopback:true};
  const ok=await pinnedLmsFetch('http://qa.localhost:'+port+'/safe',{method:'GET'},config);
  assert.equal(ok.status,200);
  assert.deepEqual(await ok.json(),{from:'approved local QA address'});
  assert.equal(resolutions,1,'a connection must never silently re-resolve DNS');
  const redirect=await pinnedLmsFetch('http://qa.localhost:'+port+'/redirect',
   {redirect:'manual'},config);
  assert.equal(redirect.status,302);
  assert.equal(resolutions,2,'each request validates and pins its own DNS resolution');
 }finally{await new Promise(resolve=>listener.close(resolve))}
});

test('rejects a hostname that resolves to cloud metadata or a mixed unsafe DNS set',async()=>{
 let hits=0;
 for(const entries of [
  [{address:'169.254.169.254',family:4}],
  [{address:'1.1.1.1',family:4},{address:'127.0.0.1',family:4}],
  [{address:'::ffff:10.0.0.1',family:6}]]){
  const lookup=async()=>{hits++;return entries};
  await assert.rejects(validatedLmsAddresses('https://lms.example/resource',{lookup}),
   /LTI_UNSAFE_DNS_ADDRESS/);
 }
 assert.equal(hits,3);
 await assert.rejects(validatedLmsAddresses('http://lms.example/',{
  lookup:async()=>[{address:'1.1.1.1',family:4}]}),/LTI_UNTRUSTED_NETWORK_TARGET/);
});
