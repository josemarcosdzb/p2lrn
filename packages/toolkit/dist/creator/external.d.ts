export declare const EXTERNAL_PROFILE: {
    readonly h5p: "https://p2lrn.org/profile/h5p";
    readonly scorm: "https://p2lrn.org/profile/scorm";
    readonly cmi5: "https://p2lrn.org/profile/cmi5";
    readonly 'common-cartridge': "https://p2lrn.org/profile/common-cartridge";
    readonly 'tincan-package': "https://p2lrn.org/profile/tincan-package";
    readonly 'web-content': "https://p2lrn.org/profile/web-content";
    readonly qti: "https://p2lrn.org/profile/qti";
    readonly lti: "https://p2lrn.org/profile/lti";
};
export type ExternalKind = keyof typeof EXTERNAL_PROFILE;
type Files = Map<string, Uint8Array>;
export declare function detectExternalPackage(files: Files): ExternalKind;
export interface ExternalConvertResult {
    source: string;
    packageRoot?: string;
    detectedFormat: ExternalKind;
    profile: string;
    sourceSha256: string;
    preservedPackageSha256: string;
    preservedBitForBit: boolean;
    details: any;
    entities: number;
    p2lrn: string; /** @deprecated Alpha15 compatibility alias. */
    p2rln?: string;
    validation: any;
    transformation: any;
}
export declare function convertExternalPackage(source: string, output: string, packageRoot?: string): ExternalConvertResult;
export {};
