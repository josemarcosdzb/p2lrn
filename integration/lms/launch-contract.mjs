// Shared contract for P2LRN links in any LMS, independent of vendor.
// Only pass claims AFTER the server has verified JWT/OIDC state and nonce.
// This module does not perform cryptography for LTI authentication.
import {createHash,randomBytes} from 'node:crypto';

export const LTI_CLAIMS=Object.freeze({
  version:'https://purl.imsglobal.org/spec/lti/claim/version',
  messageType:'https://purl.imsglobal.org/spec/lti/claim/message_type',
  deploymentId:'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
  targetLinkUri:'https://purl.imsglobal.org/spec/lti/claim/target_link_uri',
  resourceLink:'https://purl.imsglobal.org/spec/lti/claim/resource_link',
  context:'https://purl.imsglobal.org/spec/lti/claim/context',
  roles:'https://purl.imsglobal.org/spec/lti/claim/roles',
  custom:'https://purl.imsglobal.org/spec/lti/claim/custom'
});
const obj=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const str=(value,label)=>{
  if(typeof value!=='string'||!value.trim()||value.length>2048)
    throw new TypeError(label+' must be a non-empty string up to 2048 characters');
  return value;
};
const hash=items=>createHash('sha256').update(JSON.stringify(items)).digest('hex');
const bindingPattern=/^[A-Za-z0-9_-]{32,128}$/;
const rootPattern=/^sha256:[0-9a-f]{64}$/;

