import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createP2LRNAnalyticsDatasetHandler} from '../server/dataset-http.mjs';
import {createHttpAnalyticsDataSource} from '../src/model.js';

const origins=['https://app.example.test'];
const data={
  learners:[
    {id:'learner-a',name:'Ana',email:'ana@example.test',metadata:{secret:'DO_NOT_SEND'}},
    {id:'learner-b',name:'Bob',email:'bob@example.test',metadata:{secret:'DO_NOT_SEND'}},
  ],
  courses:[{id:'course-1',title:'Physics'},{id:'course-2',title:'Private'}],
  enrollments:[
    {id:'ea',learnerId:'learner-a',courseId:'course-1',metadata:{secret:true}},
    {id:'eb',learnerId:'learner-b',courseId:'course-1'},
    {id:'ec',learnerId:'learner-a',courseId:'course-2'},
  ],
  attempts:[
    {id:'a1',learnerId:'learner-a',courseId:'course-1'},
    {id:'b1',learnerId:'learner-b',courseId:'course-1'},
  ],
  grades:[
    {id:'ga',learnerId:'learner-a',courseId:'course-1',value:9,maxValue:10,authoritative:true},
    {id:'gb',learnerId:'learner-b',courseId:'course-1',value:2,maxValue:10,authoritative:true},
  ],
  events:[
    {id:'ev1',learnerId:'learner-a',courseId:'course-1',type:'viewed',
      context:{password:'secret'},payload:{privateInfo:'secret'}},
    {id:'ev2',learnerId:'learner-b',courseId:'course-1',type:'viewed'},
  ],
};
async function live(options={}){
 const handler=createP2LRNAnalyticsDatasetHandler({
  allowedOrigins:origins,
  authenticate:async req=>req.headers.authorization?{id:'principal'}:null,
  authorize:async()=>({role:'teacher',allowedLearnerIds:['learner-a']}),
  loadDataset:async()=>data,
  ...options,
 });
 const server=createServer((req,res)=>{void handler(req,res);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {url:'http://127.0.0.1:'+server.address().port+'/api/p2lrn/analytics/dataset?tenantId=tenant-1&courseId=course-1',
   close:()=>new Promise(resolve=>server.close(resolve))};
}
const auth={'Authorization':'Bearer test','Origin':origins[0]};

test('analytics Host service fails closed without identity, ACL callbacks and explicit HTTPS origins',()=>{
 assert.throws(()=>createP2LRNAnalyticsDatasetHandler({allowedOrigins:['*']}),/Invalid Analytics allowed origin/);
 assert.throws(()=>createP2LRNAnalyticsDatasetHandler({allowedOrigins:origins}),/Host authentication/);
 assert.throws(()=>createP2LRNAnalyticsDatasetHandler({allowedOrigins:['http://evil.example.test']}),/Invalid Analytics allowed origin/);
});
test('analytics Host denies anonymous, unapproved Origin and missing scope',async t=>{
 const server=await live();t.after(server.close);
 assert.equal((await fetch(server.url,{headers:{Origin:origins[0]}})).status,401);
 const cross=await fetch(server.url,{headers:{...auth,Origin:'https://evil.example.test'}});
 assert.equal(cross.status,403);
 assert.equal(cross.headers.get('access-control-allow-origin'),null);
 assert.equal((await fetch(server.url.split('?')[0],{headers:auth})).status,400);
});
test('teacher sees only assigned learners in one course; unrelated PII and grades are masked',async t=>{
 const server=await live();t.after(server.close);
 const result=await fetch(server.url,{headers:auth});
 assert.equal(result.status,200);
 assert.equal(result.headers.get('access-control-allow-origin'),origins[0]);
 assert.equal(result.headers.get('cache-control'),'private, no-store, max-age=0');
 const body=await result.json();
 assert.deepEqual(body.learners.map(x=>x.id),['learner-a']);
 assert.equal(body.learners[0].email,'');
 assert.deepEqual(body.courses.map(x=>x.id),['course-1']);
 assert.deepEqual(body.enrollments.map(x=>x.id),['ea']);
 assert.deepEqual(body.attempts.map(x=>x.id),['a1']);
 assert.deepEqual(body.grades.map(x=>x.id),['ga']);
 assert.equal(body.grades[0].authoritative,false);
 assert.deepEqual(body.events.map(x=>x.id),['ev1']);
 const text=JSON.stringify(body);
 assert.ok(!text.includes('DO_NOT_SEND'));
 assert.ok(!text.includes('bob@example.test'));
 assert.ok(!text.includes('privateInfo'));
 assert.ok(!text.includes('course-2'));
});
test('learners see only own rows even if loader accidentally returns whole institution',async t=>{
 const server=await live({authorize:async()=>({role:'learner',learnerId:'learner-b'})});
 t.after(server.close);
 const body=await (await fetch(server.url,{headers:auth})).json();
 assert.deepEqual(body.learners.map(x=>x.id),['learner-b']);
 assert.deepEqual(body.grades.map(x=>x.id),['gb']);
 assert.equal(body.grades[0].authoritative,false);
});
test('admin must be bound to the requested tenant and authoritatively approved grades',async t=>{
 const server=await live({authorize:async()=>({role:'admin',tenantId:'tenant-1',allowAuthoritativeGrades:true})});
 t.after(server.close);
 const body=await (await fetch(server.url,{headers:auth})).json();
 assert.equal(body.learners.length,2);
 assert.ok(body.grades.every(x=>x.authoritative===true));
 const denied=await live({authorize:async()=>({role:'admin',tenantId:'another-tenant'})});
 t.after(denied.close);
 assert.equal((await fetch(denied.url,{headers:auth})).status,403);
});
test('analytics Host rejects method misuse and response flooding',async t=>{
 const server=await live({maxResponseBytes:1024,loadDataset:async()=>({...data,
  learners:Array.from({length:100},(_,i)=>({id:'learner-a',name:'X'.repeat(160)+i}))})});
 t.after(server.close);
 assert.equal((await fetch(server.url,{method:'POST',headers:auth})).status,405);
 const output=await fetch(server.url,{headers:auth});
 assert.equal(output.status,413);
});
test('real HTTP Analytics datasource enforces Host ACL and tenant/course scope',async t=>{
  const server=await live();t.after(server.close);
  const source=createHttpAnalyticsDataSource({
    url:server.url.replace('&courseId=course-1',''),
    headers:auth,
  });
  const dataset=await source.load({courseId:'course-1'});
  assert.deepEqual(dataset.learners.map(x=>x.id),['learner-a']);
  assert.deepEqual(dataset.courses.map(x=>x.id),['course-1']);
  assert.equal(dataset.grades[0].authoritative,false);
  await assert.rejects(()=>source.load({courseId:'forbidden course'}),/HTTP 400/);
});
