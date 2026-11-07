import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createLocalQaLmsFetch} from './lti-local-qa-gateway.mjs';

test('disabled gateway leaves production and isolated test fetch unchanged',async()=>{
 const request=(...args)=>args;
 const wrapped=await createLocalQaLmsFetch({fetchImpl:request,enabled:false});
 assert.equal(wrapped,request);
});

test('local LMS traffic reaches an actual HTTP ingress with registered Host and response body preserved',async()=>{
 const seen=[];
 const local=http.createServer(async(req,res)=>{
  let body='';for await(const b of req)body+=b.toString('utf8');
  seen.push({host:req.headers.host,path:req.url,method:req.method,body,headers:req.headers});
  res.writeHead(201,{'Content-Type':'application/json'});
  res.end(JSON.stringify({received:true,host:req.headers.host}));
 });
 await new Promise(done=>local.listen(0,'127.0.0.1',done));
 try{
  const {port}=local.address();
  const wrapped=await createLocalQaLmsFetch({
   enabled:true,lookup:async()=>({address:'172.18.0.10'}),gatewayHost:'aulap2p-ingress-local',
   fetchImpl:async()=>{throw new Error('A normal fetch would use the stale IP')},
   requestLocal:(url,options,handler)=>http.request(new URL('http://127.0.0.1:'+port+url.pathname+url.search),options,handler)
  });
  const response=await wrapped('http://jose-moodle-qa-20261017.localhost/mod/lti/token.php?type_id=1',{
   method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Trace':'qa'},
   body:new URLSearchParams({grant_type:'client_credentials'}),redirect:'manual'
  });
  assert.equal(response.status,201);
  assert.deepEqual(await response.json(),{received:true,host:'jose-moodle-qa-20261017.localhost'});
  assert.equal(seen[0].host,'jose-moodle-qa-20261017.localhost');
  assert.equal(seen[0].path,'/mod/lti/token.php?type_id=1');
  assert.equal(seen[0].body,'grant_type=client_credentials');
  assert.equal(seen[0].method,'POST');
  assert.equal(seen[0].headers['x-trace'],'qa');
 }finally{await new Promise(done=>local.close(done));}
});

test('production, external hosts, and tool self-origin are never routed',async()=>{
 const seen=[];
 const wrapped=await createLocalQaLmsFetch({enabled:true,lookup:async()=>({address:'172.18.0.10'}),
  fetchImpl:async(url)=>{seen.push(String(url));return {status:204}},
  requestLocal:()=>{throw new Error('Unexpected proxy')}});
 for(const url of ['https://lms.example.edu/token','http://evil.example/token',
  'http://jose-moodle-qa-20261017.localhost.attacker.net/token','http://p2lrn-lti.localhost/lti/jwks'])
  await wrapped(url);
 assert.deepEqual(seen,['https://lms.example.edu/token','http://evil.example/token',
  'http://jose-moodle-qa-20261017.localhost.attacker.net/token','http://p2lrn-lti.localhost/lti/jwks']);
});

test('missing DNS or external DNS cannot receive trusted local LMS credentials',async()=>{
 const original=async()=>({status:200});
 const noDns=await createLocalQaLmsFetch({enabled:true,fetchImpl:original,
  lookup:async()=>{throw new Error('ENOTFOUND')}});
 const publicDns=await createLocalQaLmsFetch({enabled:true,fetchImpl:original,
  lookup:async()=>({address:'8.8.8.8'})});
 assert.equal(noDns,original);assert.equal(publicDns,original);
});

test('rejects custom gateway hostnames that could be untrusted destinations',async()=>{
 for(const h of ['example.com','127.0.0.1','-bad','x/escape','https://example.org','']){
  await assert.rejects(createLocalQaLmsFetch({enabled:true,gatewayHost:h}),/Invalid local QA gateway DNS name/);
 }
});