function httpsUrl(value,label,allowInsecureLocal=false){
  const text=str(value,label);
  let parsed;
  try{parsed=new URL(text);}catch{throw new TypeError(label+' must be an HTTPS URL');}
  if(!(parsed.protocol==='https:'||(allowInsecureLocal&&parsed.protocol==='http:'&&/^(localhost|127\.0\.0\.1|[a-z0-9-]+\.localhost)$/.test(parsed.hostname)))||!parsed.hostname||parsed.username||parsed.password||parsed.hash)
    throw new TypeError(label+' must be an HTTPS URL without embedded credentials or fragment');
  return parsed.href;
}
function publishedBinding(value){
  const b=obj(value);
  const id=str(b.id,'binding.id');
  if(!bindingPattern.test(id))throw new TypeError('binding.id must be an opaque random identifier');
  if(b.status!=='PUBLISHED')throw new Error('Only explicitly published P2LRN content may be launched');
  const contentRoot=str(b.contentRoot,'binding.contentRoot');
  if(!rootPattern.test(contentRoot))throw new TypeError('Invalid P2LRN contentRoot');
  return Object.freeze({
    id,tenantId:str(b.tenantId,'binding.tenantId'),
    registrationId:str(b.registrationId,'binding.registrationId'),
    deploymentId:str(b.deploymentId,'binding.deploymentId'),
    packageId:str(b.packageId,'binding.packageId'),
    contentRoot,entityId:str(b.entityId,'binding.entityId'),status:'PUBLISHED'
  });
}
// Stable on copy: the LMS resource_link.id is NOT a durable content ID.
export function issueP2LRNBindingId(){
  return randomBytes(24).toString('base64url');
}
export function createP2LRNDeepLinkItem({binding,title,launchUrl,allowInsecureLocal=false}){
  const b=publishedBinding(binding);
  const name=str(title,'title');
  if(name.length>200)throw new TypeError('Deep Linking title is too long');
  return Object.freeze({
    type:'ltiResourceLink',title:name,
    url:httpsUrl(launchUrl,'launchUrl',allowInsecureLocal),
    custom:Object.freeze({p2lrn_binding_id:b.id})
  });
}
// SERVER-ONLY projection, not OIDC/JWT authentication.
// The verified envelope must be constructed by the trusted LTI verifier,
// never accepted from user input or a browser API.
export function projectVerifiedLtiResourceLaunch({verified,registration,binding,allowInsecureLocal=false}){
  if(verified?.verifier!=='server-verified-lti-1.3')
    throw new Error('LTI authentication must precede P2LRN launch mapping');
  const claims=obj(verified.claims);
  const reg=obj(registration);
  const b=publishedBinding(binding);
  const registrationId=str(reg.id,'registration.id');
  const tenantId=str(reg.tenantId,'registration.tenantId');
  const issuer=str(reg.issuer,'registration.issuer');
  const clientId=str(reg.clientId,'registration.clientId');
  const deploymentId=str(reg.deploymentId,'registration.deploymentId');
  const launchUrl=httpsUrl(reg.launchUrl,'registration.launchUrl',allowInsecureLocal);
  if(claims.iss!==issuer)throw new Error('Unexpected LTI issuer');
  const audiences=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  if(!audiences.includes(clientId))throw new Error('Unexpected LTI audience');
  if((audiences.length>1||claims.azp!==undefined)&&claims.azp!==clientId)
    throw new Error('Unexpected LTI authorized party');
  if(claims[LTI_CLAIMS.version]!=='1.3.0')throw new Error('Unsupported LTI version');
  if(claims[LTI_CLAIMS.messageType]!=='LtiResourceLinkRequest')
    throw new Error('Only resource launches can open a P2LRN lesson');
  if(claims[LTI_CLAIMS.deploymentId]!==deploymentId)throw new Error('Unexpected LTI deployment');
  if(claims[LTI_CLAIMS.targetLinkUri]!==launchUrl)
    throw new Error('Signed LTI target_link_uri does not match registration');
  const bindingId=obj(claims[LTI_CLAIMS.custom]).p2lrn_binding_id;
  if(bindingId!==b.id||b.registrationId!==registrationId||
     b.tenantId!==tenantId||b.deploymentId!==deploymentId)
    throw new Error('Unrecognized or cross-tenant content binding');
  const subject=str(claims.sub,'LTI sub');
  const resourceLinkId=str(obj(claims[LTI_CLAIMS.resourceLink]).id,'LTI resource_link.id');
  const contextId=obj(claims[LTI_CLAIMS.context]).id;
  if(contextId!==undefined)str(contextId,'LTI context.id');
  const roles=claims[LTI_CLAIMS.roles];
  if(!Array.isArray(roles)||!roles.every(r=>typeof r==='string'&&r.length>0&&r.length<500))
    throw new TypeError('LTI roles must be an array of role URIs');
  return Object.freeze({
    tenantId,registrationId,deploymentId,issuer,clientId,
    bindingId:b.id,packageId:b.packageId,contentRoot:b.contentRoot,entityId:b.entityId,
    platformSubject:subject,learnerKey:hash([issuer,clientId,deploymentId,subject]),
    contextId:contextId??null,resourceLinkId,roles:Object.freeze([...roles])
  });
}
// State is scoped by learner, attempt, content revision and activity surface.
// Server must also check graph membership and active session permissions.
export function createP2LRNStateKey({launch,attemptId,context}){
  const l=obj(launch),c=obj(context);
  if(c.packageId!==l.packageId||c.contentRoot!==l.contentRoot)
    throw new Error('Player context does not match session package and contentRoot');
  const surface=c.profile||c.rendererId||c.runtime||'package';
  return hash([
    str(l.tenantId,'tenantId'),str(l.registrationId,'registrationId'),
    str(l.deploymentId,'deploymentId'),str(l.bindingId,'bindingId'),
    str(l.learnerKey,'learnerKey'),str(attemptId,'attemptId'),
    str(l.packageId,'packageId'),str(l.contentRoot,'contentRoot'),
    str(c.entityId,'entityId'),str(surface,'surface')
  ]);
}
// Produces an AGS score object only. It never sends network requests.
// Call only after a server-authoritative assessment decision.
export function draftAuthoritativeAgsScore({launch,assessment,timestamp}){
  const l=obj(launch),a=obj(assessment);
  if(a.authority!=='server-validated')throw new Error('Browser scores are not authoritative');
  const n=a.normalized,max=a.scoreMaximum;
  if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)
    throw new TypeError('normalized score must be between 0 and 1');
  if(typeof max!=='number'||!Number.isFinite(max)||max<=0||max>100000)
    throw new TypeError('scoreMaximum must be a positive finite number');
  const date=new Date(timestamp);
  if(!timestamp||Number.isNaN(date.getTime()))throw new TypeError('Invalid AGS score timestamp');
  return Object.freeze({
    userId:str(l.platformSubject,'platformSubject'),
    scoreGiven:Math.round(n*max*1e6)/1e6,
    scoreMaximum:max,
    activityProgress:a.completed===true?'Completed':'InProgress',
    gradingProgress:'FullyGraded',
    timestamp:date.toISOString()
  });
}
