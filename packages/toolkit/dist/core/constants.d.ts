export declare const LEGACY_FORMAT: "P2RLN";
export declare const FORMAT: "P2LRN";
export declare const FORMAT_VERSION: "0.4.0";
export declare const LEGACY_NS: "https://p2rln.org/";
export declare const NS: "https://p2lrn.org/";
declare const PROFILE_SUFFIX: Readonly<{
    course: "course";
    webContent: "web-content";
    qti: "qti";
    h5p: "h5p";
    scorm: "scorm";
    cmi5: "cmi5";
    commonCartridge: "common-cartridge";
    imsContentPackage: "ims-content-package";
    tincan: "tincan-package";
    lti: "lti";
    case: "case";
    xapi: "xapi";
    accessibility: "accessibility";
    nativeQuestionnaire: "native-questionnaire";
    nativeComposite: "native-composite";
    nativeComponent: "native-component";
    multipart: "multipart";
    progression: "progression";
}>;
type ProfileKey = keyof typeof PROFILE_SUFFIX;
/** Canonical P2LRN identifiers emitted by all new Node/TypeScript packages. */
export declare const PROFILE: Readonly<Record<"course" | "webContent" | "qti" | "h5p" | "scorm" | "cmi5" | "commonCartridge" | "imsContentPackage" | "tincan" | "lti" | "case" | "xapi" | "accessibility" | "nativeQuestionnaire" | "nativeComposite" | "nativeComponent" | "multipart" | "progression", string>>;
/** Alpha15/Python identifiers accepted only for backwards compatibility. */
export declare const LEGACY_PROFILE: Readonly<Record<"course" | "webContent" | "qti" | "h5p" | "scorm" | "cmi5" | "commonCartridge" | "imsContentPackage" | "tincan" | "lti" | "case" | "xapi" | "accessibility" | "nativeQuestionnaire" | "nativeComposite" | "nativeComponent" | "multipart" | "progression", string>>;
export declare function canonicalIdentifier(value: string): string;
export declare function legacyIdentifier(value: string): string;
export declare function canonicalizeJsonIdentifiers<T>(value: T): T;
export declare function canonicalProfileId(value: string | undefined): string | undefined;
export declare function profileIs(value: string | undefined, key: ProfileKey): boolean;
export declare function identifierIs(value: unknown, canonical: string): boolean;
export declare const KNOWN_PROFILE_VERSIONS: Readonly<Record<string, readonly string[]>>;
export declare const KNOWN_PROFILES: Set<string>;
export declare const NATIVE: Readonly<{
    questionnaireMediaType: "application/vnd.p2lrn.questionnaire+json";
    compositeMediaType: "application/vnd.p2lrn.composite+json";
    componentMediaType: "application/vnd.p2lrn.component+json";
    compositeActivityType: "https://p2lrn.org/type/composite";
    componentActivityType: "https://p2lrn.org/type/component";
}>;
export declare const LEGACY_NATIVE: Readonly<{
    questionnaireMediaType: "application/vnd.p2rln.questionnaire+json";
    compositeMediaType: "application/vnd.p2rln.composite+json";
    componentMediaType: "application/vnd.p2rln.component+json";
    compositeActivityType: "https://p2rln.org/type/composite";
    componentActivityType: "https://p2rln.org/type/component";
}>;
export {};
