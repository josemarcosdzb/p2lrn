import test from 'node:test';
import assert from 'node:assert/strict';
import {
 LTI_CLAIMS,issueP2LRNBindingId,createP2LRNDeepLinkItem,
 projectVerifiedLtiResourceLaunch,createP2LRNStateKey,draftAuthoritativeAgsScore
} from './launch-contract.mjs';
import {createP2LRNLmsHostAdapter} from './host-adapter.mjs';
const root='sha256:'+'a'.repeat(64);
const launchUrl='https://p2lrn.example.org/lti/launch';
function fixture(platform='moodle'){
 const binding={id:issueP2LRNBindingId(),tenantId:'campus-a',registrationId:'reg-'+platform,
  deploymentId:'deployment-1',packageId:'urn:uuid:course-1',contentRoot:root,
  entityId:'urn:uuid:activity-1',status:'PUBLISHED'};
 const registration={id:binding.registrationId,tenantId:binding.tenantId,issuer:'https://lms.example.org',
  clientId:'p2lrn-client',deploymentId:binding.deploymentId,launchUrl};
 const claims={
  iss:registration.issuer,aud:registration.clientId,sub:'user-opaque',
  [LTI_CLAIMS.version]:'1.3.0',[LTI_CLAIMS.messageType]:'LtiResourceLinkRequest',
  [LTI_CLAIMS.deploymentId]:registration.deploymentId,[LTI_CLAIMS.targetLinkUri]:launchUrl,
  [LTI_CLAIMS.resourceLink]:{id:'activity-original'},[LTI_CLAIMS.context]:{id:'course-1'},
  [LTI_CLAIMS.custom]:{p2lrn_binding_id:binding.id},
  [LTI_CLAIMS.roles]:['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner']
 };
 return {verified:{verifier:'server-verified-lti-1.3',claims},registration,binding};
}
test('same resource launch contract covers five LMS and a separate application host without vendor branches',()=>{
 for(const vendor of ['moodle','canvas','sakai','chamilo','open-edx','host-application']){
  const f=fixture(vendor),launch=projectVerifiedLtiResourceLaunch(f);
  assert.equal(launch.registrationId,'reg-'+vendor);
  assert.equal(launch.packageId,'urn:uuid:course-1');
  assert.equal(launch.contentRoot,root);
  assert.equal(launch.platformSubject,'user-opaque');
 }
});
test('Deep Linking is copied without binding to resource_link.id',()=>{
 const f=fixture();
 const item=createP2LRNDeepLinkItem({binding:f.binding,title:'Lección HTML',launchUrl});
 assert.equal(item.type,'ltiResourceLink');
 assert.deepEqual(item.custom,{p2lrn_binding_id:f.binding.id});
 assert(!JSON.stringify(item).includes('activity-original'));
 const original=projectVerifiedLtiResourceLaunch(f);
 f.verified.claims[LTI_CLAIMS.resourceLink].id='activity-after-course-copy';
 const copied=projectVerifiedLtiResourceLaunch(f);
 assert.equal(copied.bindingId,original.bindingId);
 assert.equal(copied.contentRoot,original.contentRoot);
 assert.notEqual(copied.resourceLinkId,original.resourceLinkId);
});
test('LTI mapping rejects issuer/audience/azp/tenant/deployment/target mismatches',()=>{
 function wrong(change,pattern){const f=fixture();change(f);assert.throws(()=>projectVerifiedLtiResourceLaunch(f),pattern);}
 wrong(f=>{f.verified={claims:f.verified.claims};},/authentication/);
 wrong(f=>{f.verified.claims.iss='https://other.example';},/issuer/);
 wrong(f=>{f.verified.claims.aud='other-client';},/audience/);
 wrong(f=>{f.verified.claims.aud=['p2lrn-client','other-client'];},/authorized party/);
 wrong(f=>{f.verified.claims.azp='other-client';},/authorized party/);
 wrong(f=>{f.verified.claims[LTI_CLAIMS.deploymentId]='other-deployment';},/deployment/);
 wrong(f=>{f.verified.claims[LTI_CLAIMS.targetLinkUri]='https://wrong.example/lti/launch';},/target_link_uri/);
 wrong(f=>{f.verified.claims[LTI_CLAIMS.custom].p2lrn_binding_id='other';},/binding/);
 wrong(f=>{f.binding.tenantId='another-campus';},/binding/);
 wrong(f=>{f.binding.deploymentId='another-deployment';},/binding/);
 wrong(f=>{f.binding.status='DRAFT';},/published/);
 wrong(f=>{f.verified.claims[LTI_CLAIMS.messageType]='LtiDeepLinkingRequest';},/resource launches/);
 wrong(f=>{f.verified.claims[LTI_CLAIMS.roles]='Learner';},/roles/);
});
test('activity state is isolated by learner, attempt, revision, entity and renderer',()=>{
 const launch=projectVerifiedLtiResourceLaunch(fixture());
 const context={packageId:launch.packageId,contentRoot:launch.contentRoot,entityId:launch.entityId,rendererId:'quiz'};
 const key=createP2LRNStateKey({launch,attemptId:'attempt-1',context});
 assert.match(key,/^[a-f0-9]{64}$/);
 assert.equal(key,createP2LRNStateKey({launch,attemptId:'attempt-1',context}));
 assert.notEqual(key,createP2LRNStateKey({launch,attemptId:'attempt-2',context}));
 assert.notEqual(key,createP2LRNStateKey({launch,attemptId:'attempt-1',context:{...context,entityId:'other'}}));
 assert.notEqual(key,createP2LRNStateKey({launch,attemptId:'attempt-1',context:{...context,rendererId:'scorm'}}));
 assert.notEqual(key,createP2LRNStateKey({launch:{...launch,learnerKey:'other'},attemptId:'attempt-1',context}));
 assert.throws(()=>createP2LRNStateKey({launch,attemptId:'attempt-1',context:{...context,contentRoot:'sha256:'+'b'.repeat(64)}}),/does not match/);
});
test('AGS output is a server-only draft and rejects unverified/invalid scores',()=>{
 const launch=projectVerifiedLtiResourceLaunch(fixture());
 const args={launch,assessment:{authority:'server-validated',normalized:0.825,scoreMaximum:100,completed:true},timestamp:'2026-10-26T10:00:00Z'};
 const score=draftAuthoritativeAgsScore(args);
 assert.equal(score.userId,'user-opaque');
 assert.equal(score.scoreGiven,82.5);
 assert.equal(score.activityProgress,'Completed');
 assert.equal(score.gradingProgress,'FullyGraded');
 assert.throws(()=>draftAuthoritativeAgsScore({...args,assessment:{...args.assessment,authority:'browser'}}),/not authoritative/);
 assert.throws(()=>draftAuthoritativeAgsScore({...args,assessment:{...args.assessment,normalized:1.2}}),/between 0 and 1/);
 assert.throws(()=>draftAuthoritativeAgsScore({...args,assessment:{...args.assessment,scoreMaximum:0}}),/positive/);
});
test('the same browser Host Adapter sends five operations, never trusted grades',async()=>{
 for(const vendor of ['Moodle','Canvas','Sakai','Chamilo','Open edX','AulaP2P']){
  const observed=[];
  const gateway={
   async loadState(args){observed.push(['load',args]);return {attempt:1};},
   async saveState(args){observed.push(['save',args]);},
   async recordClientScore(args){observed.push(['score',args]);},
   async appendClientEvent(args){observed.push(['event',args]);},
   async resolveResourceUrl(args){observed.push(['resource',args]);return {url:'https://assets.example.org/image',verified:true};}
  };
  const session={sessionRef:'session-opaque',packageId:'urn:uuid:course-1',contentRoot:root};
  const context={packageId:session.packageId,contentRoot:root,entityId:'activity-1',rendererId:'quiz'};
  const adapter=createP2LRNLmsHostAdapter({session,gateway});
  assert.equal(adapter.version,'1',vendor);
  assert.deepEqual(await adapter.loadState(context),{attempt:1});
  await adapter.saveState({answers:['A']},context);
  await adapter.reportScore({normalized:0.5},context);
  await adapter.emitEvent({type:'p2lrn:complete'},context);
  assert.equal((await adapter.resolveResourceUrl({path:'image.png'},context)).verified,true);
  assert.deepEqual(observed.map(x=>x[0]),['load','save','score','event','resource'],vendor);
  assert.equal(observed[2][1].authoritative,false);
  assert.equal(observed[3][1].authoritative,false);
  assert(observed.every(x=>x[1].sessionRef==='session-opaque'));
 }
});
test('Host Adapter blocks mismatched package or revision before hitting the LMS API',async()=>{
 let count=0;
 const gateway=Object.fromEntries(['loadState','saveState','recordClientScore','appendClientEvent','resolveResourceUrl'].map(x=>[x,async()=>{count++;}]));
 const session={sessionRef:'opaque-session',packageId:'course-one',contentRoot:root};
 const adapter=createP2LRNLmsHostAdapter({session,gateway});
 await assert.rejects(adapter.loadState({packageId:'course-one',contentRoot:'sha256:'+'b'.repeat(64),entityId:'a'}),/do not match/);
 await assert.rejects(adapter.reportScore({normalized:0.5},{packageId:'course-two',contentRoot:root,entityId:'a'}),/do not match/);
 assert.equal(count,0);
 assert.throws(()=>createP2LRNLmsHostAdapter({session,gateway:{}}),/missing loadState/);
});
