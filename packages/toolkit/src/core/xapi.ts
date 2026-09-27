export const XAPI_PROFILE='https://p2lrn.org/profile/xapi' as const;
export const XAPI_VERSION='2.0' as const;

export interface XapiActivityDeclarationInput {
  activityId:string;
  profileId?:string;
  verbs?:Partial<Record<'initialized'|'answered'|'scored'|'completed',string>>;
}
export interface P2LRNXapiActivityDeclaration {
  version:typeof XAPI_VERSION;
  activityId:string;
  profileId?:string;
  verbs?:Partial<Record<'initialized'|'answered'|'scored'|'completed',string>>;
}

function iri(value:unknown,label:string):string{
  const text=String(value??'').trim();
  if(!text)throw new TypeError(`${label} is required.`);
  let url:URL;try{url=new URL(text);}catch{throw new TypeError(`${label} must be an absolute IRI.`);}
  if(['http:','https:'].includes(url.protocol)&&(url.username||url.password))throw new TypeError(`${label} must not contain embedded credentials.`);
  return text;
}
export function createXapiActivityDeclaration(input:XapiActivityDeclarationInput):P2LRNXapiActivityDeclaration{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('xAPI activity declaration is required.');
  const allowed=new Set(['activityId','profileId','verbs']);
  for(const key of Object.keys(input as Record<string,unknown>))if(!allowed.has(key))throw new TypeError(`Unsupported xAPI activity declaration field: ${key}`);
  const result:P2LRNXapiActivityDeclaration={version:XAPI_VERSION,activityId:iri(input.activityId,'xAPI activityId')};
  if(input.profileId!=null)result.profileId=iri(input.profileId,'xAPI profileId');
  if(input.verbs){
    const allowedVerbs=new Set(['initialized','answered','scored','completed']);
    for(const key of Object.keys(input.verbs as Record<string,unknown>))if(!allowedVerbs.has(key))throw new TypeError(`Unsupported xAPI verb override key: ${key}`);
    const verbs:NonNullable<P2LRNXapiActivityDeclaration['verbs']>={};
    for(const key of ['initialized','answered','scored','completed'] as const){
      const value=input.verbs[key];if(value!=null)verbs[key]=iri(value,`xAPI verb ${key}`);
    }
    if(Object.keys(verbs).length)result.verbs=verbs;
  }
  return Object.freeze(result);
}
export function validateXapiActivityDeclaration(value:unknown):P2LRNXapiActivityDeclaration{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('xAPI activity declaration must be an object.');
  const input=value as Record<string,unknown>;
  const allowed=new Set(['version','activityId','profileId','verbs']);
  for(const key of Object.keys(input))if(!allowed.has(key))throw new TypeError(`Unsupported xAPI activity declaration field: ${key}`);
  if(input.version!==XAPI_VERSION)throw new TypeError(`xAPI activity declaration version must be ${XAPI_VERSION}.`);
  if(input.verbs!==undefined&&(!input.verbs||typeof input.verbs!=='object'||Array.isArray(input.verbs)))throw new TypeError('xAPI verbs must be an object.');
  return createXapiActivityDeclaration({
    activityId:String(input.activityId??''),
    profileId:input.profileId==null?undefined:String(input.profileId),
    verbs:input.verbs&&typeof input.verbs==='object'&&!Array.isArray(input.verbs)?input.verbs as XapiActivityDeclarationInput['verbs']:undefined,
  });
}
