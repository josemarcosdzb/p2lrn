import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {CapabilityBroker} from '../web/capability-broker.js';
import {createHttpCollaborationProvider,COLLABORATION_HTTP_MEDIA_TYPE} from '../web/collaboration-http-provider.js';
import {createP2LRNCollaborationHandler} from '../../player/server/collaboration-http.mjs';

async function listen(handler){
  const server=createServer((req,res)=>void handler(req,res));
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Test server did not expose a port.');
  const origin='http://127.0.0.1:'+address.port;
  return {origin,close:()=>new Promise((resolve,reject)=>server.close((error)=>error?reject(error):resolve()))};
}

function memoryService(){
  const rooms=new Map(),sessions=new Map();
  let next=0;
  const state=(context,room)=>{
    const key=[context.tenant,context.contentRoot,context.entityId,room].join('|');
    if(!rooms.has(key))rooms.set(key,{revision:0,participants:new Map(),events:[]});
    return {key,value:rooms.get(key)};
  };
  const current=({actor,input,context})=>{
    const session=sessions.get(String(input.sessionId??''));
    if(!session)throw Object.assign(new Error('Session required.'),{code:'P2LRN_COLLABORATION_SESSION_REQUIRED',statusCode:409});
    if(session.actor!==actor.id)throw Object.assign(new Error('Session actor mismatch.'),{code:'P2LRN_COLLABORATION_SESSION_ACTOR',statusCode:403});
    const scoped=state(context,session.room);
    if(scoped.key!==session.key)throw Object.assign(new Error('Session scope mismatch.'),{code:'P2LRN_COLLABORATION_SCOPE_MISMATCH',statusCode:403});
    return {session,room:scoped.value};
  };
  return {
    async join({actor,input,context}){
      const room=String(input.room??'main');
      const scoped=state(context,room);
      const sessionId='s-'+(++next);
      sessions.set(sessionId,{actor:actor.id,room,key:scoped.key});
      scoped.value.participants.set(sessionId,actor.id);
      return {sessionId,participantId:actor.id,revision:scoped.value.revision,presence:scoped.value.participants.size};
    },
    async send(args){
      const {actor,input}=args,{room}=current(args);
      room.revision+=1;
      const event={revision:room.revision,type:String(input.type),participantId:actor.id,payload:input.payload??{}};
      room.events.push(event);
      return {revision:room.revision,presence:room.participants.size,event};
    },
    async listen(args){
      const {input}=args,{room}=current(args);
      const cursor=Math.max(0,Number(input.cursor)||0);
      return {revision:room.revision,presence:room.participants.size,events:room.events.filter((event)=>event.revision>cursor),hasMore:false};
    },
    async snapshot(args){
      const {room}=current(args);
      return {revision:room.revision,presence:room.participants.size,events:room.events};
    },
    async leave(args){
      const {input}=args,{room}=current(args);
      room.participants.delete(String(input.sessionId));
      sessions.delete(String(input.sessionId));
      return {left:true,revision:room.revision,presence:room.participants.size};
    },
  };
}

