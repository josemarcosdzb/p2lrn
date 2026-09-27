export const CASE_PROFILE='https://p2lrn.org/profile/case' as const;
export const CASE_VERSION='1.1' as const;
export const CASE_ALIGNMENT_TYPES=Object.freeze(['CFItem','CFRubric','CFRubricCriterion','CFRubricCriterionLevel'] as const);
export type CaseAlignmentTargetType=(typeof CASE_ALIGNMENT_TYPES)[number];

export interface CaseAlignmentInput {
  targetUrl:string;
  targetType?:CaseAlignmentTargetType;
  targetCode?:string;
  targetFramework?:string;
  targetName?:string;
  frameworkUrl?:string;
  sourceIdentifier?:string;
}
export interface P2LRNCaseAlignment {
  type:'Alignment';
  targetType:CaseAlignmentTargetType;
  targetUrl:string;
  targetCode?:string;
  targetFramework?:string;
  targetName?:string;
  extensions:{
    [CASE_PROFILE]:{
      version:typeof CASE_VERSION;
      frameworkUrl?:string;
      sourceIdentifier?:string;
    };
  };
}

function nonEmpty(value:unknown,max:number,label:string):string|undefined{
  if(value==null)return undefined;
  const text=String(value).trim();
  if(!text)throw new TypeError(`${label} must not be empty.`);
  if(text.length>max)throw new TypeError(`${label} exceeds ${max} characters.`);
  return text;
}
function absoluteHttpUrl(value:unknown,label:string):string{
  const text=nonEmpty(value,4096,label)!;
  let url:URL;try{url=new URL(text);}catch{throw new TypeError(`${label} must be an absolute URL.`);}
  if(!['http:','https:'].includes(url.protocol))throw new TypeError(`${label} must use HTTP(S).`);
  if(url.username||url.password)throw new TypeError(`${label} must not contain embedded credentials.`);
  url.hash='';
  return url.href;
}
function targetType(value:unknown):CaseAlignmentTargetType{
  const normalized=String(value??'CFItem') as CaseAlignmentTargetType;
  if(!(CASE_ALIGNMENT_TYPES as readonly string[]).includes(normalized))throw new TypeError(`Unsupported CASE alignment targetType: ${normalized}`);
  return normalized;
}

export function createCaseAlignment(input:CaseAlignmentInput):P2LRNCaseAlignment{
  if(!input||typeof input!=='object')throw new TypeError('CASE alignment input is required.');
  const targetUrl=absoluteHttpUrl(input.targetUrl,'CASE targetUrl');
  const frameworkUrl=input.frameworkUrl==null?undefined:absoluteHttpUrl(input.frameworkUrl,'CASE frameworkUrl');
  const result:P2LRNCaseAlignment={
    type:'Alignment',
    targetType:targetType(input.targetType),
    targetUrl,
    extensions:{[CASE_PROFILE]:{version:CASE_VERSION}},
  };
  const targetCode=nonEmpty(input.targetCode,512,'CASE targetCode');
  const targetFramework=nonEmpty(input.targetFramework,1000,'CASE targetFramework');
  const targetName=nonEmpty(input.targetName,5000,'CASE targetName');
  const sourceIdentifier=nonEmpty(input.sourceIdentifier,512,'CASE sourceIdentifier');
  if(targetCode)result.targetCode=targetCode;
  if(targetFramework)result.targetFramework=targetFramework;
  if(targetName)result.targetName=targetName;
  if(frameworkUrl)result.extensions[CASE_PROFILE].frameworkUrl=frameworkUrl;
  if(sourceIdentifier)result.extensions[CASE_PROFILE].sourceIdentifier=sourceIdentifier;
  return Object.freeze(result);
}

export function validateCaseAlignment(value:unknown):P2LRNCaseAlignment{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('CASE alignment must be an object.');
  const item=value as Record<string,unknown>;
  if(item.type!=='Alignment')throw new TypeError('CASE alignment type must be Alignment.');
  const ext=item.extensions&&typeof item.extensions==='object'&&!Array.isArray(item.extensions)?item.extensions as Record<string,unknown>:{};
  const caseExt=ext[CASE_PROFILE]&&typeof ext[CASE_PROFILE]==='object'&&!Array.isArray(ext[CASE_PROFILE])?ext[CASE_PROFILE] as Record<string,unknown>:{};
  if(caseExt.version!==CASE_VERSION)throw new TypeError(`CASE alignment version must be ${CASE_VERSION}.`);
  return createCaseAlignment({
    targetUrl:String(item.targetUrl??''),
    targetType:targetType(item.targetType),
    targetCode:item.targetCode==null?undefined:String(item.targetCode),
    targetFramework:item.targetFramework==null?undefined:String(item.targetFramework),
    targetName:item.targetName==null?undefined:String(item.targetName),
    frameworkUrl:caseExt.frameworkUrl==null?undefined:String(caseExt.frameworkUrl),
    sourceIdentifier:caseExt.sourceIdentifier==null?undefined:String(caseExt.sourceIdentifier),
  });
}

export function caseAlignmentFromCfItem(item:{
  uri:string;
  identifier?:string;
  fullStatement?:string;
  abbreviatedStatement?:string;
  frameworkUri?:string;
  frameworkTitle?:string;
}):P2LRNCaseAlignment{
  return createCaseAlignment({
    targetUrl:item.uri,
    targetType:'CFItem',
    targetCode:item.identifier,
    targetName:item.fullStatement??item.abbreviatedStatement,
    targetFramework:item.frameworkTitle,
    frameworkUrl:item.frameworkUri,
    sourceIdentifier:item.identifier,
  });
}
