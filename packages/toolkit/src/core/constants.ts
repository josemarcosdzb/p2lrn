export const LEGACY_FORMAT = 'P2RLN' as const;
export const FORMAT = 'P2LRN' as const;
export const FORMAT_VERSION = '0.4.0' as const;

export const LEGACY_NS = 'https://p2rln.org/' as const;
export const NS = 'https://p2lrn.org/' as const;

const PROFILE_SUFFIX = Object.freeze({
  course: 'course',
  webContent: 'web-content',
  qti: 'qti',
  h5p: 'h5p',
  scorm: 'scorm',
  cmi5: 'cmi5',
  commonCartridge: 'common-cartridge',
  imsContentPackage: 'ims-content-package',
  tincan: 'tincan-package',
  lti: 'lti',
  case: 'case',
  xapi: 'xapi',
  accessibility: 'accessibility',
  nativeQuestionnaire: 'native-questionnaire',
  nativeComposite: 'native-composite',
  nativeComponent: 'native-component',
  multipart: 'multipart',
  progression: 'progression',
});

type ProfileKey = keyof typeof PROFILE_SUFFIX;
function profiles(base:string):Record<ProfileKey,string>{
  return Object.fromEntries(Object.entries(PROFILE_SUFFIX).map(([key,suffix])=>[key,`${base}profile/${suffix}`])) as Record<ProfileKey,string>;
}

/** Canonical P2LRN identifiers emitted by all new Node/TypeScript packages. */
export const PROFILE = Object.freeze(profiles(NS));
/** Alpha15/Python identifiers accepted only for backwards compatibility. */
export const LEGACY_PROFILE = Object.freeze(profiles(LEGACY_NS));

export function canonicalIdentifier(value:string):string{
  return String(value)
    .replaceAll(LEGACY_NS, NS)
    .replaceAll('urn:p2rln:', 'urn:p2lrn:')
    .replaceAll('application/vnd.p2rln', 'application/vnd.p2lrn')
    .replaceAll('org.p2rln.', 'org.p2lrn.')
    .replaceAll('p2rlnVersions', 'p2lrnVersions')
    .replaceAll('p2rln:', 'p2lrn:')
    .replaceAll('p2rln.', 'p2lrn.')
    .replaceAll('p2rln_', 'p2lrn_')
    .replaceAll('p2rln-', 'p2lrn-')
    .replaceAll('P2RLN', 'P2LRN');
}

export function legacyIdentifier(value:string):string{
  return String(value)
    .replaceAll(NS, LEGACY_NS)
    .replaceAll('urn:p2lrn:', 'urn:p2rln:')
    .replaceAll('application/vnd.p2lrn', 'application/vnd.p2rln')
    .replaceAll('org.p2lrn.', 'org.p2rln.')
    .replaceAll('p2lrnVersions', 'p2rlnVersions')
    .replaceAll('p2lrn:', 'p2rln:')
    .replaceAll('p2lrn.', 'p2rln.')
    .replaceAll('p2lrn_', 'p2rln_')
    .replaceAll('p2lrn-', 'p2rln-')
    .replaceAll('P2LRN', 'P2RLN');
}

export function canonicalizeJsonIdentifiers<T>(value:T):T{
  if(typeof value==='string') return canonicalIdentifier(value) as T;
  if(Array.isArray(value)) return value.map((item)=>canonicalizeJsonIdentifiers(item)) as T;
  if(value&&typeof value==='object'){
    const out:Record<string,unknown>={};
    for(const [key,item] of Object.entries(value as Record<string,unknown>))out[canonicalIdentifier(key)]=canonicalizeJsonIdentifiers(item);
    return out as T;
  }
  return value;
}

export function canonicalProfileId(value:string|undefined):string|undefined{return value==null?undefined:canonicalIdentifier(value);}
export function profileIs(value:string|undefined,key:ProfileKey):boolean{return canonicalProfileId(value)===PROFILE[key];}
export function identifierIs(value:unknown,canonical:string):boolean{return typeof value==='string'&&canonicalIdentifier(value)===canonicalIdentifier(canonical);}

const canonicalVersions=Object.fromEntries(Object.values(PROFILE).map((id)=>[id,Object.freeze([FORMAT_VERSION])])) as Record<string,readonly string[]>;
const legacyVersions=Object.fromEntries(Object.values(LEGACY_PROFILE).map((id)=>[id,Object.freeze([FORMAT_VERSION])])) as Record<string,readonly string[]>;
export const KNOWN_PROFILE_VERSIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({...canonicalVersions,...legacyVersions});
export const KNOWN_PROFILES = new Set(Object.keys(KNOWN_PROFILE_VERSIONS));

export const NATIVE = Object.freeze({
  questionnaireMediaType: 'application/vnd.p2lrn.questionnaire+json',
  compositeMediaType: 'application/vnd.p2lrn.composite+json',
  componentMediaType: 'application/vnd.p2lrn.component+json',
  compositeActivityType: `${NS}type/composite`,
  componentActivityType: `${NS}type/component`,
});
export const LEGACY_NATIVE = Object.freeze({
  questionnaireMediaType: 'application/vnd.p2rln.questionnaire+json',
  compositeMediaType: 'application/vnd.p2rln.composite+json',
  componentMediaType: 'application/vnd.p2rln.component+json',
  compositeActivityType: `${LEGACY_NS}type/composite`,
  componentActivityType: `${LEGACY_NS}type/component`,
});
