import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createP2LRNJwtAuthenticator} from '../server/auth-jwt.mjs';
import {createP2LRNCollaborationHandler} from '../server/collaboration-http.mjs';
import {createServer} from 'node:http';

const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'test-key',use:'sig',alg:'RS256'};
const uri='https://accounts.example.test/.well-known/jwks.json';
const issuer='https://accounts.example.test/';
const audience='p2lrn-host';
const now=()=>Math.floor(Date.now()/1000);
const payload=()=>({sub:'student-1',iss:issuer,aud:audience,iat:now(),exp:now()+3600});
function token(claims=payload(),header={alg:'RS256',typ:'JWT',kid:'test-key'},key=privateKey){
  const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const input=b64(header)+'.'+b64(claims);
  return input+'.'+sign('RSA-SHA256',Buffer.from(input),key).toString('base64url');
}
function configure(override={}){
  let calls=0;
  const authenticate=createP2LRNJwtAuthenticator({
    issuer,audience,jwksUri:uri,
    fetchImpl:async()=>{calls++;return new Response(JSON.stringify({keys:[jwk]}),{status:200});},
    ...override,
  });
  return {authenticate,calls:()=>calls};
}
test('JWT adapter validates RS256 signature, issuer, audience and expiry, and derives identity from verified sub',async()=>{
  const {authenticate,calls}=configure();
  const actor=await authenticate({headers:{authorization:'Bearer '+token()}});
  assert.deepEqual(actor,{id:'student-1',issuer,subjectId:'student-1'});
  assert.equal(calls(),1);
  assert.equal(await authenticate({headers:{authorization:'Bearer '+token({...payload(),sub:'student-2'})}}).then(a=>a?.id),'student-2');
  assert.equal(calls(),1,'JWKS must cache keys');
  for(const claims of [
    {...payload(),iss:'https://evil.test/'},{...payload(),aud:'evil'},
    {...payload(),exp:now()-3600},{...payload(),nbf:now()+3600},
    {...payload(),iat:now()+3600},{...payload(),exp:undefined},
  ])assert.equal(await authenticate({headers:{authorization:'Bearer '+token(claims)}}),null);
});
test('JWT adapter fails closed for tampering, unsigned JWT, missing token and unsafe config',async()=>{
  const {authenticate}=configure();
  const valid=token();
  const parts=valid.split('.');
  const tampered=parts[0]+'.'+Buffer.from(JSON.stringify({...payload(),sub:'admin'})).toString('base64url')+'.'+parts[2];
  assert.equal(await authenticate({headers:{authorization:'Bearer '+tampered}}),null);
  assert.equal(await authenticate({headers:{authorization:'Bearer '+token(payload(),{alg:'none',kid:'test-key'})}}),null);
  assert.equal(await authenticate({headers:{authorization:'Bearer '+token(payload(),{alg:'RS256',kid:'test-key',jku:'https://evil.test/keys'})}}),null);
  assert.equal(await authenticate({headers:{authorization:''},url:'/?token='+valid}),null);
  assert.throws(()=>createP2LRNJwtAuthenticator({issuer,audience,jwksUri:'http://evil.example/jwks'}),/HTTPS/);
  assert.throws(()=>createP2LRNJwtAuthenticator({issuer,audience,jwksUri:uri,allowedAlgorithms:['none']}),/algorithm/);
});
test('JWT adapter fails closed when JWKS is unavailable or ambiguous',async()=>{
  const down=createP2LRNJwtAuthenticator({issuer,audience,jwksUri:uri,
    fetchImpl:async()=>new Response('',{status:503})});
  assert.equal(await down({headers:{authorization:'Bearer '+token()}}),null);
  const duplicate=createP2LRNJwtAuthenticator({issuer,audience,jwksUri:uri,
    fetchImpl:async()=>new Response(JSON.stringify({keys:[jwk,jwk]}),{status:200})});
  assert.equal(await duplicate({headers:{authorization:'Bearer '+token()}}),null);
});
test('HTTP collaboration uses verified JWT actor and denies spoofed identity from client',async()=>{
  const {authenticate}=configure();
  const service=Object.fromEntries(['join','send','listen','snapshot','leave'].map(op=>[op,async({actor,context})=>({actorId:actor.id,tenant:context.tenant,operation:op})]));
  const handler=createP2LRNCollaborationHandler({
    allowedOrigins:['https://app.example.test'],authenticate,
    resolveContext:async({actor})=>({tenant:actor.id==='student-1'?'school-a':'other'}),
    authorize:({actor,context})=>actor.id==='student-1'&&context.tenant==='school-a',
    service,
  });
  const server=createServer((req,res)=>handler(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const url='http://127.0.0.1:'+server.address().port;
    async function send(auth,input){
      return fetch(url,{method:'POST',headers:{
        Origin:'https://app.example.test',Authorization:'Bearer '+auth,
        'Content-Type':'application/vnd.p2lrn.collaboration+json',
      },body:JSON.stringify({version:'1',operation:'join',input,context:{}})});
    }
    const valid=await send(token(),{room:'main'});
    assert.equal(valid.status,200);
    assert.equal((await valid.json()).result.actorId,'student-1');
    const forged=await send(token(),{room:'main',actorId:'admin'});
    assert.equal(forged.status,400);
    const denied=await send(token({...payload(),sub:'student-2'}),{room:'main'});
    assert.equal(denied.status,403);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
