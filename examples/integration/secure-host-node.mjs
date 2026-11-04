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
 *     => trusted {tenantId,courseId,groupId,entityId,contentRoot} | null
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
      // These client identifiers are lookup keys only, never trusted ACLs.
      const entry=await repository.findEnrollment({
        actor,
        packageId:clientContext.packageId,
        contentRoot:clientContext.contentRoot,
        entityId:clientContext.entityId,
      });
      if(!entry||entry.contentRoot!==clientContext.contentRoot)
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
