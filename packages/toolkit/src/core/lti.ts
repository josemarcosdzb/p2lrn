export const LTI_PROFILE='https://p2lrn.org/profile/lti' as const;

const FORBIDDEN_KEY=/(?:^|[_-])(secret|clientsecret|client_secret|privatekey|private_key|access[_-]?token|refresh[_-]?token|consumer[_-]?secret|oauth[_-]?consumer[_-]?secret|authorization)(?:$|[_-])/i;

export interface LtiPortableIntentInput {
  targetLinkUri:string;
  sourceStandard?:string;
  sourceVersion?:string;
  descriptorMember?:string;
  title?:string;
  description?:string;
  rebindRequired?:boolean;
  migrationTarget?:string;
  [key:string]:unknown;
}
export interface P2LRNLtiPortableIntent extends LtiPortableIntentInput {
  targetLinkUri:string;
}

function httpUrl(value:unknown,label:string):string{
  const text=String(value??'').trim();
  if(!text)throw new TypeError(`${label} is required.`);
  let url:URL;try{url=new URL(text);}catch{throw new TypeError(`${label} must be an absolute URL.`);}
  if(!['http:','https:'].includes(url.protocol))throw new TypeError(`${label} must use HTTP(S).`);
  if(url.username||url.password)throw new TypeError(`${label} must not contain embedded credentials.`);
  return url.href;
}
function rejectSecrets(value:unknown,path='lti'):void{
  if(value==null)return;
  if(Array.isArray(value)){value.forEach((item,index)=>rejectSecrets(item,`${path}[${index}]`));return;}
  if(typeof value!=='object')return;
  for(const [key,item] of Object.entries(value as Record<string,unknown>)){
    const compact=key.replace(/[^A-Za-z0-9_-]/g,'');
    if(FORBIDDEN_KEY.test(key)||FORBIDDEN_KEY.test(compact))throw new TypeError(`LTI portable intent must not contain credential field: ${path}.${key}`);
    rejectSecrets(item,`${path}.${key}`);
  }
}
function optionalText(value:unknown,label:string,max=10000):string|undefined{
  if(value==null)return undefined;
  const text=String(value).trim();if(!text)throw new TypeError(`${label} must not be empty.`);
  if(text.length>max)throw new TypeError(`${label} exceeds ${max} characters.`);
  return text;
}
export function validateLtiPortableIntent(value:unknown):P2LRNLtiPortableIntent{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('LTI portable intent must be an object.');
  rejectSecrets(value);
  const input=value as Record<string,unknown>;
  const result:P2LRNLtiPortableIntent={targetLinkUri:httpUrl(input.targetLinkUri??input.launchUrl,'LTI targetLinkUri')};
  for(const key of ['sourceStandard','sourceVersion','descriptorMember','title','description','migrationTarget'] as const){
    const text=optionalText(input[key],`LTI ${key}`);if(text)(result as any)[key]=text;
  }
  if(input.rebindRequired!==undefined){
    if(typeof input.rebindRequired!=='boolean')throw new TypeError('LTI rebindRequired must be boolean.');
    result.rebindRequired=input.rebindRequired;
  }
  if(input.launchUrl!==undefined){
    const launch=httpUrl(input.launchUrl,'LTI launchUrl');
    if(launch!==result.targetLinkUri)throw new TypeError('LTI launchUrl and targetLinkUri must identify the same portable target.');
    (result as any).launchUrl=launch;
  }
  return Object.freeze(result);
}
