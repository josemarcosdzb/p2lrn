import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {
  createP2LRNResultAuthority,
  verifyP2LRNTrustedResultReceipt,
  verifyAndRedeemP2LRNTrustedResultReceipt,
} from '../server/trusted-result-receipt.mjs';

const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const {publicKey:otherPublic}=generateKeyPairSync('ed25519');
const actor={issuer:'https://academy.example',subjectId:'student-123'};
const params={actor,courseId:'urn:course:test',assignmentId:'assignment-123',contentRoot:'sha256:'+'a'.repeat(64),
  submittedResult:{summary:{latestScore:999}}};

test('only a host independently verified grade is signed, ignoring learner supplied scores',async()=>{
  let calls=0;
  const authority=createP2LRNResultAuthority({
    privateKey,keyId:'school-2026',
    gradeSubmission:async({actor,courseId,submittedResult})=>{
      calls+=1;
      assert.equal(actor.subjectId,'student-123');
      assert.equal(courseId,'urn:course:test');
      assert.equal(submittedResult.summary.latestScore,999);
      return {verified:true,score:7,maxScore:10,evidenceId:'db-attempt-42'};
    },
  });
  const receipt=await authority.issue(params);
  assert.equal(calls,1);
  assert.equal(receipt.body.score,7);
  assert.equal(receipt.body.maxScore,10);
  assert.equal(receipt.body.evidenceId,'db-attempt-42');
  const expected={publicKey,keyId:'school-2026',actor,courseId:params.courseId,
    assignmentId:params.assignmentId,contentRoot:params.contentRoot};
  assert.equal(verifyP2LRNTrustedResultReceipt(receipt,expected),true);
  assert.equal(verifyP2LRNTrustedResultReceipt(receipt,{publicKey,keyId:'school-2026'}),false,
    'Receiver must bind an authenticated learner and assignment');
  for(const change of [
    r=>{r.body.score=10;},
    r=>{r.body.actor.subjectId='admin';},
    r=>{r.body.contentRoot='sha256:'+'b'.repeat(64);},
    r=>{r.signature.value='A'.repeat(86);},
  ]){
    const forged=structuredClone(receipt);change(forged);
    assert.equal(verifyP2LRNTrustedResultReceipt(forged,expected),false);
  }
  assert.equal(verifyP2LRNTrustedResultReceipt(receipt,{...expected,publicKey:otherPublic}),false);
  assert.equal(verifyP2LRNTrustedResultReceipt(receipt,{...expected,keyId:'wrong'}),false);
  assert.equal(verifyP2LRNTrustedResultReceipt(receipt,{...expected,actor:{issuer:actor.issuer,subjectId:'somebody-else'}}),false);
});
test('offline evidence by itself is not sufficient to issue an authoritative receipt',async()=>{
  const authority=createP2LRNResultAuthority({privateKey,keyId:'school-2026',
    gradeSubmission:async()=>({verified:false,score:100,maxScore:100,evidenceId:'untrusted-file'})});
  await assert.rejects(authority.issue(params),/did not independently verify/);
  const missingEvidence=createP2LRNResultAuthority({privateKey,keyId:'school-2026',
    gradeSubmission:async()=>({verified:true,score:9,maxScore:10})});
  await assert.rejects(missingEvidence.issue(params),/authoritative evidence/);
  const invalidScore=createP2LRNResultAuthority({privateKey,keyId:'school-2026',
    gradeSubmission:async()=>({verified:true,score:12,maxScore:10,evidenceId:'db-attempt-42'})});
  await assert.rejects(invalidScore.issue(params),/score is invalid/);
});

test('trusted result receipts are valid only once and within the Host validity window',async()=>{
  const authority=createP2LRNResultAuthority({
    privateKey,keyId:'school-2026',
    gradeSubmission:async()=>({verified:true,score:8,maxScore:10,evidenceId:'db-attempt-replay'}),
  });
  const receipt=await authority.issue(params);
  const used=new Set();
  const consumeReceiptId=async({receiptId,assignmentId,actor})=>{
    assert.equal(assignmentId,params.assignmentId);
    assert.equal(actor.subjectId,params.actor.subjectId);
    if(used.has(receiptId))return false;
    used.add(receiptId);
    return true;
  };
  const options={
    publicKey,keyId:'school-2026',actor,courseId:params.courseId,
    assignmentId:params.assignmentId,contentRoot:params.contentRoot,consumeReceiptId,
    now:()=>Date.parse(receipt.body.issuedAt)+1000,
  };
  await assert.rejects(verifyAndRedeemP2LRNTrustedResultReceipt(receipt,{
    ...options,consumeReceiptId:undefined,
  }),/atomic durable/);
  const first=await verifyAndRedeemP2LRNTrustedResultReceipt(receipt,options);
  assert.equal(first.accepted,true);
  assert.equal(first.score,8);
  const again=await verifyAndRedeemP2LRNTrustedResultReceipt(receipt,options);
  assert.deepEqual(again,{accepted:false,reason:'REPLAY_OR_REDEMPTION_DENIED'});
  const forged=structuredClone(receipt);
  forged.body.score=10;
  assert.deepEqual(await verifyAndRedeemP2LRNTrustedResultReceipt(forged,options),
    {accepted:false,reason:'INVALID_OR_UNBOUND_RECEIPT'});
  const otherLearner=await verifyAndRedeemP2LRNTrustedResultReceipt(receipt,{
    ...options,actor:{issuer:actor.issuer,subjectId:'different-student'},
  });
  assert.equal(otherLearner.accepted,false);
  const expired=await verifyAndRedeemP2LRNTrustedResultReceipt(receipt,{
    ...options,now:()=>Date.parse(receipt.body.issuedAt)+40*24*60*60*1000,
  });
  assert.deepEqual(expired,{accepted:false,reason:'EXPIRED_OR_FUTURE_RECEIPT'});
});
