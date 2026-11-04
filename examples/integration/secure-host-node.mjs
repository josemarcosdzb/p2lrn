/**
 * P2LRN integration template for a trusted Node/LMS backend.
 *
 * The P2LRN library handles ZIP confinement, JWT verification, collaboration
 * transport checks and signed server receipts. The integrator supplies only
 * its OWN trusted DB/session/enrolment/grade queries. This template never
 * accepts a client-supplied actorId, tenant or authoritative grade.
 *
 * Requires a release containing createP2LRNJwtAuthenticator and
 * createP2LRNResultAuthority (not the already-published alpha.12).
 */
import {
  createP2LRNJwtAuthenticator,
  createP2LRNCollaborationHandler,
  createP2LRNResultAuthority,
  verifyP2LRNTrustedResultReceipt,
} from '@p2lrn/player/server';
import {unpackP2LRNArchive} from '@p2lrn/toolkit/core';

const denied=(message='Not authorized')=>
  Object.assign(new Error(message),{statusCode:403,code:'P2LRN_HOST_DENIED'});

/**
 * repository is supplied by the LMS/host, not by P2LRN:
 *   findEnrollment({actor,packageId,contentRoot,entityId})
 *     => trusted {tenantId,courseId,groupId,packageId,entityId,contentRoot} | null
 *   canUseRoom({actor,context,room,operation}) => boolean
 *   getVerifiedAttempt({actor,attemptId})
 *     => {assignmentId,courseId,contentRoot,submittedResult} | null
 *   gradeFromTrustedEvidence({actor,assignmentId,courseId,contentRoot,submittedResult})
 *     => {verified:true,score,maxScore,evidenceId} (only from trusted records)
 *
 * collaborationService implements join/send/listen/snapshot/leave with
 * durable storage and server-bound session/room membership.
 */
export function createSecureP2LRNHost({
  issuer,audience,jwksUri,jwtAlgorithms=['RS256'],allowedOrigins,repository,collaborationService,
  signingPrivateKey,signingPublicKey,signingKeyId,
}={}){
  if(!repository||!collaborationService)throw new TypeError('Trusted Host adapters are required.');
  const authenticate=createP2LRNJwtAuthenticator({
    issuer,audience,jwksUri,allowedAlgorithms:jwtAlgorithms,
  });

  const collaboration=createP2LRNCollaborationHandler({
    allowedOrigins,
    authenticate,
    async resolveContext({actor,clientContext}){
      // Untrusted portable identifiers are lookup hints, not access claims.
      const packageId=clientContext.packageId,contentRoot=clientContext.contentRoot,
        entityId=clientContext.entityId;
      if(typeof packageId!=='string'||packageId.length<1||packageId.length>512||
        typeof entityId!=='string'||entityId.length<1||entityId.length>512||
        typeof contentRoot!=='string'||!/^sha256:[0-9a-f]{64}$/.test(contentRoot))
        throw denied('Invalid portable course context.');
      const entry=await repository.findEnrollment({actor,packageId,contentRoot,entityId});
      if(!entry||entry.packageId!==packageId||entry.entityId!==entityId||
        entry.contentRoot!==contentRoot||
        !entry.tenantId||!entry.courseId||!entry.groupId)
        throw denied('Course membership missing.');
      return Object.freeze({
        tenantId:entry.tenantId,courseId:entry.courseId,groupId:entry.groupId,
        entityId:entry.entityId,contentRoot:entry.contentRoot,
      });
    },
    async authorize({actor,operation,input,context}){
      return Boolean(await repository.canUseRoom({
        actor,operation,context,room:input.room??null,
      }));
    },
    service:collaborationService,
  });
  const authority=createP2LRNResultAuthority({
    privateKey:signingPrivateKey,keyId:signingKeyId,
    gradeSubmission:context=>repository.gradeFromTrustedEvidence(context),
  });

  async function issueConnectedReceipt({request,attemptId}){
    // The Host resolves both actor and attempt from its own database.
    // NEVER take course/grade/actor from the request body.
    const actor=await authenticate(request);
    if(!actor)throw denied('Missing authenticated session.');
    if(typeof attemptId!=='string'||!/^[a-zA-Z0-9:._-]{1,128}$/.test(attemptId))
      throw denied('Invalid attempt reference.');
    const attempt=await repository.getVerifiedAttempt({actor,attemptId});
    if(!attempt)throw denied('Attempt not found for this learner.');
    return authority.issue({
      actor,assignmentId:attempt.assignmentId,courseId:attempt.courseId,
      contentRoot:attempt.contentRoot,submittedResult:attempt.submittedResult,
    });
  }
  function checkConnectedReceipt(receipt,expected){
    return verifyP2LRNTrustedResultReceipt(receipt,{
      publicKey:signingPublicKey,keyId:signingKeyId,...expected,
    });
  }
  return Object.freeze({
    collaboration,authenticate,issueConnectedReceipt,
    checkConnectedReceipt,
    unpackCourse:unpackP2LRNArchive,
  });
}
