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
  if(!input||typeof input!=='object')throw new TypeError('xAPI activity declaration is required.');
  const result:P2LRNXapiActivityDeclaration={version:XAPI_VERSION,activityId:iri(input.activityId,'xAPI activityId')};
  if(input.profileId!=null)result.profileId=iri(input.profileId,'xAPI profileId');
  if(input.verbs){
    const verbs:Record<string,string>={};
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
  if(input.version!==XAPI_VERSION)throw new TypeError(`xAPI activity declaration version must be ${XAPI_VERSION}.`);
  return createXapiActivityDeclaration({
    activityId:String(input.activityId??''),
    profileId:input.profileId==null?undefined:String(input.profileId),
    verbs:input.verbs&&typeof input.verbs==='object'&&!Array.isArray(input.verbs)?input.verbs as XapiActivityDeclarationInput['verbs']:undefined,
  });
}
