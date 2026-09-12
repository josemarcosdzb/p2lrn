export declare const NATIVE_COMPONENT_PROFILE: string;
export declare const NATIVE_COMPONENT_MEDIA_TYPE: "application/vnd.p2lrn.component+json";
export declare const NATIVE_COMPONENT_SCHEMA: string;
export declare const NATIVE_COMPONENT_ACTIVITY_TYPE: "https://p2lrn.org/type/component";
export declare const RUNTIME_CONTRACT_VERSION = "1";
export declare function validateComponentInstance(payload: any): any;
export declare function requireRuntimeContract(payload: any, expected?: string): any;
