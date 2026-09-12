export declare const WEB_CONTENT_PROFILE: string;
export declare const LEGACY_WEB_CONTENT_PROFILE: string;
export declare const WEB_CONTENT_MAPPING_EXTENSION: string;
export declare const LEGACY_WEB_CONTENT_MAPPING_EXTENSION: string;
export declare const WEB_CONTENT_EXTENSION_VERSION = "1";
export declare function safeLogicalPath(value: any): string;
export declare function isWebContentProfile(value: string | undefined): boolean;
export declare function validateWebContentMapping(rep: any, inventory: Set<string>): any | null;