test('production HTTP collaboration provider authenticates host users and synchronizes a room',async(t)=>{
  let endpoint;
  const handler=createP2LRNCollaborationHandler({
    allowedOrigins:['http://127.0.0.1'],
    authenticate:(req)=>{
      const token=String(req.headers.authorization??'').replace(/^Bearer\s+/u,'');
      return token?{id:token}:null;
    },
    resolveContext:({clientContext})=>({
      tenant:'host-tenant',
      contentRoot:String(clientContext.contentRoot??''),
      entityId:String(clientContext.entityId??''),
    }),
    authorize:({actor,context})=>Boolean(actor?.id&&context.contentRoot&&context.entityId),
    service:memoryService(),
  });
  const server=await listen(handler);t.after(server.close);endpoint=server.origin+'/collaboration';

  const make=(actor)=>new CapabilityBroker({
    providers:[createHttpCollaborationProvider({
      endpoint,
      getHeaders:()=>({Authorization:'Bearer '+actor,Origin:'ignored-by-provider'}),
      fetchImpl:(url,options)=>fetch(url,{...options,headers:{...options.headers,Origin:'http://127.0.0.1'}}),
    })],
    authorize:()=>true,
  });
  const context={contentRoot:'sha256:'+'c'.repeat(64),entityId:'urn:test:production-poll',secret:'must-not-cross'};
  const a=make('learner-a'),b=make('learner-b');
  const joinA=await a.invoke('collaboration.room','join',{room:'main'},context);
  const joinB=await b.invoke('collaboration.room','join',{room:'main'},context);
  assert.equal(joinA.participantId,'learner-a');
  assert.equal(joinB.presence,2);
  await a.invoke('collaboration.room','send',{sessionId:joinA.sessionId,type:'poll.vote',payload:{choiceId:'a'}},context);
  const heard=await b.invoke('collaboration.room','listen',{sessionId:joinB.sessionId,cursor:0},context);
  assert.equal(heard.events.length,1);
  assert.equal(heard.events[0].participantId,'learner-a');
  assert.equal(heard.events[0].payload.choiceId,'a');
  assert.equal((await b.invoke('collaboration.room','snapshot',{sessionId:joinB.sessionId},context)).presence,2);
  await a.invoke('collaboration.room','leave',{sessionId:joinA.sessionId},context);
  assert.equal((await b.invoke('collaboration.room','snapshot',{sessionId:joinB.sessionId},context)).presence,1);
});

test('production collaboration handler rejects forged identity, untrusted origin and missing authentication',async(t)=>{
  const handler=createP2LRNCollaborationHandler({
    allowedOrigins:['http://127.0.0.1'],
    authenticate:(req)=>req.headers.authorization?{id:'host-user'}:null,
    resolveContext:()=>({tenant:'host',contentRoot:'root',entityId:'activity'}),
    authorize:()=>true,
    service:memoryService(),
  });
  const server=await listen(handler);t.after(server.close);
  const request=(body,{origin='http://127.0.0.1',authorization='Bearer ok'}={})=>fetch(server.origin+'/collaboration',{
    method:'POST',
    headers:{'Content-Type':COLLABORATION_HTTP_MEDIA_TYPE,Origin:origin,...(authorization?{Authorization:authorization}:{})},
    body:JSON.stringify(body),
  });

  const forged=await request({version:'1',operation:'join',input:{room:'main',participantId:'attacker'},context:{}});
  assert.equal(forged.status,400);
  assert.equal((await forged.json()).code,'P2LRN_COLLABORATION_IDENTITY_FORBIDDEN');

  const origin=await request({version:'1',operation:'join',input:{room:'main'},context:{}},{origin:'https://evil.example'});
  assert.equal(origin.status,403);
  assert.equal((await origin.json()).code,'P2LRN_COLLABORATION_ORIGIN_DENIED');

  const unauthenticated=await request({version:'1',operation:'join',input:{room:'main'},context:{}},{authorization:''});
  assert.equal(unauthenticated.status,401);
  assert.equal((await unauthenticated.json()).code,'P2LRN_COLLABORATION_UNAUTHENTICATED');
});


test('collaboration host enforces a per-actor per-second burst limit independent of minute quota',async(t)=>{
  const handler=createP2LRNCollaborationHandler({
    allowedOrigins:['http://127.0.0.1'],
    authenticate:()=>({id:'learner-burst'}),
    resolveContext:()=>({tenant:'host',contentRoot:'root',entityId:'poll'}),
    authorize:()=>true,
    service:memoryService(),
    maxRequestsPerMinute:600,
    maxRequestsPerSecond:3,
  });
  const server=await listen(handler);t.after(server.close);
  const run=()=>fetch(server.origin+'/collaboration',{
    method:'POST',
    headers:{'Content-Type':COLLABORATION_HTTP_MEDIA_TYPE,Origin:'http://127.0.0.1'},
    body:JSON.stringify({version:'1',operation:'join',input:{room:'main'},context:{}}),
  });
  for(let i=0;i<3;i++)assert.equal((await run()).status,200);
  const denied=await run();
  assert.equal(denied.status,429);
  assert.equal((await denied.json()).code,'P2LRN_COLLABORATION_RATE_LIMITED');
});
