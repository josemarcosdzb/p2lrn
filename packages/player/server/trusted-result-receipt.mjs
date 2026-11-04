// Server-only cryptographic receipts for externally verified assessment results.
// Offline learner files are never treated as authoritative grades by default.
import {createPrivateKey,createPublicKey,randomUUID,sign,verify} from 'node:crypto';

export const P2LRN_TRUSTED_RESULT_RECEIPT_SCHEMA='https://p2lrn.org/schema/trusted-result-receipt/1';
function canonical(value){
  if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number'){
    if(!Number.isFinite(value)||Number.isInteger(value)&&!Number.isSafeInteger(value))
      throw new TypeError('Non-finite or unsafe result number.');
    return JSON.stringify(value);
  }
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)
    return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  throw new TypeError('Unsupported trusted receipt field.');
}
const text=(value,max=512)=>typeof value==='string'&&value.trim().length>0&&value.length<=max?value:null;
const root=value=>typeof value==='string'&&/^sha256:[0-9a-f]{64}$/.test(value);
function principal(actor){
  const issuer=text(actor?.issuer,512),subjectId=text(actor?.subjectId??actor?.id,512);
  if(!issuer||!subjectId)throw new TypeError('Verified Host actor is required.');
  return Object.freeze({issuer,subjectId});
}
function evidence(decision){
  if(decision?.verified!==true)
    throw new Error('The Host did not independently verify this assessment.');
  const score=decision.score,maxScore=decision.maxScore;
  if(typeof score!=='number'||typeof maxScore!=='number'||
     !Number.isFinite(score)||!Number.isFinite(maxScore)||
     score<0||maxScore<=0||score>maxScore)
    throw new TypeError('Host assessment score is invalid.');
  const evidenceId=text(decision.evidenceId,512);
  if(!evidenceId)throw new TypeError('Host must identify authoritative evidence.');
  return {score,maxScore,evidenceId};
}
function bodyIsValid(body){
  return body?.schema===P2LRN_TRUSTED_RESULT_RECEIPT_SCHEMA&&body.version==='1'&&
    text(body.receiptId,128)&&text(body.issuedAt,80)&&Number.isFinite(Date.parse(body.issuedAt))&&
    text(body.assignmentId)&&text(body.courseId)&&root(body.contentRoot)&&
    text(body.actor?.issuer)&&text(body.actor?.subjectId)&&
    text(body.evidenceId)&&typeof body.score==='number'&&typeof body.maxScore==='number'&&
    Number.isFinite(body.score)&&Number.isFinite(body.maxScore)&&
    body.score>=0&&body.maxScore>0&&body.score<=body.maxScore;
}

/**
 * A trusted connected Host signs ONLY a grade it recomputed/verified using its
 * OWN authenticated records (LMS DB, supervised attempt, server-side grading).
 * A learner-controlled offline JSON/hash chain is never sufficient evidence.
 * No private key may be bundled into Studio, Player, or an offline assignment.
 */
export function createP2LRNResultAuthority({privateKey,keyId,gradeSubmission}={}){
  if(typeof gradeSubmission!=='function')
    throw new TypeError('Host gradeSubmission callback is required.');
  if(!text(keyId,128))throw new TypeError('A stable signing keyId is required.');
  const key=privateKey?.type==='private'?privateKey:createPrivateKey(privateKey);
  if(key.asymmetricKeyType!=='ed25519')throw new TypeError('Trusted receipt signing key must be Ed25519.');
  return Object.freeze({
    async issue({actor,assignmentId,courseId,contentRoot,submittedResult}={}){
      const verifiedActor=principal(actor);
      if(!text(assignmentId)||!text(courseId)||!root(contentRoot))
        throw new TypeError('Trusted assignment/course bindings are required.');
      // Only the host-side callback may decide the grade. Never copy
      // submittedResult.summary.latestScore or any client-supplied author.
      const grade=evidence(await gradeSubmission(Object.freeze({
        actor:verifiedActor,assignmentId,courseId,contentRoot,submittedResult,
      })));
      const body={
        schema:P2LRN_TRUSTED_RESULT_RECEIPT_SCHEMA,version:'1',
        receiptId:randomUUID(),issuedAt:new Date().toISOString(),
        actor:verifiedActor,assignmentId,courseId,contentRoot,
        score:grade.score,maxScore:grade.maxScore,evidenceId:grade.evidenceId,
      };
      const signature=sign(null,Buffer.from(canonical(body)),key).toString('base64url');
      return {body,signature:{algorithm:'Ed25519',keyId,value:signature}};
    },
  });
}

/** Verify only against a public key independently pinned by the receiving host. */
export function verifyP2LRNTrustedResultReceipt(receipt,{
  publicKey,keyId,actor,assignmentId,courseId,contentRoot,
}={}){
  try{
    // A signature alone is not authorization to credit an arbitrary learner.
    // The receiving LMS must supply the expected actor and course bindings.
    if(!actor||!text(assignmentId)||!text(courseId)||!root(contentRoot))
      return false;
    if(!receipt||!bodyIsValid(receipt.body)||!receipt.signature||
      receipt.signature.algorithm!=='Ed25519'||receipt.signature.keyId!==keyId||
      typeof receipt.signature.value!=='string'||
      !/^[A-Za-z0-9_-]{86}$/.test(receipt.signature.value)||
      !text(keyId,128))return false;
    const key=publicKey?.type==='public'?publicKey:createPublicKey(publicKey);
    if(key.asymmetricKeyType!=='ed25519')return false;
    const body=receipt.body;
    if(actor){
      const expected=principal(actor);
      if(expected.issuer!==body.actor.issuer||expected.subjectId!==body.actor.subjectId)return false;
    }
    if(assignmentId&&assignmentId!==body.assignmentId)return false;
    if(courseId&&courseId!==body.courseId)return false;
    if(contentRoot&&contentRoot!==body.contentRoot)return false;
    return verify(null,Buffer.from(canonical(body)),key,
      Buffer.from(receipt.signature.value,'base64url'));
  }catch{return false;}
}
